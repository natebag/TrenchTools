/**
 * Browser stub for argon2
 * Argon2 is a password hashing algorithm not needed for Solana wallet operations
 * This stub prevents the CJS import error
 */

export const argon2id = () => {
  throw new Error('argon2 is not available in browser - use a different hashing method');
};

export const argon2i = () => {
  throw new Error('argon2 is not available in browser - use a different hashing method');
};

export const argon2d = () => {
  throw new Error('argon2 is not available in browser - use a different hashing method');
};

export default {
  argon2id,
  argon2i,
  argon2d,
};
