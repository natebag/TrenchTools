import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'wallet/index': 'src/wallet/index.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ['@solana/web3.js', '@solana/spl-token', 'argon2', 'bip39', 'ed25519-hd-key'],
});
