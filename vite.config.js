import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// All paths point to the single root node_modules copy of React.
// Sub-paths (react/jsx-dev-runtime) must come BEFORE the base package
// (react) in the alias array — Vite/rollup does prefix matching, so
// 'react' would otherwise steal 'react/jsx-dev-runtime' first.
const reactPath        = path.resolve(__dirname, 'node_modules/react/index.js')
const reactDomPath     = path.resolve(__dirname, 'node_modules/react-dom/index.js')
const reactJsxPath     = path.resolve(__dirname, 'node_modules/react/jsx-runtime.js')
const reactJsxDevPath  = path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js')
const reactDomClient   = path.resolve(__dirname, 'node_modules/react-dom/client.js')

// resolveId hook as a secondary defence — alias handles the primary case
// but this catches anything that slips through pre-bundling.
function dedupeReactPlugin() {
  return {
    name: 'dedupe-react',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'react/jsx-dev-runtime') return { id: reactJsxDevPath, moduleSideEffects: false }
      if (id === 'react/jsx-runtime')     return { id: reactJsxPath,    moduleSideEffects: false }
      if (id === 'react-dom/client')      return { id: reactDomClient,  moduleSideEffects: false }
      if (id === 'react-dom')             return { id: reactDomPath,    moduleSideEffects: false }
      if (id === 'react')                 return { id: reactPath,       moduleSideEffects: false }
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
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom/client',
      '@tanstack/react-query',
    ],
    // Array form guarantees ordering — sub-paths before base packages
    // so the 'react' entry never prefix-matches 'react/jsx-dev-runtime'.
    alias: [
      { find: 'react/jsx-dev-runtime', replacement: reactJsxDevPath },
      { find: 'react/jsx-runtime',     replacement: reactJsxPath    },
      { find: 'react-dom/client',      replacement: reactDomClient  },
      { find: 'react-dom',             replacement: reactDomPath    },
      { find: 'react',                 replacement: reactPath       },
      { find: '@',                     replacement: path.resolve(__dirname, 'src') },
    ],
  },
  optimizeDeps: {
    force: true,
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom/client',
      'three',
      'three/examples/jsm/controls/OrbitControls.js',
      'sonner',
      'framer-motion',
      'lucide-react',
      '@tanstack/react-query',
      'recharts',
      'react-router-dom',
    ],
  },
})
