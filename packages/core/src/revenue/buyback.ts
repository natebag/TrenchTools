/**
 * Buyback Module - Treasury token purchases
 */

export interface BuyBackConfig {
  treasuryWallet: string;
  tokenMint: string;
  maxSol: number; // Max SOL to spend
  maxPrice: number; // Don't buy above this price
  minLiquidity: number; // Minimum liquidity USD
  slippageBps: number; // 50 = 0.5%
  timeWindowMinutes: number; // Spread buys over time
}

export interface BuyBackOrder {
  id: string;
  amount: bigint;
  maxPrice: number;
  status: 'pending' | 'executed' | 'failed' | 'cancelled';
  createdAt: number;
  executedAt?: number;
  txSignature?: string;
}

export interface BuyBackResult {
  success: boolean;
  order?: BuyBackOrder;
  tokensBought: bigint;
  solSpent: number;
  avgPrice: number;
  error?: string;
}

/**
 * Plan buyback strategy
 */
export function planBuyback(
  config: BuyBackConfig,
  currentPrice: number,
  currentLiquidity: number
): {
  shouldBuy: boolean;
  amount: bigint;
  reason: string;
} {
  // Check price limit
  if (currentPrice > config.maxPrice) {
    return {
      shouldBuy: false,
      amount: BigInt(0),
      reason: `Price ${currentPrice} > max ${config.maxPrice}`,
    };
  }

  // Check liquidity
  if (currentLiquidity < config.minLiquidity) {
    return {
      shouldBuy: false,
      amount: BigInt(0),
      reason: `Liquidity too low ${currentLiquidity} < ${config.minLiquidity}`,
    };
  }

  // Calculate optimal buy amount
  const optimalBuy = config.maxSol / currentPrice;
  
  return {
    shouldBuy: true,
    amount: BigInt(Math.floor(optimalBuy)),
    reason: 'Within budget and limits',
  };
}

/**
 * Execute buyback
 */
export async function executeBuyback(
  config: BuyBackConfig,
  plan: ReturnType<typeof planBuyback>,
  executeTrade: (amount: bigint, slippage: number) => Promise<{ success: boolean; tx?: string; tokensReceived?: bigint; price?: number; error?: string }>
): Promise<BuyBackResult> {
  if (!plan.shouldBuy) {
    return {
      success: false,
      tokensBought: BigInt(0),
      solSpent: 0,
      avgPrice: 0,
      error: plan.reason,
    };
  }

  const order: BuyBackOrder = {
    id: `buyback-${Date.now()}`,
    amount: plan.amount,
    maxPrice: config.maxPrice,
    status: 'pending',
    createdAt: Date.now(),
  };

  try {
    // Execute the trade via router
    const result = await executeTrade(plan.amount, config.slippageBps);

    if (!result.success) {
      order.status = 'failed';
      return {
        success: false,
        order,
        tokensBought: BigInt(0),
        solSpent: 0,
        avgPrice: 0,
        error: result.error || 'Trade execution failed',
      };
    }

    order.status = 'executed';
    order.executedAt = Date.now();
    order.txSignature = result.tx;

    return {
      success: true,
      order,
      tokensBought: result.tokensReceived || BigInt(0),
      solSpent: config.maxSol,
      avgPrice: result.price || 0,
    };
  } catch (error: any) {
    order.status = 'failed';
    return {
      success: false,
      order,
      tokensBought: BigInt(0),
      solSpent: 0,
      avgPrice: 0,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Buyback scheduler for DCA-style buys
 */
export class BuybackScheduler {
  private config: BuyBackConfig;
  private completed: BuyBackOrder[] = [];
  private budgetRemaining: number;

  constructor(config: BuyBackConfig) {
    this.config = { ...config };
    this.budgetRemaining = config.maxSol;
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(): number {
    return this.budgetRemaining;
  }

  /**
   * Add completed order
   */
  recordOrder(order: BuyBackOrder, solSpent: number) {
    this.completed.push(order);
    this.budgetRemaining -= solSpent;
  }

  /**
   * Get all completed orders
   */
  getCompletedOrders(): BuyBackOrder[] {
    return [...this.completed];
  }

  /**
   * Total spent
   */
  getTotalSpent(): number {
    return this.config.maxSol - this.budgetRemaining;
  }

  /**
   * Should continue buying?
   */
  shouldContinue(): boolean {
    return this.budgetRemaining > 0.1; // Min 0.1 SOL
  }

  /**
   * Format status
   */
  formatStatus(): string {
    const spent = this.getTotalSpent();
    const orders = this.completed.length;
    
    return `💰 Buyback Status\n` +
      `Budget: ${this.config.maxSol} SOL\n` +
      `Spent: ${spent.toFixed(4)} SOL\n` +
      `Remaining: ${this.budgetRemaining.toFixed(4)} SOL\n` +
      `Orders: ${orders}`;
  }
}

/**
 * Validate buyback config
 */
export function validateConfig(config: Partial<BuyBackConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.treasuryWallet) {
    errors.push('treasuryWallet required');
  }
  if (!config.tokenMint) {
    errors.push('tokenMint required');
  }
  if ((config.maxSol || 0) <= 0) {
    errors.push('maxSol must be > 0');
  }
  if ((config.maxPrice || 0) <= 0) {
    errors.push('maxPrice must be > 0');
  }
  if ((config.minLiquidity || 0) < 1000) {
    errors.push('minLiquidity should be >= $1000');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format buyback result
 */
export function formatBuybackResult(result: BuyBackResult): string {
  if (result.success) {
    return `✅ Buyback Executed\n` +
      `Order: ${result.order?.id}\n` +
      `Tokens: ${result.tokensBought.toString()}\n` +
      `SOL Spent: ${result.solSpent.toFixed(4)}\n` +
      `Avg Price: ${result.avgPrice.toFixed(8)}\n` +
      `Tx: ${result.order?.txSignature?.slice(0, 16)}...`;
  }
  return `❌ Buyback Failed\n` +
    `Error: ${result.error}`;
}

/**
 * Create default config
 */
export function createDefaultConfig(
  treasury: string,
  token: string
): BuyBackConfig {
  return {
    treasuryWallet: treasury,
    tokenMint: token,
    maxSol: 10, // 10 SOL default
    maxPrice: 0.001, // Low price for microcap
    minLiquidity: 5000, // $5k min liquidity
    slippageBps: 100, // 1%
    timeWindowMinutes: 60, // 1 hour spread
  };
}
