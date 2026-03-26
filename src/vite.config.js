import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

const r = (p) => path.resolve('./node_modules/' + p)

export default defineConfig({
  logLevel: 'error',
  plugins: [
    {
      name: 'force-single-react',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'react') return r('react/index.js')
        if (id === 'react-dom') return r('react-dom/index.js')
        if (id === 'react/jsx-runtime') return r('react/jsx-runtime.js')
        if (id === 'react/jsx-dev-runtime') return r('react/jsx-dev-runtime.js')
        if (id === 'react-dom/client') return r('react-dom/client.js')
      }
    },
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
    dedupe: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'framer-motion'],
    alias: [
      { find: /^react$/, replacement: r('react/index.js') },
      { find: /^react-dom$/, replacement: r('react-dom/index.js') },
      { find: /^react\/jsx-runtime$/, replacement: r('react/jsx-runtime.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: r('react/jsx-dev-runtime.js') },
      { find: /^react-dom\/client$/, replacement: r('react-dom/client.js') },
      { find: '@', replacement: path.resolve('./src') },
    ],
  },
  optimizeDeps: {
    force: true,
    include: [
      'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime',
      'react-router-dom', '@tanstack/react-query', 'framer-motion',
    ],
  },
})