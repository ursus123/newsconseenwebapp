import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// Cache bust: 2026-04-02T01
export default defineConfig({
  logLevel: 'error',
  plugins: [
    base44({
      legacySDKImports: false,
    }),
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react-router-dom', '@tanstack/react-query', 'framer-motion'],
    alias: {
      '@': path.resolve('./src'),
    },
  },
  optimizeDeps: {
    force: true,
    include: ['react', 'react-dom', 'react/jsx-runtime'],
  },
})