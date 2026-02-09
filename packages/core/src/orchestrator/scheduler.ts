/**
 * TrenchSniper Scheduler
 * Execution timing, rate limiting, and RPC connection pooling.
 * Integrated from Marketchoomba (@orbitmm/core)
 */

import { Connection } from '@solana/web3.js';
import {
  RPCEndpoint,
  RPCPoolConfig,
} from './types.js';

// ============ Constants ============

const DEFAULT_HEALTH_CHECK_INTERVAL = 30000;
const DEFAULT_REQUEST_TIMEOUT = 10000;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 60000;

// ============ Semaphore for Concurrency Control ============

export class Semaphore {
  private active: number = 0;
  private waiting: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    
    await new Promise<void>(resolve => this.waiting.push(resolve));
    this.active++;
  }

  release(): void {
    this.active--;
    const next = this.waiting.shift();
    if (next) next();
  }

  tryAcquire(): boolean {
    if (this.active < this.max) {
      this.active++;
      return true;
    }
    return false;
  }

  async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get availablePermits(): number {
    return this.max - this.active;
  }

  get activeCount(): number {
    return this.active;
  }

  get waitingCount(): number {
    return this.waiting.length;
  }
}

// ============ Rate Limiter ============

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly tokensPerSecond: number,
    private readonly bucketSize: number = tokensPerSecond
  ) {
    this.tokens = bucketSize;
    this.lastRefill = Date.now();
  }

  tryConsume(): boolean {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    
    return false;
  }

  async consume(): Promise<void> {
    while (!this.tryConsume()) {
      const waitMs = Math.ceil(1000 / this.tokensPerSecond);
      await sleep(waitMs);
    }
  }

  async withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    await this.consume();
    return fn();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.tokensPerSecond;
    
    this.tokens = Math.min(this.bucketSize, this.tokens + newTokens);
    this.lastRefill = now;
  }

  get availableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// ============ Circuit Breaker ============

type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private lastFailure: number = 0;
  private successCount: number = 0;

  constructor(
    private readonly threshold: number = CIRCUIT_BREAKER_THRESHOLD,
    private readonly resetTimeMs: number = CIRCUIT_BREAKER_RESET_MS
  ) {}

  isAllowed(): boolean {
    if (this.state === 'closed') {
      return true;
    }
    
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure >= this.resetTimeMs) {
        this.state = 'half-open';
        this.successCount = 0;
        return true;
      }
      return false;
    }
    
    return true;
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = 'closed';
        this.failures = 0;
      }
    } else {
      this.failures = 0;
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
    
    if (this.state === 'half-open') {
      this.state = 'open';
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isAllowed()) {
      throw new CircuitBreakerOpenError();
    }
    
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  get currentState(): CircuitState {
    return this.state;
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor() {
    super('Circuit breaker is open');
    this.name = 'CircuitBreakerOpenError';
  }
}

// ============ RPC Pool ============

interface PooledEndpoint extends RPCEndpoint {
  connection: Connection;
  rateLimiter: RateLimiter;
  circuitBreaker: CircuitBreaker;
}

export class RPCPool {
  private endpoints: PooledEndpoint[] = [];
  private currentIndex: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(private readonly config: RPCPoolConfig) {
    this.initializeEndpoints();
    this.startHealthChecks();
  }

  private initializeEndpoints(): void {
    this.endpoints = this.config.endpoints.map(ep => ({
      ...ep,
      healthy: true,
      lastHealthCheck: Date.now(),
      activeRequests: 0,
      connection: new Connection(ep.url, { commitment: 'confirmed' }),
      rateLimiter: new RateLimiter(ep.rateLimit),
      circuitBreaker: new CircuitBreaker(),
    }));
  }

  async getConnection(): Promise<Connection> {
    const endpoint = this.selectEndpoint();
    
    if (!endpoint) {
      throw new NoHealthyEndpointsError();
    }
    
    await endpoint.rateLimiter.consume();
    
    endpoint.activeRequests++;
    return endpoint.connection;
  }

  releaseConnection(connection: Connection, success: boolean): void {
    const endpoint = this.endpoints.find(ep => ep.connection === connection);
    
    if (endpoint) {
      endpoint.activeRequests--;
      
      if (success) {
        endpoint.circuitBreaker.recordSuccess();
      } else {
        endpoint.circuitBreaker.recordFailure();
      }
    }
  }

  async withConnection<T>(fn: (connection: Connection) => Promise<T>): Promise<T> {
    const connection = await this.getConnection();
    
    try {
      const result = await fn(connection);
      this.releaseConnection(connection, true);
      return result;
    } catch (error) {
      this.releaseConnection(connection, false);
      throw error;
    }
  }

  private selectEndpoint(): PooledEndpoint | null {
    const healthy = this.endpoints.filter(
      ep => ep.healthy && ep.circuitBreaker.isAllowed()
    );
    
    if (healthy.length === 0) {
      return null;
    }
    
    switch (this.config.strategy) {
      case 'round-robin':
        return this.selectRoundRobin(healthy);
      case 'least-loaded':
        return this.selectLeastLoaded(healthy);
      case 'random':
        return this.selectRandom(healthy);
      default:
        return this.selectRoundRobin(healthy);
    }
  }

  private selectRoundRobin(endpoints: PooledEndpoint[]): PooledEndpoint {
    const endpoint = endpoints[this.currentIndex % endpoints.length];
    this.currentIndex++;
    return endpoint;
  }

  private selectLeastLoaded(endpoints: PooledEndpoint[]): PooledEndpoint {
    return endpoints.reduce((min, ep) => 
      ep.activeRequests < min.activeRequests ? ep : min
    );
  }

  private selectRandom(endpoints: PooledEndpoint[]): PooledEndpoint {
    const totalWeight = endpoints.reduce((sum, ep) => sum + ep.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const ep of endpoints) {
      random -= ep.weight;
      if (random <= 0) {
        return ep;
      }
    }
    
    return endpoints[0];
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.config.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL
    );
  }

  private async performHealthChecks(): Promise<void> {
    await Promise.all(
      this.endpoints.map(async ep => {
        try {
          const start = Date.now();
          await ep.connection.getLatestBlockhash();
          const latency = Date.now() - start;
          
          ep.healthy = latency < (this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT);
          ep.lastHealthCheck = Date.now();
        } catch {
          ep.healthy = false;
          ep.lastHealthCheck = Date.now();
        }
      })
    );
  }

  getStats(): {
    totalEndpoints: number;
    healthyEndpoints: number;
    totalActiveRequests: number;
  } {
    return {
      totalEndpoints: this.endpoints.length,
      healthyEndpoints: this.endpoints.filter(ep => ep.healthy).length,
      totalActiveRequests: this.endpoints.reduce((sum, ep) => sum + ep.activeRequests, 0),
    };
  }

  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

export class NoHealthyEndpointsError extends Error {
  constructor() {
    super('No healthy RPC endpoints available');
    this.name = 'NoHealthyEndpointsError';
  }
}

// ============ Swap Scheduler ============

export interface SchedulerConfig {
  maxConcurrentSwaps: number;
  rpcPoolConfig: RPCPoolConfig;
}

export class SwapScheduler {
  private semaphore: Semaphore;
  private rpcPool: RPCPool;
  private pendingSwaps: number = 0;
  private completedSwaps: number = 0;
  private failedSwaps: number = 0;

  constructor(config: SchedulerConfig) {
    this.semaphore = new Semaphore(config.maxConcurrentSwaps);
    this.rpcPool = new RPCPool(config.rpcPoolConfig);
  }

  async scheduleSwap<T>(
    swapFn: (connection: Connection) => Promise<T>
  ): Promise<T> {
    this.pendingSwaps++;
    
    try {
      await this.semaphore.acquire();
      
      try {
        const result = await this.rpcPool.withConnection(swapFn);
        this.completedSwaps++;
        return result;
      } finally {
        this.semaphore.release();
      }
    } catch (error) {
      this.failedSwaps++;
      throw error;
    } finally {
      this.pendingSwaps--;
    }
  }

  getStats(): {
    pendingSwaps: number;
    completedSwaps: number;
    failedSwaps: number;
    activeSwaps: number;
    availableSlots: number;
    rpcPoolStats: ReturnType<RPCPool['getStats']>;
  } {
    return {
      pendingSwaps: this.pendingSwaps,
      completedSwaps: this.completedSwaps,
      failedSwaps: this.failedSwaps,
      activeSwaps: this.semaphore.activeCount,
      availableSlots: this.semaphore.availablePermits,
      rpcPoolStats: this.rpcPool.getStats(),
    };
  }

  shutdown(): void {
    this.rpcPool.shutdown();
  }
}

// ============ Utility Functions ============

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function calculateBackoff(
  attempt: number,
  baseMs: number = BACKOFF_BASE_MS,
  maxMs: number = BACKOFF_MAX_MS
): number {
  const exponentialDelay = baseMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxMs);
  const jitter = Math.random() * cappedDelay * 0.1;
  return cappedDelay + jitter;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = BACKOFF_BASE_MS,
    maxDelayMs = BACKOFF_MAX_MS,
    shouldRetry = () => true,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }
      
      const delay = calculateBackoff(attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);
    }
  }

  throw lastError!;
}
