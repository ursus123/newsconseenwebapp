import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function autoReactImport() {
  return {
    name: 'auto-react-import',
    transform(code, id) {
      if (!id.includes('node_modules') && (id.endsWith('.jsx') || id.endsWith('.js'))) {
        if (
          (code.includes('useState') || code.includes('useEffect') ||
           code.includes('useContext') || code.includes('useRef') ||
           code.includes('useCallback') || code.includes('useMemo') ||
           code.includes('useReducer')) &&
          !code.includes("import React") &&
          (code.includes("from 'react'") || code.includes('from "react"'))
        ) {
          return `import React from 'react';\n${code}`;
        }
      }
    }
  }
}

export default defineConfig({
  logLevel: 'error',
  plugins: [
    autoReactImport(),
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
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
})