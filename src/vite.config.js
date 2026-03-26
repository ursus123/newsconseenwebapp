import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// Cache bust: 2026-03-26T04
export default defineConfig({
  logLevel: 'error',
  plugins: [
    base44({
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
    }),
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'framer-motion'],
    alias: {
      '@': path.resolve('./src'),
    },
  },
  optimizeDeps: {
    force: true,
  },
})