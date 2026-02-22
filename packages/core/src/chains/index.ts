/**
 * Chains module — multi-chain type definitions, CAIP helpers, and feature flags.
 */

export {
  type ChainId,
  type ChainFamily,
  type ChainConfig,
  type ChainFeatures,
  CHAINS,
  ALL_CHAIN_IDS,
  ACTIVE_CHAIN_IDS,
  CHAIN_FEATURES,
  getChainConfig,
  getChainFamily,
  isEvmChain,
  getExplorerUrl,
  getNativeToken,
  getNativeDecimals,
  hasFeature,
} from './types.js';

export {
  toCaip2,
  toCaip10,
  fromCaip2,
  fromCaip10,
} from './caip.js';

export {
  type ChangeNowPair,
  CHANGENOW_PAIRS,
} from './changenow-pairs.js';
