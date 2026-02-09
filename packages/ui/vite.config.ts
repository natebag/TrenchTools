import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    port: 3000,
    host: true,
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // Node.js polyfills
      { find: 'buffer', replacement: 'buffer' },
      { find: 'process', replacement: 'process/browser' },
      { find: 'events', replacement: path.resolve(__dirname, './src/stubs/events.ts') },
      { find: 'stream', replacement: 'stream-browserify' },
      { find: 'util', replacement: path.resolve(__dirname, './src/stubs/util.ts') },
      // Stub out Node-only modules
      { find: 'crypto', replacement: path.resolve(__dirname, './src/stubs/crypto.ts') },
      { find: 'fs/promises', replacement: path.resolve(__dirname, './src/stubs/fs.ts') },
      { find: 'fs', replacement: path.resolve(__dirname, './src/stubs/fs.ts') },
      { find: /^path$/, replacement: path.resolve(__dirname, './src/stubs/path.ts') },
      // Stub out argon2 (not needed for Solana, causes CJS issues)
      { find: '@noble/hashes/argon2', replacement: path.resolve(__dirname, './src/stubs/argon2.ts') },
      { find: 'argon2', replacement: path.resolve(__dirname, './src/stubs/argon2.ts') },
    ],
  },
  define: {
    'process.env': {
      NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'development'),
    },
    'global': 'globalThis',
    'Buffer': ['buffer', 'Buffer'],
  },
  optimizeDeps: {
    esbuildOptions: {
      // Fix for buffer and other polyfills
      define: {
        global: 'globalThis',
      },
    },
    include: [
      'buffer',
      'process',
      '@solana/web3.js',
    ],
    // No excludes needed - all handled via aliases
  },
  build: {
    rollupOptions: {
      // All Node modules handled via aliases, no externals needed
    },
  },
})
