/**
 * Per-chain transaction signing for bridge transactions.
 * Li.Fi returns raw tx data — we sign and broadcast per chain family.
 *
 * Uses dynamic imports to avoid bundling all chain SDKs as hard deps.
 */

import type { ChainId } from '../chains/types.js';
import { getChainFamily } from '../chains/types.js';

export interface SignAndSendResult {
  txHash: string;
}

/**
 * Sign and broadcast a bridge transaction returned by Li.Fi.
 */
export async function signAndSendBridgeTx(
  chain: ChainId,
  transactionRequest: Record<string, unknown>,
  secretKey: Uint8Array,
  rpcUrl: string,
  privateKeyHex?: string,
): Promise<SignAndSendResult> {
  const family = getChainFamily(chain);

  if (family === 'solana') {
    return signAndSendSolana(transactionRequest, secretKey, rpcUrl);
  }
  if (family === 'evm') {
    if (!privateKeyHex) throw new Error('EVM bridge requires privateKeyHex');
    return signAndSendEvm(chain, transactionRequest, privateKeyHex, rpcUrl);
  }
  if (family === 'sui') {
    return signAndSendSui(transactionRequest, secretKey, rpcUrl);
  }

  throw new Error(`Unsupported chain family for bridge: ${family}`);
}

// ── Solana ──

async function signAndSendSolana(
  txRequest: Record<string, unknown>,
  secretKey: Uint8Array,
  rpcUrl: string,
): Promise<SignAndSendResult> {
  const { Connection, Keypair, VersionedTransaction } = await import('@solana/web3.js');
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = Keypair.fromSecretKey(secretKey);

  // Li.Fi returns the serialized tx as base64 in `data`
  const txData = txRequest.data as string;
  if (!txData) throw new Error('No transaction data in Li.Fi response');

  const txBytes = Buffer.from(txData, 'base64');
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([wallet]);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });

  // Poll for confirmation (don't use confirmTransaction — blockhash expiry issues)
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const statusResp = await connection.getSignatureStatuses([sig]);
    const status = statusResp.value[0];
    if (status) {
      if (status.err) throw new Error(`Solana bridge tx failed: ${JSON.stringify(status.err)}`);
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
        return { txHash: sig };
      }
    }
  }

  // Return the hash even if we didn't get confirmation — bridge monitor will track it
  return { txHash: sig };
}

// ── EVM ──

async function signAndSendEvm(
  chain: ChainId,
  txRequest: Record<string, unknown>,
  privateKeyHex: string,
  rpcUrl: string,
): Promise<SignAndSendResult> {
  const { createWalletClient, createPublicClient, http } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const viemChains = await import('viem/chains');

  const viemChain = chain === 'bsc' ? viemChains.bsc : viemChains.base;
  const account = privateKeyToAccount(privateKeyHex as `0x${string}`);
  const publicClient = createPublicClient({ chain: viemChain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: viemChain, transport: http(rpcUrl) });

  const txHash = await walletClient.sendTransaction({
    to: txRequest.to as `0x${string}`,
    value: txRequest.value ? BigInt(txRequest.value as string) : 0n,
    data: txRequest.data as `0x${string}` | undefined,
    gas: txRequest.gasLimit ? BigInt(txRequest.gasLimit as string) : undefined,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status === 'reverted') {
    throw new Error('EVM bridge transaction reverted');
  }

  return { txHash };
}

// ── SUI ──

async function signAndSendSui(
  txRequest: Record<string, unknown>,
  secretKey: Uint8Array,
  rpcUrl: string,
): Promise<SignAndSendResult> {
  const { SuiJsonRpcClient } = await import('@mysten/sui/jsonRpc');
  const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');

  const keypair = Ed25519Keypair.fromSecretKey(secretKey.slice(0, 32));
  const client = new SuiJsonRpcClient({ url: rpcUrl, network: 'mainnet' });

  // Li.Fi returns serialized tx bytes as base64 in `data`
  const txData = txRequest.data as string;
  if (!txData) throw new Error('No transaction data in Li.Fi SUI response');

  const txBytes = Uint8Array.from(Buffer.from(txData, 'base64'));

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: txBytes,
    options: { showEffects: true },
  });

  return { txHash: result.digest };
}
