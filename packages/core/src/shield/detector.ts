/**
 * Shield Detector - Real Token Analysis
 * TrenchSniper OS
 * 
 * Production-grade token safety analysis with:
 * - Real on-chain mint/freeze authority checks via getParsedAccountInfo
 * - DexScreener API for liquidity data
 * - Transfer pattern analysis
 * - Risk score 0-100 with caching (5 minute TTL)
 */

import {
  Connection,
  PublicKey,
} from '@solana/web3.js';
import type {
  ShieldCheck,
  RiskFlags,
  TokenSafetyScore,
  SafetyScores,
  RiskLevel,
  RiskFinding,
  AuthorityCheck,
  LiquidityCheck,
  TransferFeeAnalysis,
} from './types.js';
import {
  HONEYPOT_THRESHOLD,
  SAFE_THRESHOLD,
} from './types.js';

// ============ Cache ============

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const analysisCache = new Map<string, CacheEntry<TokenSafetyScore>>();

function getCached(mint: string): TokenSafetyScore | null {
  const entry = analysisCache.get(mint);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    analysisCache.delete(mint);
    return null;
  }
  return entry.data;
}

function setCache(mint: string, data: TokenSafetyScore): void {
  analysisCache.set(mint, { data, timestamp: Date.now() });
}

// ============ Real Blockchain Data ============

/**
 * Check mint and freeze authorities via getParsedAccountInfo
 */
export async function checkAuthorities(
  connection: Connection,
  mintAddress: string
): Promise<AuthorityCheck> {
  const mint = new PublicKey(mintAddress);
  const accountInfo = await connection.getParsedAccountInfo(mint, 'confirmed');

  if (!accountInfo.value?.data || !('parsed' in accountInfo.value.data)) {
    throw new Error(`Failed to parse mint account: ${mintAddress}`);
  }

  const parsed = accountInfo.value.data.parsed;
  const info = parsed.info;

  const mintAuthority = info.mintAuthority ? new PublicKey(info.mintAuthority) : null;
  const freezeAuthority = info.freezeAuthority ? new PublicKey(info.freezeAuthority) : null;

  return {
    mintAuthority,
    freezeAuthority,
    mintAuthorityRevoked: mintAuthority === null,
    freezeAuthorityRevoked: freezeAuthority === null,
    canMintMore: mintAuthority !== null,
    canFreezeWallets: freezeAuthority !== null,
    isRenounced: mintAuthority === null && freezeAuthority === null,
  };
}

// ============ DexScreener API ============

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap: number;
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  txns: {
    h24: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    m5: { buys: number; sells: number };
  };
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

/**
 * Fetch liquidity data from DexScreener API
 */
export async function fetchDexScreenerData(
  tokenMint: string
): Promise<DexScreenerPair[] | null> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.warn(`DexScreener API returned ${response.status}`);
      return null;
    }

    const data = await response.json() as DexScreenerResponse;
    return data.pairs;
  } catch (error) {
    console.error('Failed to fetch DexScreener data:', error);
    return null;
  }
}

/**
 * Analyze liquidity from DexScreener data
 */
export function analyzeLiquidity(pairs: DexScreenerPair[] | null): LiquidityCheck {
  if (!pairs || pairs.length === 0) {
    return {
      lpTokenMint: '',
      totalLiquiditySol: 0,
      totalLiquidityUsd: 0,
      isLocked: false,
      liquidityRatio: 0,
      isSufficient: false,
    };
  }

  // Sum liquidity across all pairs
  const totalLiquidityUsd = pairs.reduce((sum, p) => sum + (p.liquidity?.usd || 0), 0);
  
  // Get primary pair
  const mainPair = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
  const totalLiquiditySol = mainPair.liquidity?.quote || 0;
  const marketCap = mainPair.fdv || mainPair.marketCap || 0;
  const liquidityRatio = marketCap > 0 ? totalLiquidityUsd / marketCap : 0;

  return {
    lpTokenMint: mainPair.pairAddress,
    totalLiquiditySol,
    totalLiquidityUsd,
    isLocked: false, // Would need to check specific locker contracts
    liquidityRatio,
    isSufficient: totalLiquidityUsd >= 5000,
  };
}

// ============ Risk Checks ============

function checkMintAuthority(auth: AuthorityCheck): ShieldCheck {
  const flags: RiskFlags[] = [];
  let riskScore = 0;

  if (auth.isRenounced) {
    return {
      pass: true,
      score: 0,
      flags: ['RENOUNCED'],
    };
  }

  if (auth.canMintMore) {
    flags.push('MINT_ENABLED');
    riskScore = 25;
  }

  return {
    pass: !auth.canMintMore,
    score: riskScore,
    flags,
  };
}

function checkFreezeAuthority(auth: AuthorityCheck): ShieldCheck {
  const flags: RiskFlags[] = [];
  let riskScore = 0;

  if (auth.freezeAuthorityRevoked) {
    return {
      pass: true,
      score: 0,
      flags: ['VERIFIED_SAFE'],
    };
  }

  if (auth.canFreezeWallets) {
    flags.push('FREEZE_ENABLED');
    riskScore = 20;
  }

  return {
    pass: !auth.canFreezeWallets,
    score: riskScore,
    flags,
  };
}

function checkLiquidityRisk(liquidity: LiquidityCheck): ShieldCheck {
  const flags: RiskFlags[] = [];
  let riskScore = 0;

  if (!liquidity.isLocked) {
    riskScore += 15;
    flags.push('UNLOCKED_LIQUIDITY');
  }

  if (liquidity.totalLiquidityUsd < 1000) {
    riskScore += 25;
    flags.push('LOW_LIQUIDITY');
  } else if (liquidity.totalLiquidityUsd < 5000) {
    riskScore += 10;
    flags.push('LOW_LIQUIDITY');
  }

  return {
    pass: riskScore < 20,
    score: riskScore,
    flags,
  };
}

function checkTransferPatterns(
  pairs: DexScreenerPair[] | null
): ShieldCheck & { feeAnalysis?: TransferFeeAnalysis } {
  const flags: RiskFlags[] = [];
  let riskScore = 0;

  if (!pairs || pairs.length === 0) {
    return { pass: true, score: 0, flags: [] };
  }

  // Analyze buy/sell ratio
  const mainPair = pairs[0];
  const txns24h = mainPair.txns?.h24;
  
  if (txns24h) {
    const totalTxns = txns24h.buys + txns24h.sells;
    const sellRatio = totalTxns > 0 ? txns24h.sells / totalTxns : 0;

    // If very few sells relative to buys, might indicate honeypot
    if (totalTxns > 10 && sellRatio < 0.1) {
      riskScore += 30;
      flags.push('SELL_DISABLED');
    } else if (totalTxns > 10 && sellRatio < 0.25) {
      riskScore += 15;
      // Suspicious but not necessarily honeypot
    }
  }

  // Check for large price impact (potential high fees)
  const priceChange5m = mainPair.priceChange?.m5 || 0;

  if (Math.abs(priceChange5m) > 50) {
    // Extreme volatility might indicate manipulation
    riskScore += 10;
  }

  // Long-term trend check (1h for context)
  const priceChange1h = mainPair.priceChange?.h1 || 0;
  if (Math.abs(priceChange1h) > 80 && priceChange5m < -20) {
    // Pump and dump pattern
    riskScore += 5;
  }

  return {
    pass: riskScore < 30,
    score: riskScore,
    flags,
    feeAnalysis: {
      buyFeePercent: 0, // Would need simulation to get exact fees
      sellFeePercent: 0,
      transferFeePercent: 0,
      maxFeePercent: 0,
      isHoneypotLevel: riskScore >= 30,
      isWarningLevel: riskScore >= 15,
    },
  };
}

function checkTopHolders(pairs: DexScreenerPair[] | null): ShieldCheck {
  const flags: RiskFlags[] = [];
  let riskScore = 0;

  if (!pairs || pairs.length === 0) {
    return { pass: true, score: 0, flags: [] };
  }

  // DexScreener doesn't provide holder info directly
  // This would need to be fetched from another source (Helius, QuickNode, etc.)
  // For now, return neutral

  return {
    pass: true,
    score: riskScore,
    flags,
  };
}

// ============ Main Analysis ============

export interface AnalyzeTokenOptions {
  connection: Connection;
  tokenMint: string;
  skipCache?: boolean;
}

/**
 * Perform comprehensive token safety analysis
 */
export async function analyzeTokenSafety(
  options: AnalyzeTokenOptions
): Promise<TokenSafetyScore> {
  const { connection, tokenMint, skipCache = false } = options;

  // Check cache
  if (!skipCache) {
    const cached = getCached(tokenMint);
    if (cached) return cached;
  }

  // Fetch data in parallel
  const [authorities, dexData] = await Promise.all([
    checkAuthorities(connection, tokenMint),
    fetchDexScreenerData(tokenMint),
  ]);

  const liquidity = analyzeLiquidity(dexData);
  
  // Run all checks
  const mintCheck = checkMintAuthority(authorities);
  const freezeCheck = checkFreezeAuthority(authorities);
  const liquidityCheck = checkLiquidityRisk(liquidity);
  const transferCheck = checkTransferPatterns(dexData);
  const holderCheck = checkTopHolders(dexData);

  // Calculate total score
  const totalRiskScore = 
    mintCheck.score + 
    freezeCheck.score + 
    liquidityCheck.score + 
    transferCheck.score + 
    holderCheck.score;

  const overallScore = Math.max(0, 100 - totalRiskScore);
  const isHoneypot = totalRiskScore >= HONEYPOT_THRESHOLD * 3 || 
    transferCheck.flags.includes('SELL_DISABLED');
  const isSafe = overallScore >= SAFE_THRESHOLD && !isHoneypot;

  // Collect all flags
  const allFlags = [
    ...mintCheck.flags,
    ...freezeCheck.flags,
    ...liquidityCheck.flags,
    ...transferCheck.flags,
    ...holderCheck.flags,
  ];

  // Build findings
  const findings: RiskFinding[] = [];
  for (const flag of allFlags) {
    let severity: RiskLevel = 'low';
    let category: RiskFinding['category'] = 'other';

    switch (flag) {
      case 'SELL_DISABLED':
      case 'HONEYPOT_DETECTED':
        severity = 'critical';
        category = 'transfer';
        break;
      case 'MINT_ENABLED':
        severity = 'high';
        category = 'mint';
        break;
      case 'HIGH_SELL_FEE':
        severity = 'high';
        category = 'transfer';
        break;
      case 'FREEZE_ENABLED':
        severity = 'medium';
        category = 'freeze';
        break;
      case 'HIGH_BUY_FEE':
        severity = 'medium';
        category = 'transfer';
        break;
      case 'LOW_LIQUIDITY':
      case 'UNLOCKED_LIQUIDITY':
        severity = 'medium';
        category = 'liquidity';
        break;
      case 'TOP_HOLDER_RISK':
      case 'DEV_HOLDINGS_HIGH':
        severity = 'medium';
        category = 'ownership';
        break;
      case 'RENOUNCED':
      case 'VERIFIED_SAFE':
        severity = 'safe';
        break;
    }

    findings.push({
      id: `finding_${flag}_${Date.now()}`,
      category,
      severity,
      title: flag.replace(/_/g, ' '),
      description: getDescriptionForFlag(flag),
    });
  }

  // Get token info from DexScreener
  const tokenName = dexData?.[0]?.baseToken?.name;
  const tokenSymbol = dexData?.[0]?.baseToken?.symbol;

  const scores: SafetyScores = {
    overall: overallScore,
    mintAuthority: mintCheck.pass ? 100 : 0,
    freezeAuthority: freezeCheck.pass ? 100 : 0,
    liquidity: liquidityCheck.pass ? 100 : Math.max(0, 100 - liquidityCheck.score * 2),
    ownership: holderCheck.pass ? 100 : 50,
    transfers: transferCheck.pass ? 100 : Math.max(0, 100 - transferCheck.score * 2),
    developer: 75, // Neutral without deeper analysis
  };

  const result: TokenSafetyScore = {
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
    warnings: isHoneypot ? ['🚨 POTENTIAL HONEYPOT DETECTED'] : [],
  };

  // Cache result
  setCache(tokenMint, result);

  return result;
}

function getDescriptionForFlag(flag: RiskFlags): string {
  const descriptions: Record<RiskFlags, string> = {
    'MINT_ENABLED': 'Token creator can mint more tokens, potentially diluting value',
    'FREEZE_ENABLED': 'Token creator can freeze any wallet, preventing trading',
    'LOW_LIQUIDITY': 'Low liquidity pool - may experience high slippage or rug risk',
    'UNLOCKED_LIQUIDITY': 'Liquidity is not locked - creator can remove at any time',
    'HIGH_BUY_FEE': 'High buy tax reduces your purchase amount',
    'HIGH_SELL_FEE': 'High sell tax significantly reduces proceeds when selling',
    'SELL_DISABLED': 'Unable to sell - classic honeypot indicator',
    'TRANSFER_DISABLED': 'Token transfers are disabled or heavily restricted',
    'TOP_HOLDER_RISK': 'Large concentration in top holders - pump and dump risk',
    'DEV_HOLDINGS_HIGH': 'Developer wallet holds significant supply',
    'NO_LP_BURN': 'LP tokens not burned - liquidity can be removed',
    'HONEYPOT_DETECTED': 'Contract exhibits honeypot behavior',
    'RUGGED': 'Token has been rugged - avoid',
    'RENOUNCED': 'Contract ownership has been renounced - cannot be modified',
    'VERIFIED_SAFE': 'Token passed safety checks',
  };
  return descriptions[flag] || `Risk flag: ${flag}`;
}

// ============ Quick Checks ============

/**
 * Quick honeypot check (faster, less comprehensive)
 */
export async function quickHoneypotCheck(
  connection: Connection,
  tokenMint: string
): Promise<{ isHoneypot: boolean; reason?: string; confidence: number }> {
  try {
    const authorities = await checkAuthorities(connection, tokenMint);
    
    // If both authorities are still active, proceed with caution
    if (authorities.canMintMore && authorities.canFreezeWallets) {
      return { 
        isHoneypot: false, 
        reason: 'Both mint and freeze authorities active', 
        confidence: 60 
      };
    }

    const dexData = await fetchDexScreenerData(tokenMint);
    if (dexData && dexData.length > 0) {
      const txns = dexData[0].txns?.h24;
      if (txns && txns.buys > 10 && txns.sells === 0) {
        return { 
          isHoneypot: true, 
          reason: 'No sells detected despite buys', 
          confidence: 85 
        };
      }
    }

    return { isHoneypot: false, confidence: 70 };
  } catch (error) {
    console.error('Quick honeypot check failed:', error);
    return { isHoneypot: false, reason: 'Check failed', confidence: 0 };
  }
}

/**
 * Get risk level from overall score
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score >= 80) return 'safe';
  if (score >= 60) return 'low';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'high';
  return 'critical';
}

// ============ Display Formatting ============

/**
 * Format safety report for display
 */
export function formatSafetyReport(score: TokenSafetyScore): string {
  const emoji = score.isHoneypot ? '🚨' : score.isSafe ? '✅' : '⚠️';
  const status = score.isHoneypot ? 'HONEYPOT' : score.isSafe ? 'SAFE' : 'CAUTION';
  
  let report = `${emoji} *Shield Analysis: ${status}*\n\n`;
  report += `Token: ${score.tokenSymbol || score.tokenMint.substring(0, 8)}...\n`;
  report += `Overall Score: ${score.scores.overall}/100\n\n`;

  report += `📊 *Breakdown:*\n`;
  report += `  Mint Authority: ${score.scores.mintAuthority === 100 ? '✅' : '⚠️'} ${score.scores.mintAuthority}/100\n`;
  report += `  Freeze Authority: ${score.scores.freezeAuthority === 100 ? '✅' : '⚠️'} ${score.scores.freezeAuthority}/100\n`;
  report += `  Liquidity: ${score.scores.liquidity >= 70 ? '✅' : '⚠️'} ${score.scores.liquidity}/100\n`;
  report += `  Transfers: ${score.scores.transfers >= 70 ? '✅' : '⚠️'} ${score.scores.transfers}/100\n`;
  report += `\n`;

  if (score.findings.length > 0) {
    report += '*Findings:*\n';
    for (const finding of score.findings.slice(0, 6)) {
      const severityEmoji = 
        finding.severity === 'critical' ? '🔴' : 
        finding.severity === 'high' ? '🟠' :
        finding.severity === 'medium' ? '🟡' : 
        finding.severity === 'safe' ? '🟢' : '⚪';
      report += `${severityEmoji} ${finding.title}\n`;
    }
    if (score.findings.length > 6) {
      report += `  ... and ${score.findings.length - 6} more\n`;
    }
  }

  if (score.warnings.length > 0) {
    report += '\n*⚠️ Warnings:*\n';
    for (const warning of score.warnings) {
      report += `${warning}\n`;
    }
  }

  return report;
}

/**
 * Clear analysis cache
 */
export function clearCache(): void {
  analysisCache.clear();
}

/**
 * Get cache stats
 */
export function getCacheStats(): { size: number; oldestEntry: number | null } {
  let oldestTimestamp: number | null = null;
  
  analysisCache.forEach((entry) => {
    if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
      oldestTimestamp = entry.timestamp;
    }
  });

  return {
    size: analysisCache.size,
    oldestEntry: oldestTimestamp,
  };
}
