import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// Cache bust: 2026-04-03T03
export default defineConfig({
  logLevel: 'error',
  plugins: [
    base44({
      legacySDKImports: false,
    }),
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', 'react-router-dom', '@tanstack/react-query', 'framer-motion'],
    alias: {
      '@': path.resolve('./src'),
      'react': path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
      'react/jsx-runtime': path.resolve('./node_modules/react/jsx-runtime'),
      'react-dom/client': path.resolve('./node_modules/react-dom/client'),
    },
  },
  optimizeDeps: {
    force: true,
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
})