import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const reactPkg = require.resolve('react/package.json')
const reactDomPkg = require.resolve('react-dom/package.json')
const reactDir = path.dirname(reactPkg)
const reactDomDir = path.dirname(reactDomPkg)

// Map every react sub-path to the correct file
const reactSubpaths = {
  'react':                  path.join(reactDir, 'index.js'),
  'react/jsx-runtime':      path.join(reactDir, 'jsx-runtime.js'),
  'react/jsx-dev-runtime':  path.join(reactDir, 'jsx-dev-runtime.js'),
  'react-dom':              path.join(reactDomDir, 'index.js'),
  'react-dom/client':       path.join(reactDomDir, 'client.js'),
  'react-dom/server':       path.join(reactDomDir, 'server.js'),
}

const forceLocalReact = {
  name: 'force-local-react',
  enforce: 'pre',
  resolveId(id, importer) {
    // Direct bare import match
    if (reactSubpaths[id]) {
      return { id: reactSubpaths[id], moduleSideEffects: false }
    }
    // Catch broken absolute paths like /app_temp/node_modules/react/index.js/jsx-runtime
    if (id.includes('/react/index.js/')) {
      const sub = id.split('/react/index.js/')[1]
      const fixed = path.join(reactDir, sub + '.js')
      return { id: fixed, moduleSideEffects: false }
    }
    if (id.includes('/react-dom/index.js/')) {
      const sub = id.split('/react-dom/index.js/')[1]
      const fixed = path.join(reactDomDir, sub + '.js')
      return { id: fixed, moduleSideEffects: false }
    }
    return null
  },
}

export default defineConfig({
  plugins: [
    base44({ legacySDKImports: false }),
    forceLocalReact,
    react(),
  ],
  cacheDir: '.vite-cache-v4',
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    force: true,
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    exclude: ['@base44/sdk'],
  },
})