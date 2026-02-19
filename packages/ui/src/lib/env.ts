/**
 * Environment flags for dual-mode (self-hosted vs hosted SaaS)
 *
 * Self-hosted: VITE_HOSTED is unset → IS_HOSTED = false → all existing behavior unchanged
 * Hosted:      VITE_HOSTED=true    → IS_HOSTED = true  → routes through backend API
 */

export const IS_HOSTED = import.meta.env.VITE_HOSTED === 'true';
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';
