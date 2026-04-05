import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Plugin that removes any broken react aliases injected by other plugins
const fixReactAliases = {
  name: 'fix-react-aliases',
  enforce: 'post',
  config(config) {
    if (!config.resolve) return;
    const aliases = config.resolve.alias;
    if (!aliases) return;

    const fixAlias = (list) => {
      if (!Array.isArray(list)) return list;
      return list.filter(entry => {
        if (typeof entry.replacement === 'string' && entry.replacement.includes('/app_temp/')) {
          return false;
        }
        return true;
      });
    };

    if (Array.isArray(aliases)) {
      config.resolve.alias = fixAlias(aliases);
    }
  },
};

export default defineConfig({
  plugins: [
    base44({ legacySDKImports: false }),
    react(),
    fixReactAliases,
  ],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    force: true,
    exclude: ['@base44/sdk'],
  },
})