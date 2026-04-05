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

// This plugin runs after all others and fixes any react alias pointing to a file instead of a directory
const fixReactAlias = {
  name: 'fix-react-alias',
  enforce: 'post',
  configResolved(config) {
    const aliases = config.resolve.alias
    if (!Array.isArray(aliases)) return
    for (const entry of aliases) {
      if (entry.find === 'react' || entry.find?.source === '^react$') {
        // If replacement ends with .js it's a file path — replace with directory
        if (typeof entry.replacement === 'string' && entry.replacement.endsWith('.js')) {
          entry.replacement = reactDir
        }
      }
    }
  },
}

export default defineConfig({
  plugins: [
    base44({ legacySDKImports: false }),
    react(),
    fixReactAlias,
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@tanstack/react-query'],
    alias: [
      { find: 'react', replacement: reactDir },
      { find: 'react-dom', replacement: reactDomDir },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    exclude: ['@base44/sdk'],
  },
})