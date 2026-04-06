import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Resolve react paths from THIS project's node_modules
const reactDir = path.resolve(__dirname, 'node_modules/react')
const reactDomDir = path.resolve(__dirname, 'node_modules/react-dom')

export default defineConfig({
  plugins: [
    base44({ legacySDKImports: false }),
    {
      name: 'fix-react-subpath',
      enforce: 'pre',
      resolveId(id) {
        // Fix broken absolute paths injected by base44 plugin alias
        // e.g. /app_temp/node_modules/react/index.js/jsx-runtime
        if (/\/react\/index\.js\/(.+)$/.test(id)) {
          const sub = id.match(/\/react\/index\.js\/(.+)$/)[1]
          return path.join(reactDir, sub + '.js')
        }
        if (/\/react-dom\/index\.js\/(.+)$/.test(id)) {
          const sub = id.match(/\/react-dom\/index\.js\/(.+)$/)[1]
          return path.join(reactDomDir, sub + '.js')
        }
        // Fix bare subpath imports redirected wrongly
        if (id === 'react/jsx-runtime') return path.join(reactDir, 'jsx-runtime.js')
        if (id === 'react/jsx-dev-runtime') return path.join(reactDir, 'jsx-dev-runtime.js')
        if (id === 'react-dom/client') return path.join(reactDomDir, 'client.js')
        if (id === 'react-dom/server') return path.join(reactDomDir, 'server.js')
      }
    },
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})