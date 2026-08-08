import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@coral-xyz/anchor', '@solana/web3.js', 'buffer'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
})
