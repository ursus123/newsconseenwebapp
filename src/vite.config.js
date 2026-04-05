import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const reactDir = path.dirname(require.resolve('react/package.json'))
const reactDomDir = path.dirname(require.resolve('react-dom/package.json'))

// Intercept any broken react imports at resolve time
const forceLocalReact = {
  name: 'force-local-react',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'react') return { id: path.join(reactDir, 'index.js'), moduleSideEffects: false }
    if (id === 'react/jsx-runtime') return { id: path.join(reactDir, 'jsx-runtime.js'), moduleSideEffects: false }
    if (id === 'react/jsx-dev-runtime') return { id: path.join(reactDir, 'jsx-dev-runtime.js'), moduleSideEffects: false }
    if (id === 'react-dom') return { id: path.join(reactDomDir, 'index.js'), moduleSideEffects: false }
    if (id === 'react-dom/client') return { id: path.join(reactDomDir, 'client.js'), moduleSideEffects: false }
    return null
  },
}

export default defineConfig({
  plugins: [
    base44({ legacySDKImports: false }),
    forceLocalReact,
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    exclude: ['@base44/sdk'],
  },
})