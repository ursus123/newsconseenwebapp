import base44 from "@base44/vite-plugin"
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Resolve the actual react and react-dom directories
const reactDir = path.dirname(require.resolve('react/package.json'))
const reactDomDir = path.dirname(require.resolve('react-dom/package.json'))

export default defineConfig({
  plugins: [
    base44(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'react/jsx-runtime': path.join(reactDir, 'jsx-runtime.js'),
      'react/jsx-dev-runtime': path.join(reactDir, 'jsx-dev-runtime.js'),
      'react-dom/client': path.join(reactDomDir, 'client.js'),
      'react-dom/server': path.join(reactDomDir, 'server.js'),
      'react': path.join(reactDir, 'index.js'),
      'react-dom': path.join(reactDomDir, 'index.js'),
    },
  },
})