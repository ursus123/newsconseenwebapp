import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// Cache bust: 2026-04-04T01
export default defineConfig({
  plugins: [
    base44({
      legacySDKImports: false,
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve('./src'),
      // Hard-redirect every react import to the single root copy
      'react': path.resolve('./node_modules/react/index.js'),
      'react-dom': path.resolve('./node_modules/react-dom/index.js'),
      'react/jsx-runtime': path.resolve('./node_modules/react/jsx-runtime.js'),
      'react-dom/client': path.resolve('./node_modules/react-dom/client.js'),
    },
    // Vite's built-in deduplication — ensures only one copy is resolved
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
  optimizeDeps: {
    force: true,
    // Pre-bundle react itself so only one optimized copy exists
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
    // Exclude the SDK from pre-bundling so it goes through resolve.alias above
    exclude: ['@base44/sdk'],
  },
})