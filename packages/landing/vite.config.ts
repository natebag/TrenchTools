import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  preview: {
    allowedHosts: ['trenchsniper-os-production.up.railway.app', '.railway.app'],
    port: 3000,
    host: true,
  },
})
