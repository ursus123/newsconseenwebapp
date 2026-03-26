import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

const reactPkg = path.resolve('./node_modules/react')
const reactDomPkg = path.resolve('./node_modules/react-dom')
const reactJsxRuntime = path.resolve('./node_modules/react/jsx-runtime')
const reactJsxDevRuntime = path.resolve('./node_modules/react/jsx-dev-runtime')

export default defineConfig({
  logLevel: 'error',
  plugins: [
    base44({
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
  ],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "framer-motion",
    ],
    alias: [
      { find: 'react', replacement: reactPkg },
      { find: 'react-dom', replacement: reactDomPkg },
      { find: 'react/jsx-runtime', replacement: reactJsxRuntime },
      { find: 'react/jsx-dev-runtime', replacement: reactJsxDevRuntime },
      { find: 'react-router-dom', replacement: path.resolve('./node_modules/react-router-dom') },
      { find: '@tanstack/react-query', replacement: path.resolve('./node_modules/@tanstack/react-query') },
      { find: '@', replacement: path.resolve('./src') },
    ],
  },
  optimizeDeps: {
    force: true,
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-router-dom",
      "@tanstack/react-query",
      "framer-motion",
    ],
  },
  build: {
    rollupOptions: {
      // Ensure a single chunk owns React so no plugin can re-bundle it
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) {
            return 'vendor-react'
          }
        }
      }
    }
  }
})