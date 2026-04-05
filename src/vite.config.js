import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    base44({ legacySDKImports: false }),
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@tanstack/react-query'],
    alias: [
      { find: 'react/jsx-runtime',     replacement: '/app/node_modules/react/jsx-runtime.js' },
      { find: 'react/jsx-dev-runtime', replacement: '/app/node_modules/react/jsx-dev-runtime.js' },
      { find: 'react-dom/client',      replacement: '/app/node_modules/react-dom/client.js' },
      { find: 'react-dom',             replacement: '/app/node_modules/react-dom/index.js' },
      { find: 'react',                 replacement: '/app/node_modules/react/index.js' },
      { find: '@',                     replacement: path.resolve(__dirname, 'src') },
    ],
  },
  optimizeDeps: {
    force: true,
    exclude: ['@base44/sdk'],
  },
})