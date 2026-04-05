import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nm = path.resolve(projectRoot, 'node_modules')

// Cache bust: 2026-04-05T02
export default defineConfig({
  plugins: [
    base44({ legacySDKImports: false }),
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: [
      { find: 'react/jsx-dev-runtime', replacement: path.resolve(nm, 'react/jsx-dev-runtime.js') },
      { find: 'react/jsx-runtime',     replacement: path.resolve(nm, 'react/jsx-runtime.js') },
      { find: 'react-dom/client',      replacement: path.resolve(nm, 'react-dom/client.js') },
      { find: 'react-dom',             replacement: path.resolve(nm, 'react-dom/index.js') },
      { find: 'react',                 replacement: path.resolve(nm, 'react/index.js') },
      { find: '@',                     replacement: path.resolve(projectRoot, 'src') },
    ],
  },
  optimizeDeps: {
    force: true,
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'],
    exclude: ['@base44/sdk'],
  },
})