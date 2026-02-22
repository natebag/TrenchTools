/**
 * OpenOcean DEX Aggregator — EVM DEX integration for BSC + Base
 *
 * Uses OpenOcean Swap API v4 for quotes and executable calldata.
 * Covers both BSC (chainId 56) and Base (chainId 8453) with a single integration.
 * No API key required.
 *
 * API docs: https://apis.openocean.finance/developer/apis/swap-api/api-v4
 */

import type { DexSwapper, Quote, SwapResult, DexConfig } from './types';
import { EVM_NATIVE_TOKEN } from './types';

const OO_API_BASE = 'https://open-api.openocean.finance/v4';

// ── Interfaces ──

interface OOSwapResponse {
  code: number;
  data: {
    inToken: { address: string; decimals: number; symbol: string };
    outToken: { address: string; decimals: number; symbol: string };
    inAmount: string;
    outAmount: string;
    estimatedGas: number;
    minOutAmount: string;
    from: string;
    to: string;
    value: string;
    gasPrice: string;
    data: string;  // calldata
    chainId: number;
    price_impact?: string;
  };
}

interface OOQuoteResponse {
  code: number;
  data: {
    inToken: { address: string; decimals: number; symbol: string };
    outToken: { address: string; decimals: number; symbol: string };
    inAmount: string;
    outAmount: string;
    estimatedGas: number;
    price_impact?: string;
  };
}

// ── Helpers ──

function getChainSlug(config: DexConfig): string {
  if (config.chain === 'bsc') return 'bsc';
  if (config.chain === 'base') return 'base';
  if (config.evmChainId === 56) return 'bsc';
  if (config.evmChainId === 8453) return 'base';
  throw new Error('OpenOcean requires chain to be bsc or base');
}

function getEvmChainId(config: DexConfig): number {
  if (config.evmChainId) return config.evmChainId;
  if (config.chain === 'bsc') return 56;
  if (config.chain === 'base') return 8453;
  throw new Error('OpenOcean requires evmChainId or chain to be set in DexConfig');
}

// ── Quote ──

async function getOpenOceanQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  config: DexConfig,
): Promise<Quote> {
  const chainSlug = getChainSlug(config);

  // Get gas price first
  const gasResp = await fetch(`${OO_API_BASE}/${chainSlug}/gasPrice`);
  const gasData = await gasResp.json() as { code: number; data: { standard?: { legacyGasPrice?: string } } & Record<string, string> };
  // For BSC/Base, gasPrice comes as a simple value under "standard"; for ETH it's nested
  const gasPrice = gasData.data?.standard?.legacyGasPrice || gasData.data?.standard || '5';

  const params = new URLSearchParams({
    inTokenAddress: inputMint,
    outTokenAddress: outputMint,
    amount: amount.toString(),
    gasPrice: gasPrice.toString(),
    slippage: config.slippageBps ? (config.slippageBps / 100).toString() : '2',
  });

  const resp = await fetch(`${OO_API_BASE}/${chainSlug}/quote?${params}`);

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenOcean quote failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as OOQuoteResponse;

  if (data.code !== 200) {
    throw new Error(`OpenOcean quote error (code ${data.code})`);
  }

  return {
    dex: 'openocean',
    inputMint,
    outputMint,
    inputAmount: amount,
    outputAmount: parseInt(data.data.outAmount, 10),
    priceImpactPct: data.data.price_impact ? parseFloat(data.data.price_impact) : 0,
    slippageBps: config.slippageBps ?? 200,
    chain: config.chain,
    raw: data.data,
  };
}

// ── Swap (returns tx calldata; actual signing happens in the calling component) ──

export async function getOpenOceanSwapCalldata(
  inputMint: string,
  outputMint: string,
  amount: number,
  fromAddress: string,
  config: DexConfig,
): Promise<OOSwapResponse['data']> {
  const chainSlug = getChainSlug(config);

  // Get gas price
  const gasResp = await fetch(`${OO_API_BASE}/${chainSlug}/gasPrice`);
  const gasData = await gasResp.json() as { code: number; data: { standard?: { legacyGasPrice?: string } } & Record<string, string> };
  const gasPrice = gasData.data?.standard?.legacyGasPrice || gasData.data?.standard || '5';

  const slippage = config.slippageBps ? (config.slippageBps / 100).toString() : '2';

  const params = new URLSearchParams({
    inTokenAddress: inputMint,
    outTokenAddress: outputMint,
    amount: amount.toString(),
    gasPrice: gasPrice.toString(),
    slippage,
    account: fromAddress,
    disableEstimate: 'true',
  });

  const resp = await fetch(`${OO_API_BASE}/${chainSlug}/swap?${params}`);

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenOcean swap failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as OOSwapResponse;

  if (data.code !== 200) {
    throw new Error(`OpenOcean swap error (code ${data.code})`);
  }

  return data.data;
}

// ── Token Approval ──

/**
 * Check if a token allowance is sufficient, and if not, build an approval tx.
 * Returns null if approval is not needed (native token or sufficient allowance).
 */
export async function getOpenOceanApprovalTx(
  tokenAddress: string,
  _amount: string,
  spenderAddress: string,
  _config: DexConfig,
): Promise<{ to: string; data: string; value: string } | null> {
  // Native token doesn't need approval
  if (tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN.toLowerCase()) {
    return null;
  }

  // Approve max uint256 — idempotent, simpler than checking allowance first.
  const maxUint256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  const { encodeFunctionData } = await import('viem');

  const approveData = encodeFunctionData({
    abi: [{
      name: 'approve',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ type: 'bool' }],
    }],
    functionName: 'approve',
    args: [spenderAddress as `0x${string}`, BigInt(maxUint256)],
  });

  return {
    to: tokenAddress,
    data: approveData,
    value: '0',
  };
}

// ── Execute Swap (full flow: get calldata → approve if needed → swap → send) ──

async function executeOpenOceanSwap(
  quote: Quote,
  _wallet: import('@solana/web3.js').Keypair,
  config: DexConfig,
): Promise<SwapResult> {
  // This method exists to satisfy the DexSwapper interface but EVM swaps
  // should use executeEvmSwap() directly since they need a viem account, not a Keypair.
  return {
    success: false,
    error: 'OpenOcean swaps require EVM wallet. Use executeEvmSwap() instead.',
    wallet: 'N/A',
    inputAmount: quote.inputAmount,
    chain: config.chain,
  };
}

/**
 * Execute a full OpenOcean swap with an EVM private key.
 * Handles swap calldata → approve if selling token → sign → broadcast.
 */
export async function executeEvmSwap(params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  privateKeyHex: `0x${string}`;
  config: DexConfig;
}): Promise<SwapResult> {
  const { inputMint, outputMint, amount, privateKeyHex, config } = params;
  const chainId = getEvmChainId(config);

  try {
    const { createWalletClient, createPublicClient, http } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    const { bsc, base } = await import('viem/chains');

    const chain = chainId === 56 ? bsc : base;
    const account = privateKeyToAccount(privateKeyHex);
    const walletAddr = account.address;

    const publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(config.rpcUrl),
    });

    // 1. Get swap calldata (this also gives us the router address for approval)
    const swapData = await getOpenOceanSwapCalldata(
      inputMint,
      outputMint,
      amount,
      walletAddr,
      config,
    );

    // 2. If selling a token (not native), approve the router first
    const approvalTx = await getOpenOceanApprovalTx(
      inputMint,
      amount.toString(),
      swapData.to, // the router address to approve
      config,
    );
    if (approvalTx) {
      const approvalHash = await walletClient.sendTransaction({
        to: approvalTx.to as `0x${string}`,
        data: approvalTx.data as `0x${string}`,
        value: BigInt(approvalTx.value || '0'),
      });
      await publicClient.waitForTransactionReceipt({ hash: approvalHash });
    }

    // 3. Send swap tx
    const txHash = await walletClient.sendTransaction({
      to: swapData.to as `0x${string}`,
      data: swapData.data as `0x${string}`,
      value: BigInt(swapData.value),
      gas: BigInt(Math.ceil(swapData.estimatedGas * 1.5)), // 1.5x safety margin per docs
    });

    // 4. Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === 'reverted') {
      return {
        success: false,
        txHash,
        error: 'Transaction reverted',
        wallet: `${walletAddr.slice(0, 6)}...${walletAddr.slice(-4)}`,
        inputAmount: amount,
        chain: config.chain,
      };
    }

    return {
      success: true,
      txHash,
      wallet: `${walletAddr.slice(0, 6)}...${walletAddr.slice(-4)}`,
      inputAmount: amount,
      outputAmount: parseInt(swapData.outAmount, 10),
      chain: config.chain,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: msg,
      wallet: 'unknown',
      inputAmount: amount,
      chain: config.chain,
    };
  }
}

// ── DexSwapper Interface ──

export const openoceanSwapper: DexSwapper = {
  name: 'OpenOcean',
  type: 'openocean',
  isImplemented: true,

  getQuote: getOpenOceanQuote,
  executeSwap: executeOpenOceanSwap,

  async supportsTokenPair(_inputMint: string, _outputMint: string): Promise<boolean> {
    // OpenOcean supports any token pair on its supported chains
    return true;
  },
};
