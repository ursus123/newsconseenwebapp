import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'

// Resolve relative to project root, not src/
const projectRoot  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reactPath         = path.resolve(projectRoot, 'node_modules/react/index.js')
const reactDomPath      = path.resolve(projectRoot, 'node_modules/react-dom/index.js')
const reactJsxPath      = path.resolve(projectRoot, 'node_modules/react/jsx-runtime.js')
const reactJsxDevPath   = path.resolve(projectRoot, 'node_modules/react/jsx-dev-runtime.js')
const reactDomClient    = path.resolve(projectRoot, 'node_modules/react-dom/client.js')

function dedupeReactPlugin() {
  return {
    name: 'dedupe-react',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'react')                 return { id: reactPath,       moduleSideEffects: false }
      if (id === 'react-dom')             return { id: reactDomPath,    moduleSideEffects: false }
      if (id === 'react/jsx-runtime')     return { id: reactJsxPath,    moduleSideEffects: false }
      if (id === 'react/jsx-dev-runtime') return { id: reactJsxDevPath, moduleSideEffects: false }
      if (id === 'react-dom/client')      return { id: reactDomClient,  moduleSideEffects: false }
      return null
    },
  }
}

// Cache bust: 2026-04-04T01
export default defineConfig({
  plugins: [
    dedupeReactPlugin(),
    base44({
      legacySDKImports: false,
    }),
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
    alias: {
      '@': path.resolve(projectRoot, 'src'),
    },
  },
  optimizeDeps: {
    force: true,
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
    exclude: ['@base44/sdk'],
  },
})