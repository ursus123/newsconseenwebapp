import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Dynamic resolution — works regardless of project layout or container path.
// require.resolve finds the actually-installed copy of React.
const reactDir    = path.dirname(require.resolve('react/package.json'))
const reactDomDir = path.dirname(require.resolve('react-dom/package.json'))

const SUBPATH_MAP = {
  'react/jsx-dev-runtime': path.join(reactDir, 'jsx-dev-runtime.js'),
  'react/jsx-runtime':     path.join(reactDir, 'jsx-runtime.js'),
  'react-dom/client':      path.join(reactDomDir, 'client.js'),
  'react-dom/server':      path.join(reactDomDir, 'server.js'),
}

// Handles two cases:
//   1. Clean sub-path imports: 'react/jsx-dev-runtime'
//   2. Mangled paths produced when the 'react' alias prefix-matches first:
//      '/path/to/react/index.js/jsx-dev-runtime' → corrected
function fixBrokenId(id) {
  if (SUBPATH_MAP[id]) return SUBPATH_MAP[id]

  const mReact = id.match(/\/react\/index\.js\/(.+?)(?:\.js)?$/)
  if (mReact) {
    const candidate = path.join(reactDir, mReact[1] + '.js')
    if (fs.existsSync(candidate)) return candidate
  }
  const mReactDom = id.match(/\/react-dom\/index\.js\/(.+?)(?:\.js)?$/)
  if (mReactDom) {
    const candidate = path.join(reactDomDir, mReactDom[1] + '.js')
    if (fs.existsSync(candidate)) return candidate
  }

  return null
}

// Rollup-compatible plugin (runs during production build)
const rollupFixPlugin = {
  name: 'fix-react-paths-rollup',
  resolveId(id) {
    return fixBrokenId(id)
  },
  load(id) {
    const fixed = fixBrokenId(id)
    if (fixed && fs.existsSync(fixed)) return fs.readFileSync(fixed, 'utf-8')
    return null
  },
}

// Vite plugin (enforce:'pre') — catches imports before base44 plugin runs
const viteFixPlugin = {
  name: 'fix-react-paths-vite',
  enforce: 'pre',
  resolveId(id) {
    return fixBrokenId(id)
  },
  load(id) {
    const fixed = fixBrokenId(id)
    if (fixed && fs.existsSync(fixed)) return fs.readFileSync(fixed, 'utf-8')
    return null
  },
  // Rewrite any string literals that slipped through (pre-bundled chunks etc.)
  transform(code) {
    let result = code
    for (const [subpath, target] of Object.entries(SUBPATH_MAP)) {
      const escaped = subpath.replace(/\//g, '\\/')
      result = result
        .replace(new RegExp(`"${escaped}"`, 'g'), `"${target}"`)
        .replace(new RegExp(`'${escaped}'`, 'g'), `'${target}'`)
    }
    return result !== code ? { code: result, map: null } : null
  },
}

// Cache bust: 2026-04-17T02
export default defineConfig({
  plugins: [
    viteFixPlugin,
    base44(),
    react(),
  ],
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom/client',
      '@tanstack/react-query',
      '@base44/sdk',
    ],
    // Sub-paths only — no base 'react' or 'react-dom' alias here, which
    // prevents prefix-matching from mangling 'react/jsx-dev-runtime'.
    alias: {
      'react':                 path.join(reactDir, 'index.js'),
      'react-dom':             path.join(reactDomDir, 'index.js'),
      'react/jsx-dev-runtime': SUBPATH_MAP['react/jsx-dev-runtime'],
      'react/jsx-runtime':     SUBPATH_MAP['react/jsx-runtime'],
      'react-dom/client':      SUBPATH_MAP['react-dom/client'],
      'react-dom/server':      SUBPATH_MAP['react-dom/server'],
      '@':                     path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    force: true,
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom/client',
      // Pre-bundle ESM-only packages so they share the same React instance
      'three',
      'three/examples/jsm/controls/OrbitControls.js',
      'sonner',
      'framer-motion',
      'lucide-react',
      '@tanstack/react-query',
      'recharts',
      'react-router-dom',
    ],
    exclude: ['@base44/sdk'],
  },
  build: {
    rollupOptions: {
      plugins: [rollupFixPlugin],
      external: [],
    },
  },
})