import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const fixBrokenSubpaths = {
  name: 'fix-broken-subpaths',
  enforce: 'pre',
  resolveId(id) {
    // base44 plugin aliases react → /app_temp/.../react/index.js
    // so react/jsx-runtime becomes /app_temp/.../react/index.js/jsx-runtime (ENOTDIR)
    // We intercept and return the correct path
    const reactMatch = id.match(/^(.*\/react)\/index\.js\/(.+)$/)
    if (reactMatch) {
      return path.join(reactMatch[1], reactMatch[2] + '.js')
    }
    const reactDomMatch = id.match(/^(.*\/react-dom)\/index\.js\/(.+)$/)
    if (reactDomMatch) {
      return path.join(reactDomMatch[1], reactDomMatch[2] + '.js')
    }
  }
}

export default defineConfig({
  plugins: [
    base44(),
    fixBrokenSubpaths,
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})