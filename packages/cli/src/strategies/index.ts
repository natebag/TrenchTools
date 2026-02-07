/**
 * Strategy Configuration Loader
 * TrenchSniper OS - Load and validate strategy configs
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// ============ Types ============

export interface EntryConfig {
  maxMarketCapSol: number;
  minLiquiditySol: number;
  maxSlippageBps: number;
  newTokensOnly: boolean;
  newTokenWindowSec: number;
}

export interface PositionConfig {
  buyAmountSol: number;
  maxPositionSol: number;
  maxPositions: number;
}

export interface PriorityConfig {
  level: 'none' | 'low' | 'medium' | 'high' | 'ultra';
  computeUnits: number;
  priorityFee: number;
  jitoTip: number;
}

export interface TrailingStopConfig {
  enabled: boolean;
  activationMultiplier: number;
  trailPercent: number;
}

export interface AutoSellConfig {
  enabled: boolean;
  takeProfitMultiplier: number;
  stopLossPercent: number;
  trailingStop: TrailingStopConfig;
}

export interface RoutingConfig {
  preferredDexes: string[];
  autoMigration: boolean;
  jitoEnabled: boolean;
}

export interface RiskConfig {
  maxPriceImpactPct: number;
  honeypotCheck: boolean;
  minHolders: number;
  maxCreatorSoldPct: number;
}

export interface MonitoringConfig {
  priceCheckIntervalMs: number;
  quoteRefreshMs: number;
}

export interface StrategyConfig {
  name: string;
  description: string;
  entry: EntryConfig;
  position: PositionConfig;
  priority: PriorityConfig;
  autoSell: AutoSellConfig;
  routing: RoutingConfig;
  risk: RiskConfig;
  monitoring: MonitoringConfig;
}

// ============ Defaults ============

export const DEFAULT_STRATEGY: StrategyConfig = {
  name: 'default',
  description: 'Default balanced strategy',
  entry: {
    maxMarketCapSol: 100,
    minLiquiditySol: 5,
    maxSlippageBps: 300,
    newTokensOnly: false,
    newTokenWindowSec: 0,
  },
  position: {
    buyAmountSol: 0.25,
    maxPositionSol: 1,
    maxPositions: 7,
  },
  priority: {
    level: 'high',
    computeUnits: 175000,
    priorityFee: 200000,
    jitoTip: 5000,
  },
  autoSell: {
    enabled: true,
    takeProfitMultiplier: 1.75,
    stopLossPercent: 0.4,
    trailingStop: {
      enabled: true,
      activationMultiplier: 1.4,
      trailPercent: 0.18,
    },
  },
  routing: {
    preferredDexes: ['pumpfun', 'raydium', 'meteora'],
    autoMigration: true,
    jitoEnabled: true,
  },
  risk: {
    maxPriceImpactPct: 7,
    honeypotCheck: true,
    minHolders: 25,
    maxCreatorSoldPct: 75,
  },
  monitoring: {
    priceCheckIntervalMs: 2500,
    quoteRefreshMs: 7500,
  },
};

// ============ Strategy Loader ============

/**
 * Load strategy from YAML file
 */
export function loadStrategy(filePath: string): StrategyConfig {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Strategy file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = yaml.parse(content);

  return validateStrategy(parsed);
}

/**
 * Load strategy by name (looks in strategies directory)
 */
export function loadStrategyByName(name: string): StrategyConfig {
  const strategiesDir = path.dirname(new URL(import.meta.url).pathname);
  const filePath = path.join(strategiesDir, `${name}.yaml`);

  return loadStrategy(filePath);
}

/**
 * Get list of available strategies
 */
export function getAvailableStrategies(): string[] {
  const strategiesDir = path.dirname(new URL(import.meta.url).pathname);
  
  try {
    const files = fs.readdirSync(strategiesDir);
    return files
      .filter(f => f.endsWith('.yaml'))
      .map(f => f.replace('.yaml', ''));
  } catch {
    return ['aggressive', 'balanced', 'conservative'];
  }
}

/**
 * Validate and merge strategy with defaults
 */
export function validateStrategy(config: Partial<StrategyConfig>): StrategyConfig {
  return {
    name: config.name || DEFAULT_STRATEGY.name,
    description: config.description || DEFAULT_STRATEGY.description,
    entry: { ...DEFAULT_STRATEGY.entry, ...config.entry },
    position: { ...DEFAULT_STRATEGY.position, ...config.position },
    priority: { ...DEFAULT_STRATEGY.priority, ...config.priority },
    autoSell: {
      ...DEFAULT_STRATEGY.autoSell,
      ...config.autoSell,
      trailingStop: {
        ...DEFAULT_STRATEGY.autoSell.trailingStop,
        ...(config.autoSell?.trailingStop || {}),
      },
    },
    routing: { ...DEFAULT_STRATEGY.routing, ...config.routing },
    risk: { ...DEFAULT_STRATEGY.risk, ...config.risk },
    monitoring: { ...DEFAULT_STRATEGY.monitoring, ...config.monitoring },
  };
}

/**
 * Save strategy to YAML file
 */
export function saveStrategy(config: StrategyConfig, filePath: string): void {
  const content = yaml.stringify(config, { indent: 2 });
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ============ Exports ============

export const STRATEGIES = {
  aggressive: 'aggressive',
  balanced: 'balanced',
  conservative: 'conservative',
} as const;

export type StrategyName = keyof typeof STRATEGIES;
