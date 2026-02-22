/**
 * Shared state between Telegram bot and Express API
 * This will be replaced with actual trading engine integration later
 */

export interface WalletInfo {
  address: string;
  balance: number; // SOL
  label?: string;
}

export interface BoostStats {
  volumeGenerated: number; // SOL
  tradesExecuted: number;
  successRate: number; // 0-100
  solSpent: number;
  startedAt: Date | null;
}

export interface BoostState {
  isRunning: boolean;
  tokenMint: string | null;
  stats: BoostStats;
}

export interface LaunchHistoryEntry {
  mintAddress: string;
  name: string;
  symbol: string;
  txHash: string;
  timestamp: number;
}

export interface AppState {
  boost: BoostState;
  wallets: WalletInfo[];
  alertsEnabled: boolean;
  stats24h: {
    volume: number;
    trades: number;
    successRate: number;
    solSpent: number;
  };
  launches: LaunchHistoryEntry[];
}

// Mock data for demonstration
const mockWallets: WalletInfo[] = [
  { address: '7xKXt...mN9', balance: 2.45, label: 'Main' },
  { address: '3pQwR...xY8', balance: 1.23, label: 'Boost 1' },
  { address: '9kLmP...aB2', balance: 0.87, label: 'Boost 2' },
  { address: '5nVcX...hJ4', balance: 1.56, label: 'Boost 3' },
];

// Shared state singleton
class StateManager {
  private state: AppState = {
    boost: {
      isRunning: false,
      tokenMint: null,
      stats: {
        volumeGenerated: 0,
        tradesExecuted: 0,
        successRate: 0,
        solSpent: 0,
        startedAt: null,
      },
    },
    wallets: mockWallets,
    alertsEnabled: true,
    stats24h: {
      volume: 45.67,
      trades: 234,
      successRate: 94.2,
      solSpent: 12.34,
    },
    launches: [],
  };

  private alertCallbacks: ((message: string) => void)[] = [];

  getState(): AppState {
    return { ...this.state };
  }

  getBoostState(): BoostState {
    return { ...this.state.boost };
  }

  getWallets(): WalletInfo[] {
    return [...this.state.wallets];
  }

  get24hStats() {
    return { ...this.state.stats24h };
  }

  isAlertsEnabled(): boolean {
    return this.state.alertsEnabled;
  }

  setAlertsEnabled(enabled: boolean): void {
    this.state.alertsEnabled = enabled;
  }

  startBoost(tokenMint: string): { success: boolean; message: string } {
    if (this.state.boost.isRunning) {
      return { 
        success: false, 
        message: `Already boosting ${this.state.boost.tokenMint}` 
      };
    }

    this.state.boost = {
      isRunning: true,
      tokenMint,
      stats: {
        volumeGenerated: 0,
        tradesExecuted: 0,
        successRate: 0,
        solSpent: 0,
        startedAt: new Date(),
      },
    };

    // Simulate activity with mock updates
    this.startMockUpdates();

    return { success: true, message: `Started boosting ${tokenMint}` };
  }

  stopBoost(): { success: boolean; message: string; stats?: BoostStats } {
    if (!this.state.boost.isRunning) {
      return { success: false, message: 'No active boost session' };
    }

    const finalStats = { ...this.state.boost.stats };
    
    this.state.boost = {
      isRunning: false,
      tokenMint: null,
      stats: {
        volumeGenerated: 0,
        tradesExecuted: 0,
        successRate: 0,
        solSpent: 0,
        startedAt: null,
      },
    };

    return { 
      success: true, 
      message: 'Boost session stopped',
      stats: finalStats 
    };
  }

  addLaunch(entry: LaunchHistoryEntry): void {
    this.state.launches.unshift(entry);
    if (this.state.launches.length > 100) this.state.launches.pop();
  }

  getLaunches(): LaunchHistoryEntry[] {
    return [...this.state.launches];
  }

  onAlert(callback: (message: string) => void): void {
    this.alertCallbacks.push(callback);
  }

  private sendAlert(message: string): void {
    if (this.state.alertsEnabled) {
      this.alertCallbacks.forEach(cb => cb(message));
    }
  }

  private mockUpdateInterval: NodeJS.Timeout | null = null;

  private startMockUpdates(): void {
    // Simulate trades every 3-8 seconds
    const runMockTrade = () => {
      if (!this.state.boost.isRunning) {
        if (this.mockUpdateInterval) {
          clearTimeout(this.mockUpdateInterval);
          this.mockUpdateInterval = null;
        }
        return;
      }

      // Random trade simulation
      const tradeAmount = Math.random() * 0.5 + 0.1;
      const success = Math.random() > 0.1;

      if (success) {
        this.state.boost.stats.tradesExecuted++;
        this.state.boost.stats.volumeGenerated += tradeAmount;
        this.state.boost.stats.solSpent += tradeAmount * 0.003; // ~0.3% fees
        this.state.boost.stats.successRate = 
          (this.state.boost.stats.tradesExecuted / 
           (this.state.boost.stats.tradesExecuted + 1)) * 100;

        this.sendAlert(
          `✅ Trade executed: ${tradeAmount.toFixed(4)} SOL on ${this.state.boost.tokenMint}`
        );
      } else {
        this.sendAlert(
          `❌ Trade failed on ${this.state.boost.tokenMint}`
        );
      }

      // Schedule next mock trade
      const nextDelay = (Math.random() * 5000) + 3000;
      this.mockUpdateInterval = setTimeout(runMockTrade, nextDelay);
    };

    // Start first trade after 2 seconds
    this.mockUpdateInterval = setTimeout(runMockTrade, 2000);
  }
}

// Export singleton instance
export const stateManager = new StateManager();
