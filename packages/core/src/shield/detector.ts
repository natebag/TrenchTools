/**
 * Shield Detector - Honeypot and rug detection
 * TrenchSniper OS
 */

import type {
  ShieldCheck,
  RiskFlags,
  TokenSafetyScore,
  SafetyScores,
  RiskLevel,
  RiskFinding,
} from './types.js';
import {
  HONEYPOT_THRESHOLD,
  WARNING_THRESHOLD,
  SAFE_THRESHOLD,
} from './types.js';

export interface TokenAccountInfo {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  supply: bigint;
  decimals: number;
}

export interface MarketInfo {
  liquidityLocked: boolean;
  liquidityUsd: number;
  devWalletHoldings: number;
  topHolderPercent: number;
  burnAmount: bigint;
}

export interface FeeInfo {
  buyFee: number;
  sellFee: number;
  transferFee: number;
  isSellDisabled: boolean;
  isTransferDisabled: boolean;
}

/**
 * Check token mint authority
 */
function checkMintAuthority(
  tokenInfo: TokenAccountInfo
): ShieldCheck {
  const flags: RiskFlags[] = [];
  let riskScore = 0;

  if (tokenInfo.mintAuthority === null) {
    return {
      pass: true,
      score: 0,
      flags: ['RENOUNCED' as RiskFlags],
    };
  }

  flags.push('MINT_ENABLED');
  riskScore = 25;

  return {
    pass: false,
    score: riskScore,
    flags,
  };
}

/**
 * Check freeze authority
 */
function checkFreezeAuthority(
  tokenInfo: TokenAccountInfo
): ShieldCheck {
  const flags: RiskFlags[] = [];
  let riskScore = 0;

  if (tokenInfo.freezeAuthority === null) {
    return {
      pass: true,
      score: 0,
      flags: ['VERIFIED_SAFE' as RiskFlags],
    };
  }

  flags.push('FREEZE_ENABLED');
  riskScore = 20;

  return {
    pass: false,
    score: riskScore,
    flags,
  };
}

/**
 * Check fee structure for honeypot indicators
 */
function checkFees(feeInfo: FeeInfo): ShieldCheck {
  const flags: RiskFlags[] = [];
  let riskScore = 0;

  if (feeInfo.isSellDisabled) {
    riskScore += 100;
    flags.push('SELL_DISABLED');
  }

  if (feeInfo.sellFee > 25) {
    riskScore += 50;
    flags.push('HIGH_SELL_FEE');
  } else if (feeInfo.sellFee > 10) {
    riskScore += 20;
    flags.push('HIGH_SELL_FEE');
  }

  if (feeInfo.buyFee > 25) {
    riskScore += 30;
    flags.push('HIGH_BUY_FEE');
  } else if (feeInfo.buyFee > 10) {
    riskScore += 15;
    flags.push('HIGH_BUY_FEE');
  }

  return {
    pass: riskScore < 30,
    score: riskScore,
    flags,
  };
}

/**
 * Check liquidity info
 */
function checkLiquidity(marketInfo: MarketInfo): ShieldCheck {
  const flags: RiskFlags[] = [];
  let riskScore = 0;

  if (!marketInfo.liquidityLocked) {
    riskScore += 15;
    flags.push('UNLOCKED_LIQUIDITY');
  }

  if (marketInfo.liquidityUsd < 1000) {
    riskScore += 20;
    flags.push('LOW_LIQUIDITY');
  } else if (marketInfo.liquidityUsd < 5000) {
    riskScore += 10;
    flags.push('LOW_LIQUIDITY');
  }

  return {
    pass: riskScore < 20,
    score: riskScore,
    flags,
  };
}

/**
 * Check top holder concentration
 */
function checkOwnership(marketInfo: MarketInfo): ShieldCheck {
  const flags: RiskFlags[] = [];
  let riskScore = 0;

  if (marketInfo.topHolderPercent > 50) {
    riskScore += 15;
    flags.push('TOP_HOLDER_RISK');
  } else if (marketInfo.topHolderPercent > 30) {
    riskScore += 10;
    flags.push('TOP_HOLDER_RISK');
  }

  if (marketInfo.devWalletHoldings > 20) {
    riskScore += 15;
    flags.push('DEV_HOLDINGS_HIGH');
  } else if (marketInfo.devWalletHoldings > 10) {
    riskScore += 10;
    flags.push('DEV_HOLDINGS_HIGH');
  }

  return {
    pass: riskScore < 15,
    score: riskScore,
    flags,
  };
}

export interface FullAnalysisParams {
  tokenInfo: TokenAccountInfo;
  marketInfo: MarketInfo;
  feeInfo: FeeInfo;
  tokenMint: string;
  tokenName?: string;
  tokenSymbol?: string;
}

/**
 * Perform full token safety analysis
 */
export function analyzeTokenSafety(params: FullAnalysisParams): TokenSafetyScore {
  const { tokenInfo, marketInfo, feeInfo, tokenMint, tokenName, tokenSymbol } = params;

  const mintCheck = checkMintAuthority(tokenInfo);
  const freezeCheck = checkFreezeAuthority(tokenInfo);
  const feeCheck = checkFees(feeInfo);
  const liquidityCheck = checkLiquidity(marketInfo);
  const ownershipCheck = checkOwnership(marketInfo);

  const totalScore = mintCheck.score + freezeCheck.score + feeCheck.score + 
                    liquidityCheck.score + ownershipCheck.score;

  const isHoneypot = totalScore >= 100 || feeInfo.isSellDisabled;
  const isSafe = totalScore < WARNING_THRESHOLD && !isHoneypot;

  // Build findings
  const findings: RiskFinding[] = [];
  const allFlags = [
    ...mintCheck.flags,
    ...freezeCheck.flags,
    ...feeCheck.flags,
    ...liquidityCheck.flags,
    ...ownershipCheck.flags,
  ];

  for (const flag of allFlags) {
    let severity: RiskLevel = 'low';
    if (flag === 'SELL_DISABLED' || flag === 'HONEYPOT_DETECTED') severity = 'critical';
    else if (flag === 'MINT_ENABLED' || flag === 'HIGH_SELL_FEE') severity = 'high';
    else if (flag === 'FREEZE_ENABLED' || flag === 'HIGH_BUY_FEE') severity = 'medium';

    findings.push({
      id: `finding_${flag}_${Date.now()}`,
      category: 'other',
      severity,
      title: flag.replace(/_/g, ' '),
      description: `Risk flag: ${flag}`,
    });
  }

  const scores: SafetyScores = {
    overall: Math.max(0, 100 - totalScore),
    mintAuthority: mintCheck.pass ? 100 : 0,
    freezeAuthority: freezeCheck.pass ? 100 : 0,
    liquidity: liquidityCheck.pass ? 100 : 50,
    ownership: ownershipCheck.pass ? 100 : 50,
    transfers: feeCheck.pass ? 100 : 50,
    developer: 75,
  };

  return {
    tokenMint,
    tokenName,
    tokenSymbol,
    scores,
    totalFindings: findings.length,
    criticalFindings: findings.filter(f => f.severity === 'critical').length,
    highFindings: findings.filter(f => f.severity === 'high').length,
    mediumFindings: findings.filter(f => f.severity === 'medium').length,
    lowFindings: findings.filter(f => f.severity === 'low').length,
    isHoneypot,
    isSafe,
    findings,
    analyzedAt: Date.now(),
    warnings: isHoneypot ? ['POTENTIAL HONEYPOT DETECTED'] : [],
  };
}

/**
 * Quick honeypot check
 */
export function quickHoneypotCheck(
  tokenInfo: TokenAccountInfo,
  feeInfo: FeeInfo
): { isHoneypot: boolean; reason?: string } {
  if (feeInfo.isSellDisabled) {
    return { isHoneypot: true, reason: 'Sell is disabled' };
  }

  if (feeInfo.sellFee > 50) {
    return { isHoneypot: true, reason: `Sell fee is ${feeInfo.sellFee}%` };
  }

  if (tokenInfo.mintAuthority && tokenInfo.freezeAuthority) {
    return { isHoneypot: false, reason: 'Both authorities still active - proceed with caution' };
  }

  return { isHoneypot: false };
}

/**
 * Get risk level from score
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score >= HONEYPOT_THRESHOLD) return 'critical';
  if (score >= SAFE_THRESHOLD) return 'high';
  if (score >= WARNING_THRESHOLD) return 'medium';
  return 'safe';
}

/**
 * Format safety score for display
 */
export function formatSafetyReport(score: TokenSafetyScore): string {
  const emoji = score.isHoneypot ? '🚨' : score.isSafe ? '✅' : '⚠️';
  const status = score.isHoneypot ? 'HONEYPOT' : score.isSafe ? 'SAFE' : 'CAUTION';
  
  let report = `${emoji} *Shield Analysis: ${status}*\n\n`;
  report += `Token: ${score.tokenSymbol || score.tokenMint.substring(0, 8)}\n`;
  report += `Overall Score: ${score.scores.overall}/100\n\n`;

  if (score.findings.length > 0) {
    report += '*Findings:*\n';
    for (const finding of score.findings.slice(0, 5)) {
      const severityEmoji = finding.severity === 'critical' ? '🔴' : 
                           finding.severity === 'high' ? '🟠' :
                           finding.severity === 'medium' ? '🟡' : '🟢';
      report += `${severityEmoji} ${finding.title}\n`;
    }
  }

  if (score.warnings.length > 0) {
    report += '\n*Warnings:*\n';
    for (const warning of score.warnings) {
      report += `⚠️ ${warning}\n`;
    }
  }

  return report;
}
