import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import inject from '@rollup/plugin-inject'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Force all packages to use the same browser-safe buffer
      buffer: 'buffer/',
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@coral-xyz/anchor', '@solana/web3.js', 'buffer'],
    esbuildOptions: {
      // Inject Buffer globally during dep optimization
      define: {
        global: 'globalThis',
      },
      plugins: [],
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      // Inject Buffer as a global import into every module that uses it
      plugins: [inject({ Buffer: ['buffer', 'Buffer'] })],
    },
  },
})
