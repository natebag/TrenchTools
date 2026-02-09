/**
 * PumpFun Token Creation
 * TrenchSniper OS - Create and deploy tokens on PumpFun bonding curve
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

import { PUMPFUN_PROGRAM_ID } from './pumpfun.js';

interface UploadResponse {
  metadataUri?: string;
  hash?: string;
}

// ============ Constants ============

const IPFS_GATEWAY = 'https://pump.mypinata.cloud/ipfs/';
const PUMP_FUN_API = 'https://pump.fun/api';

// Instruction discriminator for create
const CREATE_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);

// ============ Types ============

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image?: string | Buffer;  // URL or file buffer
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface CreateTokenParams {
  wallet: Keypair;
  metadata: TokenMetadata;
  initialBuyAmount?: bigint;  // Optional initial buy in lamports
  priorityFeeLamports?: number;
}

export interface CreateTokenResult {
  signature: string;
  mint: PublicKey;
  bondingCurve: PublicKey;
  metadataUri: string;
  timestamp: number;
}

export interface UploadMetadataResult {
  uri: string;
  name: string;
  symbol: string;
}

// ============ Error Classes ============

export class CreateTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreateTokenError';
  }
}

export class MetadataUploadError extends Error {
  constructor(message: string) {
    super(`Failed to upload metadata: ${message}`);
    this.name = 'MetadataUploadError';
  }
}

// ============ Metadata Upload ============

/**
 * Upload token image to IPFS via pump.fun
 */
export async function uploadImage(
  imageBuffer: Buffer,
  filename: string = 'token.png'
): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
  formData.append('file', blob, filename);

  const response = await fetch(`${PUMP_FUN_API}/ipfs`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new MetadataUploadError(`Image upload failed: ${response.status}`);
  }

  const data = await response.json() as UploadResponse;
  return data.metadataUri || `${IPFS_GATEWAY}${data.hash || ''}`;
}

/**
 * Upload token metadata to IPFS via pump.fun
 */
export async function uploadMetadata(
  metadata: TokenMetadata
): Promise<UploadMetadataResult> {
  // Handle image upload if buffer provided
  let imageUri = metadata.image;
  if (metadata.image instanceof Buffer) {
    imageUri = await uploadImage(metadata.image);
  }

  const metadataJson = {
    name: metadata.name,
    symbol: metadata.symbol,
    description: metadata.description,
    image: imageUri,
    showName: true,
    createdOn: 'pump.fun',
    ...(metadata.twitter && { twitter: metadata.twitter }),
    ...(metadata.telegram && { telegram: metadata.telegram }),
    ...(metadata.website && { website: metadata.website }),
  };

  const formData = new FormData();
  formData.append('file', new Blob([JSON.stringify(metadataJson)], { type: 'application/json' }));
  formData.append('name', metadata.name);
  formData.append('symbol', metadata.symbol);
  formData.append('description', metadata.description);

  const response = await fetch(`${PUMP_FUN_API}/ipfs`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new MetadataUploadError(`Metadata upload failed: ${response.status}`);
  }

  const data = await response.json() as UploadResponse;
  return {
    uri: data.metadataUri || '',
    name: metadata.name,
    symbol: metadata.symbol,
  };
}

// ============ Token Creation Client ============

export class TokenCreator {
  constructor(private readonly connection: Connection) {}

  /**
   * Get global config PDA
   */
  private getGlobalConfigAddress(): PublicKey {
    const [globalConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from('global')],
      PUMPFUN_PROGRAM_ID
    );
    return globalConfig;
  }

  /**
   * Get mint authority PDA
   */
  private getMintAuthority(): PublicKey {
    const [mintAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from('mint-authority')],
      PUMPFUN_PROGRAM_ID
    );
    return mintAuthority;
  }

  /**
   * Get bonding curve PDA for a mint
   */
  private getBondingCurveAddress(mint: PublicKey): PublicKey {
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), mint.toBytes()],
      PUMPFUN_PROGRAM_ID
    );
    return bondingCurve;
  }

  /**
   * Get metadata PDA (Metaplex)
   */
  private getMetadataAddress(mint: PublicKey): PublicKey {
    const METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const [metadata] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        METADATA_PROGRAM.toBytes(),
        mint.toBytes(),
      ],
      METADATA_PROGRAM
    );
    return metadata;
  }

  /**
   * Get event authority PDA
   */
  private getEventAuthority(): PublicKey {
    const [eventAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from('__event_authority')],
      PUMPFUN_PROGRAM_ID
    );
    return eventAuthority;
  }

  /**
   * Build create token instruction
   */
  private buildCreateInstruction(
    creator: PublicKey,
    mint: PublicKey,
    bondingCurve: PublicKey,
    associatedBondingCurve: PublicKey,
    metadata: UploadMetadataResult
  ): TransactionInstruction {
    // Encode instruction data
    const nameBuffer = Buffer.alloc(32);
    Buffer.from(metadata.name).copy(nameBuffer);
    
    const symbolBuffer = Buffer.alloc(10);
    Buffer.from(metadata.symbol).copy(symbolBuffer);
    
    const uriBuffer = Buffer.alloc(200);
    Buffer.from(metadata.uri).copy(uriBuffer);

    const data = Buffer.alloc(8 + 32 + 10 + 200);
    CREATE_DISCRIMINATOR.copy(data, 0);
    nameBuffer.copy(data, 8);
    symbolBuffer.copy(data, 40);
    uriBuffer.copy(data, 50);

    const METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const SYSVAR_RENT = new PublicKey('SysvarRent111111111111111111111111111111111');

    const keys = [
      { pubkey: mint, isSigner: true, isWritable: true },
      { pubkey: this.getMintAuthority(), isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: this.getGlobalConfigAddress(), isSigner: false, isWritable: false },
      { pubkey: METADATA_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: this.getMetadataAddress(mint), isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT, isSigner: false, isWritable: false },
      { pubkey: this.getEventAuthority(), isSigner: false, isWritable: false },
      { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: PUMPFUN_PROGRAM_ID,
      data,
    });
  }

  /**
   * Create a new token on PumpFun
   */
  async createToken(params: CreateTokenParams): Promise<CreateTokenResult> {
    const { wallet, metadata, priorityFeeLamports } = params;

    // 1. Upload metadata to IPFS
    const uploadedMetadata = await uploadMetadata(metadata);

    // 2. Generate new mint keypair
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;

    // 3. Derive PDAs
    const bondingCurve = this.getBondingCurveAddress(mint);
    const associatedBondingCurve = await getAssociatedTokenAddress(
      mint,
      bondingCurve,
      true
    );

    // 4. Build transaction
    const transaction = new Transaction();

    // Add priority fee if specified
    if (priorityFeeLamports && priorityFeeLamports > 0) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFeeLamports,
        })
      );
    }

    // Add create instruction
    transaction.add(
      this.buildCreateInstruction(
        wallet.publicKey,
        mint,
        bondingCurve,
        associatedBondingCurve,
        uploadedMetadata
      )
    );

    // 5. Get recent blockhash
    const { blockhash, lastValidBlockHeight } = 
      await this.connection.getLatestBlockhash('confirmed');

    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = wallet.publicKey;

    // 6. Sign with both wallet and mint keypair
    transaction.sign(wallet, mintKeypair);

    // 7. Send and confirm
    const signature = await this.connection.sendRawTransaction(
      transaction.serialize(),
      { skipPreflight: false, maxRetries: 2 }
    );

    const confirmation = await this.connection.confirmTransaction(
      signature,
      'confirmed'
    );

    if (confirmation.value.err) {
      throw new CreateTokenError(
        `Token creation failed: ${JSON.stringify(confirmation.value.err)}`
      );
    }

    return {
      signature,
      mint,
      bondingCurve,
      metadataUri: uploadedMetadata.uri,
      timestamp: Date.now(),
    };
  }
}

// ============ Standalone Functions ============

let defaultCreator: TokenCreator | null = null;

function getDefaultCreator(connection: Connection): TokenCreator {
  if (!defaultCreator) {
    defaultCreator = new TokenCreator(connection);
  }
  return defaultCreator;
}

/**
 * Create a new token on PumpFun bonding curve
 */
export async function createToken(
  connection: Connection,
  params: CreateTokenParams
): Promise<CreateTokenResult> {
  return getDefaultCreator(connection).createToken(params);
}

// uploadMetadata and uploadImage are already exported above
