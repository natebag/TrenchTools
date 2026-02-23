/**
 * Polymarket CLOB client wrapper — trading, positions, approvals.
 * Uses dynamic import of @polymarket/clob-client (only install in packages that need it).
 */

import type {
  PolymarketOrderParams,
  PolymarketOrderResult,
  PolymarketPosition,
} from './types.js';
import { POLYMARKET_CONTRACTS, POLYMARKET_APIS } from './types.js';
import { getMarket } from './gamma.js';

// Cache CLOB client instances per wallet address (24h TTL)
const clientCache = new Map<string, { client: any; expiresAt: number }>();

/**
 * Get or create a CLOB client for a wallet.
 * Uses ethers v5 Wallet as signer, derives API creds, returns authenticated client.
 */
async function getClobClient(privateKeyHex: string): Promise<any> {
  const cacheKey = privateKeyHex.slice(0, 10);
  const cached = clientCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.client;

  const { ClobClient } = await import('@polymarket/clob-client');
  const { Wallet } = await import('ethers');

  const wallet = new Wallet(privateKeyHex);

  // Create initial client with signer (no creds yet — needed for L1 auth to derive keys)
  const tempClient = new ClobClient(
    POLYMARKET_APIS.CLOB,
    POLYMARKET_CONTRACTS.CHAIN_ID,
    wallet,
  );

  // Derive L2 API credentials
  const creds = await tempClient.createOrDeriveApiKey();

  // Create authenticated client with creds
  const client = new ClobClient(
    POLYMARKET_APIS.CLOB,
    POLYMARKET_CONTRACTS.CHAIN_ID,
    wallet,
    creds,
  );

  clientCache.set(cacheKey, {
    client,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });

  return client;
}

/**
 * Approve USDC.e spending for the CTF Exchange (one-time per wallet).
 * Returns tx hash, or null if already approved.
 */
export async function approveUsdc(
  privateKeyHex: string,
  rpcUrl: string,
): Promise<string | null> {
  const { createWalletClient, createPublicClient, http, encodeFunctionData } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { polygon } = await import('viem/chains');

  const account = privateKeyToAccount(privateKeyHex as `0x${string}`);
  const publicClient = createPublicClient({ chain: polygon, transport: http(rpcUrl) });

  // Check current allowance
  const allowanceData = encodeFunctionData({
    abi: [{
      name: 'allowance', type: 'function', stateMutability: 'view',
      inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
      outputs: [{ type: 'uint256' }],
    }],
    functionName: 'allowance',
    args: [account.address, POLYMARKET_CONTRACTS.CTF_EXCHANGE as `0x${string}`],
  });

  const result = await publicClient.call({
    to: POLYMARKET_CONTRACTS.USDC_E as `0x${string}`,
    data: allowanceData,
  });

  const currentAllowance = BigInt(result.data || '0x0');
  const threshold = BigInt(1_000_000_000); // 1000 USDC

  if (currentAllowance >= threshold) return null; // Already approved

  // Approve max
  const walletClient = createWalletClient({ account, chain: polygon, transport: http(rpcUrl) });
  const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

  const approveData = encodeFunctionData({
    abi: [{
      name: 'approve', type: 'function', stateMutability: 'nonpayable',
      inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
      outputs: [{ type: 'bool' }],
    }],
    functionName: 'approve',
    args: [POLYMARKET_CONTRACTS.CTF_EXCHANGE as `0x${string}`, maxUint256],
  });

  const txHash = await walletClient.sendTransaction({
    to: POLYMARKET_CONTRACTS.USDC_E as `0x${string}`,
    data: approveData,
    value: 0n,
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

/**
 * Place a Polymarket order via CLOB API.
 */
export async function placeOrder(
  privateKeyHex: string,
  params: PolymarketOrderParams,
): Promise<PolymarketOrderResult> {
  try {
    const client = await getClobClient(privateKeyHex);
    const { Side } = await import('@polymarket/clob-client');

    const side = params.side === 'BUY' ? Side.BUY : Side.SELL;

    let result;
    if (params.isMarketOrder) {
      // UserMarketOrder: amount = USDC for BUY, shares for SELL
      result = await client.createAndPostMarketOrder({
        tokenID: params.tokenId,
        price: params.price,
        amount: params.size,
        side,
      });
    } else {
      // UserOrder: size = shares
      result = await client.createAndPostOrder({
        tokenID: params.tokenId,
        price: params.price,
        size: params.size,
        side,
      });
    }

    return {
      success: true,
      orderId: result?.orderID || result?.id,
      filledSize: result?.filledSize,
      avgPrice: result?.avgPrice,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Order placement failed',
    };
  }
}

/**
 * Get open positions for a wallet via the Data API.
 */
export async function getPositions(
  privateKeyHex: string,
): Promise<PolymarketPosition[]> {
  try {
    const { privateKeyToAccount } = await import('viem/accounts');
    const account = privateKeyToAccount(privateKeyHex as `0x${string}`);

    // Fetch positions from Data API (public, no auth needed)
    const resp = await fetch(
      `${POLYMARKET_APIS.DATA}/positions?user=${account.address}&sizeThreshold=0.1`,
    );
    if (!resp.ok) return [];

    const data = await resp.json() as any[];
    const positions: PolymarketPosition[] = [];

    for (const pos of data) {
      const conditionId = pos.conditionId || pos.asset?.conditionId || '';
      const market = conditionId ? await getMarket(conditionId).catch(() => null) : null;

      positions.push({
        conditionId,
        tokenId: pos.asset?.tokenId || pos.tokenId || '',
        outcome: pos.outcome || pos.asset?.outcome || 'Unknown',
        question: market?.question || pos.title || conditionId,
        size: parseFloat(pos.size || '0'),
        avgPrice: parseFloat(pos.avgPrice || '0'),
        currentPrice: parseFloat(pos.curPrice || pos.currentPrice || '0'),
        pnl: parseFloat(pos.pnl || '0'),
        pnlPercent: parseFloat(pos.pnlPercent || '0'),
        resolved: pos.resolved,
      });
    }

    return positions;
  } catch {
    return [];
  }
}

/**
 * Claim winnings on a resolved market by redeeming CTF tokens.
 */
export async function claimWinnings(
  privateKeyHex: string,
  conditionId: string,
  rpcUrl: string,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const { createWalletClient, createPublicClient, http, encodeFunctionData } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    const { polygon } = await import('viem/chains');

    const account = privateKeyToAccount(privateKeyHex as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: polygon, transport: http(rpcUrl) });
    const publicClient = createPublicClient({ chain: polygon, transport: http(rpcUrl) });

    const redeemData = encodeFunctionData({
      abi: [{
        name: 'redeemPositions',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'collateralToken', type: 'address' },
          { name: 'parentCollectionId', type: 'bytes32' },
          { name: 'conditionId', type: 'bytes32' },
          { name: 'indexSets', type: 'uint256[]' },
        ],
        outputs: [],
      }],
      functionName: 'redeemPositions',
      args: [
        POLYMARKET_CONTRACTS.USDC_E as `0x${string}`,
        '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
        conditionId as `0x${string}`,
        [1n, 2n],
      ],
    });

    const txHash = await walletClient.sendTransaction({
      to: POLYMARKET_CONTRACTS.CTF_TOKEN as `0x${string}`,
      data: redeemData,
      value: 0n,
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return { success: true, txHash };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Claim failed',
    };
  }
}
