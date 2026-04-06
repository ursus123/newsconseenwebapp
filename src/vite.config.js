import base44 from "@base44/vite-plugin"
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const reactDir    = path.dirname(require.resolve('react/package.json'))
const reactDomDir = path.dirname(require.resolve('react-dom/package.json'))

const SUBPATH_MAP = {
  'react/jsx-dev-runtime': path.join(reactDir, 'jsx-dev-runtime.js'),
  'react/jsx-runtime':     path.join(reactDir, 'jsx-runtime.js'),
  'react-dom/client':      path.join(reactDomDir, 'client.js'),
  'react-dom/server':      path.join(reactDomDir, 'server.js'),
}

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

// Rollup-compatible plugin (no enforce/transform — pure Rollup hooks)
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

// Vite plugin with enforce:'pre' + transform to rewrite imports before base44
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

export default defineConfig({
  plugins: [
    viteFixPlugin,
    base44(),
  ],
  resolve: {
    alias: {
      'react/jsx-dev-runtime': SUBPATH_MAP['react/jsx-dev-runtime'],
      'react/jsx-runtime':     SUBPATH_MAP['react/jsx-runtime'],
      'react-dom/client':      SUBPATH_MAP['react-dom/client'],
      'react-dom/server':      SUBPATH_MAP['react-dom/server'],
      '@':                     path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      // Inject the fix at the Rollup level too, before any other plugins
      plugins: [rollupFixPlugin],
    },
  },
})