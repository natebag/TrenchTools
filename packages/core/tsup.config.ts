import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'wallet/index': 'src/wallet/index.ts',
    'snipe/index': 'src/snipe/index.ts',
    'trading/index': 'src/trading/index.ts',
    'browser/index': 'src/browser/index.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: false,
  external: ['@solana/web3.js', '@solana/spl-token', 'argon2', 'bip39', 'ed25519-hd-key'],
});
