/**
 * Token alert filter — pure function to match alerts against criteria.
 */

import type { NewTokenAlert, TokenAlertFilter } from './types.js';

/** Returns true if the alert matches all specified filter criteria. */
export function matchesFilter(alert: NewTokenAlert, filter: TokenAlertFilter): boolean {
  if (filter.minMarketCapSol != null && alert.marketCapSol < filter.minMarketCapSol) {
    return false;
  }
  if (filter.maxMarketCapSol != null && alert.marketCapSol > filter.maxMarketCapSol) {
    return false;
  }
  if (filter.minInitialBuySol != null && alert.initialBuySol < filter.minInitialBuySol) {
    return false;
  }
  if (filter.nameKeyword) {
    const kw = filter.nameKeyword.toLowerCase();
    const nameMatch = alert.name.toLowerCase().includes(kw);
    const symbolMatch = alert.symbol.toLowerCase().includes(kw);
    if (!nameMatch && !symbolMatch) return false;
  }
  return true;
}
