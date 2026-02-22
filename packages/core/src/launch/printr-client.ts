/**
 * Printr API client — multi-chain token launch via Printr (beta).
 *
 * @see https://api-preview.printr.money/v0
 */

const PRINTR_API = 'https://api-preview.printr.money/v0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrintrTokenMetadata {
  name: string;
  symbol: string;
  description: string;
  /** Base64-encoded image (max 500 KB). */
  image: string;
  links?: {
    twitter?: string;
    telegram?: string;
    website?: string;
  };
}

export interface PrintrChainConfig {
  /** CAIP-2 chain identifier, e.g. "eip155:56". */
  chainId: string;
  /** Percentage of supply to buy on launch (0.01 - 69). */
  initialBuyPercent?: number;
  /** Graduation market-cap threshold in USD (69 000 or 250 000). */
  graduationThreshold?: number;
}

export interface PrintrCreator {
  /** CAIP-2 chain identifier. */
  chainId: string;
  /** CAIP-10 account identifier, e.g. "eip155:56:0xabc...". */
  accountId: string;
}

export interface PrintrQuoteResult {
  estimatedCost: number;
  perChain: Array<{
    chainId: string;
    deployFee: number;
    initialBuyCost: number;
  }>;
}

export interface PrintrChainResult {
  chainId: string;
  contractAddress: string;
  /** Hex-encoded calldata that must be signed and submitted on-chain. */
  transactionCalldata: string;
  /** Target contract address to send the transaction to. */
  to: string;
}

export interface PrintrCreateResult {
  tokenId: string;
  perChain: PrintrChainResult[];
}

/** Error thrown when the Printr API returns a non-OK response. */
export class PrintrAPIError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Printr API error ${status}: ${body}`);
    this.name = 'PrintrAPIError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface PrintrRequestBody {
  token: PrintrTokenMetadata;
  chains: PrintrChainConfig[];
  creator: PrintrCreator[];
}

function buildBody(
  metadata: PrintrTokenMetadata,
  chains: PrintrChainConfig[],
  creators: PrintrCreator[],
): PrintrRequestBody {
  return {
    token: metadata,
    chains,
    creator: creators,
  };
}

async function printrFetch<T>(
  path: string,
  body: PrintrRequestBody,
  jwtToken: string,
): Promise<T> {
  const res = await fetch(`${PRINTR_API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwtToken}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new PrintrAPIError(res.status, text);
  }

  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a cost estimate for launching a token across the specified chains.
 */
export async function getPrintQuote(
  metadata: PrintrTokenMetadata,
  chains: PrintrChainConfig[],
  creators: PrintrCreator[],
  jwtToken: string,
): Promise<PrintrQuoteResult> {
  return printrFetch<PrintrQuoteResult>(
    '/print/quote',
    buildBody(metadata, chains, creators),
    jwtToken,
  );
}

/**
 * Create (print) a token across the specified chains.
 *
 * The response contains unsigned transaction calldata for each chain that
 * must be signed by the creator wallet and submitted on-chain.
 */
export async function createPrint(
  metadata: PrintrTokenMetadata,
  chains: PrintrChainConfig[],
  creators: PrintrCreator[],
  jwtToken: string,
): Promise<PrintrCreateResult> {
  return printrFetch<PrintrCreateResult>(
    '/print',
    buildBody(metadata, chains, creators),
    jwtToken,
  );
}
