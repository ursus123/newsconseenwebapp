import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// Cache bust: 2026-04-04T01

// Permanent plugin: force all react/react-dom imports to the single root copy
const reactDedupePlugin = {
  name: 'force-single-react',
  enforce: 'pre',
  resolveId(source) {
    const REACT_PACKAGES = {
      'react': path.resolve('./node_modules/react/index.js'),
      'react-dom': path.resolve('./node_modules/react-dom/index.js'),
      'react/jsx-runtime': path.resolve('./node_modules/react/jsx-runtime.js'),
      'react-dom/client': path.resolve('./node_modules/react-dom/client.js'),
    };
    if (REACT_PACKAGES[source]) return REACT_PACKAGES[source];
    return null;
  },
};

export default defineConfig({
  plugins: [
    base44({
      legacySDKImports: false,
    }),
    react(),
    reactDedupePlugin,
  ],
  resolve: {
    alias: {
      '@': path.resolve('./src'),
      'react': path.resolve('./node_modules/react/index.js'),
      'react-dom': path.resolve('./node_modules/react-dom/index.js'),
      'react/jsx-runtime': path.resolve('./node_modules/react/jsx-runtime.js'),
      'react-dom/client': path.resolve('./node_modules/react-dom/client.js'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    force: true,
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
    exclude: ['@base44/sdk'],
  },
})