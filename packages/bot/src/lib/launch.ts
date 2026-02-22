/**
 * PumpFun token launching and creator fee claiming for the Telegram bot.
 *
 * Uses the PumpPortal API (https://pumpportal.fun/api/trade-local) for
 * transaction building and the PumpFun IPFS API for metadata uploads.
 *
 * Launch flow:
 *   1. Upload image + metadata to IPFS via pump.fun
 *   2. Generate a mint keypair
 *   3. POST "create" action to PumpPortal -> unsigned VersionedTransaction
 *   4. Sign with BOTH creator + mint keypairs
 *   5. Send + poll for confirmation
 *
 * Creator fee claim flow:
 *   1. POST "collectCreatorFee" action to PumpPortal -> unsigned tx
 *   2. Sign with creator keypair only
 *   3. Send + poll for confirmation
 */

import {
  Connection,
  Keypair,
  VersionedTransaction,
} from '@solana/web3.js';
import type { Api } from 'grammy';

const PUMPPORTAL_API_URL = 'https://pumpportal.fun/api/trade-local';
const PUMP_FUN_IPFS_URL = 'https://pump.fun/api/ipfs';

// ============ Interfaces ============

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface LaunchParams {
  creatorKeypair: Keypair;
  metadata: TokenMetadata;
  imageBuffer: Buffer;
  imageFilename: string;
  initialBuySol?: number;
  slippagePct?: number;   // default 50
  priorityFee?: number;   // default 0.001
}

export interface LaunchResult {
  success: boolean;
  mintAddress?: string;
  txHash?: string;
  metadataUri?: string;
  error?: string;
}

export interface ClaimFeesResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

// ============ Telegram File Download ============

/**
 * Download a file from Telegram servers using the Bot API.
 * Returns the raw Buffer of the file contents.
 */
export async function downloadTelegramFile(
  api: Api,
  fileId: string,
  botToken: string,
): Promise<Buffer> {
  const file = await api.getFile(fileId);
  const filePath = file.file_path;
  if (!filePath) {
    throw new Error('Telegram getFile returned no file_path');
  }
  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download Telegram file (${resp.status}): ${resp.statusText}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

// ============ IPFS Upload ============

/**
 * Upload token image + metadata to IPFS via pump.fun's API.
 * Returns the metadata URI (ipfs://... or https://...).
 */
export async function uploadToIPFS(
  metadata: TokenMetadata,
  imageBuffer: Buffer,
  imageFilename: string,
): Promise<string> {
  const formData = new FormData();

  // Image as Blob
  const blob = new Blob([imageBuffer]);
  formData.append('file', blob, imageFilename);

  // Metadata fields
  formData.append('name', metadata.name);
  formData.append('symbol', metadata.symbol);
  formData.append('description', metadata.description);
  formData.append('showName', 'true');

  if (metadata.twitter) formData.append('twitter', metadata.twitter);
  if (metadata.telegram) formData.append('telegram', metadata.telegram);
  if (metadata.website) formData.append('website', metadata.website);

  const resp = await fetch(PUMP_FUN_IPFS_URL, {
    method: 'POST',
    body: formData,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`IPFS upload failed (${resp.status}): ${text}`);
  }

  const data = await resp.json() as { metadataUri: string };
  if (!data.metadataUri) {
    throw new Error('IPFS upload response missing metadataUri');
  }

  return data.metadataUri;
}

// ============ Token Launch ============

/**
 * Launch a new token on PumpFun's bonding curve.
 *
 * 1. Upload metadata to IPFS
 * 2. Generate mint keypair
 * 3. Build tx via PumpPortal
 * 4. Sign with BOTH creator + mint keypairs
 * 5. Send + confirm
 */
export async function launchToken(
  connection: Connection,
  params: LaunchParams,
): Promise<LaunchResult> {
  try {
    // 1. Upload metadata to IPFS
    const metadataUri = await uploadToIPFS(
      params.metadata,
      params.imageBuffer,
      params.imageFilename,
    );

    // 2. Generate mint keypair
    const mintKeypair = Keypair.generate();

    // 3. Build transaction via PumpPortal API
    const response = await fetch(PUMPPORTAL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: params.creatorKeypair.publicKey.toBase58(),
        action: 'create',
        tokenMetadata: {
          name: params.metadata.name,
          symbol: params.metadata.symbol,
          uri: metadataUri,
        },
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: 'true',
        amount: params.initialBuySol ?? 0,
        slippage: params.slippagePct ?? 50,
        priorityFee: params.priorityFee ?? 0.001,
        pool: 'pump',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PumpPortal create failed (${response.status}): ${errorText}`);
    }

    // 4. Response is raw bytes of a VersionedTransaction
    const txBytes = new Uint8Array(await response.arrayBuffer());
    const tx = VersionedTransaction.deserialize(txBytes);

    // CRITICAL: Sign with BOTH creator and mint keypairs
    tx.sign([params.creatorKeypair, mintKeypair]);

    // 5. Send transaction
    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    // 6. Poll for confirmation (12 x 2.5s = 30s)
    let txConfirmed = false;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 2500));
      const statusResp = await connection.getSignatureStatuses([signature]);
      const status = statusResp.value[0];
      if (status) {
        if (status.err) {
          throw new Error(`Launch transaction failed on-chain: ${JSON.stringify(status.err)}`);
        }
        if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
          txConfirmed = true;
          break;
        }
      }
    }

    if (!txConfirmed) {
      throw new Error(`Launch transaction not confirmed after 30s (sig: ${signature.slice(0, 20)}...). May have been dropped.`);
    }

    return {
      success: true,
      mintAddress: mintKeypair.publicKey.toBase58(),
      txHash: signature,
      metadataUri,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown launch error';
    return {
      success: false,
      error: message,
    };
  }
}

// ============ Creator Fee Claim ============

/**
 * Claim accumulated PumpFun creator fees.
 * PumpFun charges a dynamic fee (0.05%-0.95% based on market cap) on trades
 * of tokens you created. This claims ALL accumulated fees at once.
 */
export async function claimCreatorFees(
  connection: Connection,
  creatorKeypair: Keypair,
  priorityFee?: number,
): Promise<ClaimFeesResult> {
  try {
    // 1. Build transaction via PumpPortal API
    const response = await fetch(PUMPPORTAL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: creatorKeypair.publicKey.toBase58(),
        action: 'collectCreatorFee',
        priorityFee: priorityFee ?? 0.000001,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PumpPortal collectCreatorFee failed (${response.status}): ${errorText}`);
    }

    // 2. Deserialize transaction bytes
    const txBytes = new Uint8Array(await response.arrayBuffer());
    const tx = VersionedTransaction.deserialize(txBytes);

    // 3. Sign with creator keypair only
    tx.sign([creatorKeypair]);

    // 4. Send transaction
    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    // 5. Poll for confirmation (8 x 2.5s = 20s)
    let txConfirmed = false;
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 2500));
      const statusResp = await connection.getSignatureStatuses([signature]);
      const status = statusResp.value[0];
      if (status) {
        if (status.err) {
          throw new Error(`Claim fee transaction failed on-chain: ${JSON.stringify(status.err)}`);
        }
        if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
          txConfirmed = true;
          break;
        }
      }
    }

    if (!txConfirmed) {
      throw new Error(`Claim fee transaction not confirmed after 20s (sig: ${signature.slice(0, 20)}...). May have been dropped.`);
    }

    return {
      success: true,
      txHash: signature,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown claim fees error';
    return {
      success: false,
      error: message,
    };
  }
}
