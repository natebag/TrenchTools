/**
 * Browser stub for Node.js 'crypto' module
 * Uses Web Crypto API where possible
 */

export function randomBytes(size: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size));
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

export function createCipheriv(_algorithm: string, _key: any, _iv: any): any {
  console.warn('crypto.createCipheriv is not fully supported in browser - use Web Crypto API');
  throw new Error('crypto.createCipheriv not available in browser - use Web Crypto API instead');
}

export function createDecipheriv(_algorithm: string, _key: any, _iv: any): any {
  console.warn('crypto.createDecipheriv is not fully supported in browser - use Web Crypto API');
  throw new Error('crypto.createDecipheriv not available in browser - use Web Crypto API instead');
}

export function createHash(_algorithm: string): any {
  return {
    update: function(_data: any) { return this; },
    digest: function(_encoding?: string) {
      throw new Error('crypto.createHash not available in browser - use Web Crypto API');
    }
  };
}

export function createHmac(_algorithm: string, _key: any): any {
  return {
    update: function(_data: any) { return this; },
    digest: function(_encoding?: string) {
      throw new Error('crypto.createHmac not available in browser - use Web Crypto API');
    }
  };
}

export function pbkdf2Sync(
  _password: any,
  _salt: any,
  _iterations: number,
  _keylen: number,
  _digest: string
): Buffer {
  throw new Error('crypto.pbkdf2Sync not available in browser - use Web Crypto API');
}

export function scryptSync(_password: any, _salt: any, _keylen: number): Buffer {
  throw new Error('crypto.scryptSync not available in browser - use Web Crypto API');
}

// Export webcrypto for libraries that check for it
export const webcrypto = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined;

export default {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  pbkdf2Sync,
  scryptSync,
  webcrypto,
};
