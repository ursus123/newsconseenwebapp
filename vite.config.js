import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const reactPath      = path.resolve(__dirname, 'node_modules/react/index.js')
const reactDomPath   = path.resolve(__dirname, 'node_modules/react-dom/index.js')
const reactJsxPath   = path.resolve(__dirname, 'node_modules/react/jsx-runtime.js')
const reactDomClient = path.resolve(__dirname, 'node_modules/react-dom/client.js')

// Force every module — including pre-bundled SDK packages — to resolve
// to the single root React copy.  Using resolveId (enforce:'pre') catches
// bare specifiers that resolve.alias misses when Vite pre-bundles deps.
function dedupeReactPlugin() {
  return {
    name: 'dedupe-react',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'react')             return { id: reactPath,      moduleSideEffects: false }
      if (id === 'react-dom')         return { id: reactDomPath,   moduleSideEffects: false }
      if (id === 'react/jsx-runtime') return { id: reactJsxPath,   moduleSideEffects: false }
      if (id === 'react-dom/client')  return { id: reactDomClient, moduleSideEffects: false }
      return null
    },
  }
}

export default defineConfig({
  logLevel: 'error',
  plugins: [
    dedupeReactPlugin(),
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
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
    alias: {
      react:        reactPath,
      'react-dom':  reactDomPath,
      '@':          path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    // force:true clears stale .vite/deps cache that can serve mismatched
    // React chunks — the most common cause of the useState null crash.
    force: true,
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
})
