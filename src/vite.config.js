import base44 from "@base44/vite-plugin"
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const reactDir = path.dirname(require.resolve('react/package.json'))
const reactDomDir = path.dirname(require.resolve('react-dom/package.json'))

const jsxRuntime     = path.join(reactDir, 'jsx-runtime.js')
const jsxDevRuntime  = path.join(reactDir, 'jsx-dev-runtime.js')
const reactDomClient = path.join(reactDomDir, 'client.js')
const reactDomServer = path.join(reactDomDir, 'server.js')

function resolveReactSubpath(id) {
  // Direct sub-path imports
  if (id === 'react/jsx-dev-runtime') return jsxDevRuntime
  if (id === 'react/jsx-runtime')     return jsxRuntime
  if (id === 'react-dom/client')      return reactDomClient
  if (id === 'react-dom/server')      return reactDomServer

  // Broken absolute paths: /path/to/react/index.js/jsx-runtime (no extension)
  // or /path/to/react/index.js/jsx-runtime.js (with extension)
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

const fixReactPaths = {
  name: 'fix-react-paths',
  enforce: 'pre',
  resolveId(id) {
    return resolveReactSubpath(id)
  },
  load(id) {
    // Last resort: if the broken path slipped through resolveId, serve the file content
    const fixed = resolveReactSubpath(id)
    if (fixed && fs.existsSync(fixed)) return fs.readFileSync(fixed, 'utf-8')
    return null
  }
}

export default defineConfig({
  plugins: [
    fixReactPaths,
    base44(),
  ],
  resolve: {
    alias: {
      // Only alias sub-paths — NOT bare 'react'/'react-dom' to avoid base44 conflict
      'react/jsx-dev-runtime': jsxDevRuntime,
      'react/jsx-runtime':     jsxRuntime,
      'react-dom/client':      reactDomClient,
      'react-dom/server':      reactDomServer,
      '@':                     path.resolve(__dirname, 'src'),
    },
  },
})