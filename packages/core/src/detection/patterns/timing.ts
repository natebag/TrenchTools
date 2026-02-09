/**
 * Coordinated Timing Detection
 * Detects multiple wallets transacting in the same time window
 * Integrated from Marketchoomba (@orbitmm/core)
 * 
 * Powered by Allium
 */

import type { Pattern, Evidence, TransactionData } from '../types.js';

interface TimingWindow {
  startTime: number;
  endTime: number;
  transactions: TransactionData[];
  uniqueWallets: Set<string>;
}

interface CoordinatedEvent {
  window: TimingWindow;
  wallets: string[];
  transactionCount: number;
  totalVolume: number;
}

/**
 * Detect coordinated timing across multiple wallets
 */
export function detectCoordinatedTiming(
  transactions: TransactionData[],
  windowMs: number = 5000,
  minWallets: number = 3
): Pattern | null {
  if (transactions.length < minWallets) {
    return null;
  }

  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const coordinatedEvents = findCoordinatedEvents(sorted, windowMs, minWallets);

  if (coordinatedEvents.length === 0) {
    return null;
  }

  const confidence = calculateTimingConfidence(coordinatedEvents, transactions);
  const evidence = generateTimingEvidence(coordinatedEvents);

  return {
    type: 'coordinated_timing',
    confidence,
    severity: confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low',
    evidence,
    detectedAt: Date.now(),
  };
}

function findCoordinatedEvents(
  transactions: TransactionData[],
  windowMs: number,
  minWallets: number
): CoordinatedEvent[] {
  const events: CoordinatedEvent[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < transactions.length; i++) {
    if (usedIndices.has(i)) continue;

    const windowStart = transactions[i].timestamp;
    const windowEnd = windowStart + windowMs;

    const windowTxs: TransactionData[] = [];
    const wallets = new Set<string>();

    for (let j = i; j < transactions.length; j++) {
      if (transactions[j].timestamp > windowEnd) break;
      
      windowTxs.push(transactions[j]);
      wallets.add(transactions[j].signer);
    }

    if (wallets.size >= minWallets) {
      for (let j = i; j < i + windowTxs.length; j++) {
        usedIndices.add(j);
      }

      const totalVolume = windowTxs.reduce((sum, tx) => sum + tx.amount, 0);

      events.push({
        window: {
          startTime: windowStart,
          endTime: windowEnd,
          transactions: windowTxs,
          uniqueWallets: wallets,
        },
        wallets: [...wallets],
        transactionCount: windowTxs.length,
        totalVolume,
      });
    }
  }

  return events;
}

function calculateTimingConfidence(
  events: CoordinatedEvent[],
  allTransactions: TransactionData[]
): number {
  if (events.length === 0) return 0;

  const coordinatedTxCount = events.reduce((sum, e) => sum + e.transactionCount, 0);
  const coverageScore = coordinatedTxCount / allTransactions.length;

  const avgWallets = events.reduce((sum, e) => sum + e.wallets.length, 0) / events.length;
  const walletScore = Math.min(1, avgWallets / 10);

  const eventScore = Math.min(1, events.length / 5);
  const walletOverlap = calculateWalletOverlap(events);

  const confidence = (
    coverageScore * 0.3 +
    walletScore * 0.3 +
    eventScore * 0.2 +
    walletOverlap * 0.2
  );

  return Math.min(1, Math.max(0, confidence));
}

function calculateWalletOverlap(events: CoordinatedEvent[]): number {
  if (events.length < 2) return 0;

  const allWallets = new Set<string>();
  const walletsPerEvent: string[][] = [];

  for (const event of events) {
    walletsPerEvent.push(event.wallets);
    for (const wallet of event.wallets) {
      allWallets.add(wallet);
    }
  }

  let overlapCount = 0;
  for (const wallet of allWallets) {
    let appearances = 0;
    for (const eventWallets of walletsPerEvent) {
      if (eventWallets.includes(wallet)) appearances++;
    }
    if (appearances > 1) overlapCount++;
  }

  return overlapCount / allWallets.size;
}

function generateTimingEvidence(events: CoordinatedEvent[]): Evidence[] {
  const evidence: Evidence[] = [];

  const totalWallets = new Set(events.flatMap(e => e.wallets)).size;
  const totalTxs = events.reduce((sum, e) => sum + e.transactionCount, 0);

  evidence.push({
    type: 'timing_summary',
    description: `${events.length} coordinated timing events detected involving ${totalWallets} wallets`,
    data: {
      eventCount: events.length,
      totalWallets,
      totalTransactions: totalTxs,
      avgWalletsPerEvent: (totalWallets / events.length).toFixed(1),
    },
  });

  const topEvents = events
    .sort((a, b) => b.wallets.length - a.wallets.length)
    .slice(0, 5);

  for (const event of topEvents) {
    evidence.push({
      type: 'timing_event',
      description: `${event.wallets.length} wallets transacted within ${(event.window.endTime - event.window.startTime) / 1000}s`,
      data: {
        windowStart: new Date(event.window.startTime).toISOString(),
        windowEnd: new Date(event.window.endTime).toISOString(),
        windowDurationMs: event.window.endTime - event.window.startTime,
        walletCount: event.wallets.length,
        transactionCount: event.transactionCount,
        totalVolume: event.totalVolume,
        wallets: event.wallets.slice(0, 10),
        moreWallets: event.wallets.length > 10 ? event.wallets.length - 10 : 0,
      },
    });
  }

  return evidence;
}

export function detectBurstActivity(
  transactions: TransactionData[],
  burstThreshold: number = 10,
): { hasBurst: boolean; maxTps: number; burstTimestamp: number | null } {
  if (transactions.length < 2) {
    return { hasBurst: false, maxTps: 0, burstTimestamp: null };
  }

  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  
  let maxTps = 0;
  let burstTimestamp: number | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const windowStart = sorted[i].timestamp;
    const windowEnd = windowStart + 1000;

    let count = 0;
    for (let j = i; j < sorted.length && sorted[j].timestamp < windowEnd; j++) {
      count++;
    }

    if (count > maxTps) {
      maxTps = count;
      burstTimestamp = windowStart;
    }
  }

  return {
    hasBurst: maxTps >= burstThreshold,
    maxTps,
    burstTimestamp,
  };
}

export function getTimingDistribution(
  transactions: TransactionData[]
): { byHour: number[]; byDayOfWeek: number[]; peakHour: number; peakDay: number } {
  const byHour = new Array(24).fill(0);
  const byDayOfWeek = new Array(7).fill(0);

  for (const tx of transactions) {
    const date = new Date(tx.timestamp);
    byHour[date.getUTCHours()]++;
    byDayOfWeek[date.getUTCDay()]++;
  }

  const peakHour = byHour.indexOf(Math.max(...byHour));
  const peakDay = byDayOfWeek.indexOf(Math.max(...byDayOfWeek));

  return { byHour, byDayOfWeek, peakHour, peakDay };
}

export function detectTimeConcentration(
  transactions: TransactionData[]
): Pattern | null {
  if (transactions.length < 20) return null;

  const byMinute = new Array(60).fill(0);
  for (const tx of transactions) {
    const minute = new Date(tx.timestamp).getMinutes();
    byMinute[minute]++;
  }

  const avgPerMinute = transactions.length / 60;
  const maxMinuteCount = Math.max(...byMinute);
  const peakMinute = byMinute.indexOf(maxMinuteCount);

  if (maxMinuteCount > avgPerMinute * 5 && maxMinuteCount >= 10) {
    return {
      type: 'coordinated_timing',
      confidence: Math.min(1, (maxMinuteCount / (avgPerMinute * 5)) * 0.7),
      severity: 'medium',
      evidence: [{
        type: 'minute_concentration',
        description: `Activity concentrated at minute ${peakMinute} of each hour`,
        data: {
          peakMinute,
          peakCount: maxMinuteCount,
          averagePerMinute: avgPerMinute.toFixed(1),
          concentration: (maxMinuteCount / avgPerMinute).toFixed(1) + 'x average',
        },
      }],
      detectedAt: Date.now(),
    };
  }

  return null;
}
