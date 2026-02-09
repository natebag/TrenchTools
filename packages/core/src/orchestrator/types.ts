/**
 * TrenchSniper Orchestrator Types
 * Bot state machine, configuration, and statistics types for the orchestrator module.
 * Integrated from Marketchoomba (@orbitmm/core)
 */

// ============ Bot State Machine ============

/**
 * Bot lifecycle states.
 * 
 * State transitions:
 *   idle → starting → running → paused → running (resume)
 *                  ↓           ↓
 *               stopped     stopped
 *                  ↓           ↓
 *                error       error
 */
export type BotState = 
  | 'idle'      // Initial state, not yet started
  | 'starting'  // Transitioning to running
  | 'running'   // Actively executing swaps
  | 'paused'    // Temporarily halted, state preserved
  | 'stopping'  // Transitioning to stopped
  | 'stopped'   // Permanently stopped
  | 'error';    // Error state, requires intervention

// ============ Bot Configuration ============

export interface BotConfig {
  /** Target token mint address */
  targetToken: string;
  
  /** Trade direction: buy only, sell only, or both */
  direction: 'buy' | 'sell' | 'both';
  
  // Swap sizing
  /** Minimum swap amount in SOL */
  minSwapSol: number;
  /** Maximum swap amount in SOL */
  maxSwapSol: number;
  
  // Timing
  /** Minimum delay between swaps in milliseconds */
  minIntervalMs: number;
  /** Maximum delay between swaps in milliseconds */
  maxIntervalMs: number;
  
  // Optional limits
  /** Maximum swaps per hour (optional) */
  maxSwapsPerHour?: number;
  /** Maximum total volume in SOL (optional) */
  maxTotalVolumeSol?: number;
  /** Stop after this many swaps (optional) */
  stopAfterSwaps?: number;
}

// ============ Bot Statistics ============

export interface BotStats {
  /** Total swap attempts */
  swapsAttempted: number;
  /** Successful swaps */
  swapsSuccessful: number;
  /** Failed swaps */
  swapsFailed: number;
  /** Total volume traded in SOL */
  totalVolumeSol: number;
  /** Total tokens bought */
  totalTokensBought: number;
  /** Total tokens sold */
  totalTokensSold: number;
  /** Last 10 errors for debugging */
  errors: string[];
  /** Timestamp when bot started (null if never started) */
  startedAt: number | null;
  /** Timestamp of last swap (null if no swaps yet) */
  lastSwapAt: number | null;
}

// ============ Bot Snapshot ============

export interface BotSnapshot {
  /** Unique bot identifier */
  id: string;
  /** Public key of the bot's wallet */
  walletPublicKey: string;
  /** Current state */
  state: BotState;
  /** Bot configuration */
  config: BotConfig;
  /** Bot statistics */
  stats: BotStats;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

// ============ Orchestrator Configuration ============

export interface OrchestratorConfig {
  /** Maximum concurrent swaps across all bots (default: 50) */
  maxConcurrentSwaps: number;
  /** RPC endpoints for load balancing */
  rpcEndpoints: string[];
  /** Default configuration for new bots */
  defaultBotConfig: Partial<BotConfig>;
  /** Persistence settings */
  persistence: {
    /** Enable WAL and snapshots */
    enabled: boolean;
    /** Path to WAL file */
    walPath: string;
    /** Snapshot interval in milliseconds */
    snapshotIntervalMs: number;
  };
}

// ============ Orchestrator Statistics ============

export interface OrchestratorStats {
  /** Total number of bots */
  totalBots: number;
  /** Currently running bots */
  activeBots: number;
  /** Paused bots */
  pausedBots: number;
  /** Stopped bots */
  stoppedBots: number;
  /** Bots in error state */
  errorBots: number;
  /** Total swaps executed across all bots */
  totalSwapsExecuted: number;
  /** Total volume in SOL across all bots */
  totalVolumeSol: number;
  /** Orchestrator uptime in seconds */
  uptime: number;
}

// ============ WAL Types ============

export type WALEntryType =
  | 'bot_created'
  | 'bot_started'
  | 'bot_paused'
  | 'bot_resumed'
  | 'bot_stopped'
  | 'bot_error'
  | 'swap_initiated'
  | 'swap_completed'
  | 'swap_failed'
  | 'config_updated';

export interface WALEntry {
  /** Unique entry ID */
  id: string;
  /** Entry timestamp */
  timestamp: number;
  /** Entry type */
  type: WALEntryType;
  /** Type-specific payload */
  data: unknown;
  /** SHA-256 checksum for integrity */
  checksum: string;
}

export interface OrchestratorSnapshot {
  /** Snapshot version */
  version: number;
  /** Snapshot timestamp */
  timestamp: number;
  /** All bot snapshots */
  bots: BotSnapshot[];
  /** Orchestrator stats at snapshot time */
  stats: OrchestratorStats;
}

// ============ Event Types ============

export type OrchestratorEvent =
  | 'bot:created'
  | 'bot:started'
  | 'bot:paused'
  | 'bot:resumed'
  | 'bot:stopped'
  | 'bot:error'
  | 'swap:initiated'
  | 'swap:completed'
  | 'swap:failed'
  | 'orchestrator:started'
  | 'orchestrator:stopped'
  | 'orchestrator:recovered';

export interface SwapEventData {
  botId: string;
  wallet: string;
  token: string;
  direction: 'buy' | 'sell';
  amountSol: number;
  signature?: string;
  error?: string;
  timestamp: number;
}

export interface BotEventData {
  botId: string;
  state: BotState;
  previousState?: BotState;
  reason?: string;
  timestamp: number;
}

// ============ RPC Pool Types ============

export interface RPCEndpoint {
  /** RPC URL */
  url: string;
  /** Weight for load balancing (higher = more traffic) */
  weight: number;
  /** Rate limit (requests per second) */
  rateLimit: number;
  /** Whether endpoint is currently healthy */
  healthy: boolean;
  /** Last health check timestamp */
  lastHealthCheck: number;
  /** Current active request count */
  activeRequests: number;
}

export type RPCPoolStrategy = 'round-robin' | 'least-loaded' | 'random';

export interface RPCPoolConfig {
  /** Available endpoints */
  endpoints: Omit<RPCEndpoint, 'healthy' | 'lastHealthCheck' | 'activeRequests'>[];
  /** Load balancing strategy */
  strategy: RPCPoolStrategy;
  /** Health check interval in milliseconds */
  healthCheckIntervalMs: number;
  /** Request timeout in milliseconds */
  requestTimeoutMs: number;
}

// ============ Helper Functions ============

/**
 * Create default bot stats
 */
export function createDefaultBotStats(): BotStats {
  return {
    swapsAttempted: 0,
    swapsSuccessful: 0,
    swapsFailed: 0,
    totalVolumeSol: 0,
    totalTokensBought: 0,
    totalTokensSold: 0,
    errors: [],
    startedAt: null,
    lastSwapAt: null,
  };
}

/**
 * Create default orchestrator config
 */
export function createDefaultOrchestratorConfig(): OrchestratorConfig {
  return {
    maxConcurrentSwaps: 50,
    rpcEndpoints: ['https://api.mainnet-beta.solana.com'],
    defaultBotConfig: {
      direction: 'both',
      minSwapSol: 0.01,
      maxSwapSol: 0.1,
      minIntervalMs: 30000,  // 30 seconds
      maxIntervalMs: 120000, // 2 minutes
    },
    persistence: {
      enabled: true,
      walPath: './data/orchestrator.wal',
      snapshotIntervalMs: 300000, // 5 minutes
    },
  };
}

/**
 * Check if a state transition is valid
 */
export function isValidStateTransition(from: BotState, to: BotState): boolean {
  const validTransitions: Record<BotState, BotState[]> = {
    idle: ['starting', 'stopped'],
    starting: ['running', 'error', 'stopped'],
    running: ['paused', 'stopping', 'error'],
    paused: ['running', 'stopping', 'stopped'],
    stopping: ['stopped', 'error'],
    stopped: [], // Terminal state
    error: ['idle', 'stopped'], // Can recover or stop
  };
  
  return validTransitions[from]?.includes(to) ?? false;
}
