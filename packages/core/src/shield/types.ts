/**
 * Shield Module Types - Honeypot Detection & Token Safety
 * TrenchSniper OS - Anti-rug protection layer
 */

import { PublicKey } from '@solana/web3.js';

// ============ Constants ============

/** Threshold for honeypot detection (score below = honeypot) */
export const HONEYPOT_THRESHOLD = 30;

/** Threshold for warning (score below = caution) */
export const WARNING_THRESHOLD = 50;

/** Threshold for safe (score above = safe) */
export const SAFE_THRESHOLD = 70;

/** Risk weights for different check categories */
export const RISK_WEIGHTS = {
  mintAuthority: 25,
  freezeAuthority: 20,
  liquidity: 15,
  fees: 20,
  ownership: 10,
  transfers: 10,
} as const;

// ============ Risk Flags ============

export type RiskFlags =
  | 'MINT_ENABLED'
  | 'FREEZE_ENABLED'
  | 'LOW_LIQUIDITY'
  | 'UNLOCKED_LIQUIDITY'
  | 'HIGH_BUY_FEE'
  | 'HIGH_SELL_FEE'
  | 'SELL_DISABLED'
  | 'TRANSFER_DISABLED'
  | 'TOP_HOLDER_RISK'
  | 'DEV_HOLDINGS_HIGH'
  | 'NO_LP_BURN'
  | 'HONEYPOT_DETECTED'
  | 'RUGGED'
  | 'RENOUNCED'
  | 'VERIFIED_SAFE';

// ============ Check Result ============

export interface ShieldCheck {
  pass: boolean;
  score: number;
  flags: RiskFlags[];
  details?: Record<string, unknown>;
}

/** Risk severity levels */
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

/** Safety score categories */
export interface SafetyScores {
  overall: number;           // 0-100 composite score
  mintAuthority: number;       // Can they mint more?
  freezeAuthority: number;     // Can they freeze wallets?
  liquidity: number;         // Is liquidity locked?
  ownership: number;           // Hidden owner functions?
  transfers: number;           // Buy/sell restrictions
  developer: number;           // Dev wallet analysis
}

/** Individual risk finding */
export interface RiskFinding {
  id: string;
  category: 'mint' | 'freeze' | 'liquidity' | 'ownership' | 'transfer' | 'developer' | 'other';
  severity: RiskLevel;
  title: string;
  description: string;
  details?: Record<string, unknown>;
}

/** Token safety analysis result */
export interface TokenSafetyScore {
  tokenMint: string;
  tokenName?: string;
  tokenSymbol?: string;
  scores: SafetyScores;
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  isHoneypot: boolean;
  isSafe: boolean; // For quick binary check (score >= 70)
  findings: RiskFinding[];
  analyzedAt: number;
  warnings: string[];
}

/** Comprehensive risk assessment */
export interface RiskAssessment {
  tokenMint: string;
  riskLevel: RiskLevel;
  confidence: number; // 0-100
  recommendation: 'trade' | 'caution' | 'avoid';
  summary: string;
  factors: {
    honeypotRisk: RiskLevel;
    rugPullRisk: RiskLevel;
    manipulationRisk: RiskLevel;
    liquidityRisk: RiskLevel;
  };
  safetyScore?: TokenSafetyScore;
}

/** Transfer fee analysis */
export interface TransferFeeAnalysis {
  buyFeePercent: number;
  sellFeePercent: number;
  transferFeePercent: number;
  maxFeePercent: number;
  isHoneypotLevel: boolean; // >25%
  isWarningLevel: boolean; // >10%
}

/** Authority check result */
export interface AuthorityCheck {
  mintAuthority: PublicKey | null;
  freezeAuthority: PublicKey | null;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  canMintMore: boolean;
  canFreezeWallets: boolean;
  isRenounced: boolean; // Both authorities revoked
}

/** Liquidity check result */
export interface LiquidityCheck {
  lpTokenMint: string;
  totalLiquiditySol: number;
  totalLiquidityUsd: number;
  isLocked: boolean;
  lockInfo?: {
    lockerProgram: string;
    unlockDate: number;
    lockPercentage: number;
  };
  liquidityRatio: number; // Liquidity / Market Cap
  isSufficient: boolean;
}

/** Developer wallet analysis */
export interface DeveloperAnalysis {
  creatorWallet: string;
  creatorBalanceSol: number;
  tokenHoldings: {
    mint: string;
    amount: number;
    percentage: number;
  }[];
  hasSoldTokens: boolean;
  sellPercentage: number;
  isHoldingTooMuch: boolean; // >10% of supply
  isSuspicious: boolean;
}

/** Honeypot detection result */
export interface HoneypotDetection {
  isHoneypot: boolean;
  reason?: string;
  simulationResult?: {
    canBuy: boolean;
    canSell: boolean;
    buySuccess: boolean;
    sellSuccess: boolean;
    buyAmount: number;
    sellAmount: number;
    buyTax: number;
    sellTax: number;
  };
}

/** Shield configuration */
export interface ShieldConfig {
  // Score thresholds
  minSafeScore: number;        // Default: 70
  criticalThreshold: number;   // Default: 30
  highThreshold: number;       // Default: 50
  mediumThreshold: number;     // Default: 70

  // Fee thresholds
  warningFeePercent: number;   // Default: 10
  honeypotFeePercent: number;  // Default: 25

  // Dev wallet thresholds
  maxDevHoldingPercent: number; // Default: 10

  // Features
  enableSimulation: boolean;     // Simulate trades for honeypot detection
  enableLiquidityCheck: boolean;
  enableAuthorityCheck: boolean;
  enableDevAnalysis: boolean;

  // RPC endpoints
  rpcEndpoints: string[];
}

/** Shield error classes */
export class ShieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShieldError';
  }
}

export class TokenAnalysisError extends ShieldError {
  constructor(tokenMint: string, cause: string) {
    super(`Failed to analyze token ${tokenMint}: ${cause}`);
    this.name = 'TokenAnalysisError';
  }
}

export class SimulationError extends ShieldError {
  constructor(message: string, public tokenMint?: string) {
    super(message);
    this.name = 'SimulationError';
  }
}

export class AuthorityFetchError extends ShieldError {
  constructor(tokenMint: string, cause: string) {
    super(`Failed to fetch authorities for ${tokenMint}: ${cause}`);
    this.name = 'AuthorityFetchError';
  }
}
