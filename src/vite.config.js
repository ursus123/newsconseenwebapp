import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

const reactPath = path.resolve('./node_modules/react/index.js')
const reactDomPath = path.resolve('./node_modules/react-dom/index.js')
const reactJsxPath = path.resolve('./node_modules/react/jsx-runtime.js')
const reactDomClientPath = path.resolve('./node_modules/react-dom/client.js')

// Force all react imports to the single root copy, including inside node_modules
function dedupeReactPlugin() {
  return {
    name: 'dedupe-react',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'react') return { id: reactPath, moduleSideEffects: false }
      if (id === 'react-dom') return { id: reactDomPath, moduleSideEffects: false }
      if (id === 'react/jsx-runtime') return { id: reactJsxPath, moduleSideEffects: false }
      if (id === 'react-dom/client') return { id: reactDomClientPath, moduleSideEffects: false }
      return null
    },
  }
}

// Cache bust: 2026-04-03T04
export default defineConfig({
  logLevel: 'error',
  plugins: [
    dedupeReactPlugin(),
    base44({
      legacySDKImports: false,
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve('./src'),
    },
  },
  optimizeDeps: {
    force: true,
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
})