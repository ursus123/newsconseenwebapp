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

// Map of broken-path patterns to real file paths
function fixId(id) {
  if (id === 'react/jsx-runtime')     return path.join(reactDir, 'jsx-runtime.js')
  if (id === 'react/jsx-dev-runtime') return path.join(reactDir, 'jsx-dev-runtime.js')
  if (id === 'react-dom/client')      return path.join(reactDomDir, 'client.js')
  if (id === 'react-dom/server')      return path.join(reactDomDir, 'server.js')

  // Catch broken absolute paths: /path/react/index.js/jsx-dev-runtime
  const brokenReact = id.match(/\/react\/index\.js\/(.+)$/)
  if (brokenReact) return path.join(reactDir, `${brokenReact[1]}.js`)

  const brokenReactDom = id.match(/\/react-dom\/index\.js\/(.+)$/)
  if (brokenReactDom) return path.join(reactDomDir, `${brokenReactDom[1]}.js`)

  return null
}

const fixReactPaths = {
  name: 'fix-react-paths',
  enforce: 'pre',
  resolveId(id) {
    return fixId(id) || null
  },
  load(id) {
    const fixed = fixId(id)
    if (fixed && fs.existsSync(fixed)) {
      return fs.readFileSync(fixed, 'utf-8')
    }
    // Also handle if the id itself is the broken path
    if (id.match(/\/react\/index\.js\//) || id.match(/\/react-dom\/index\.js\//)) {
      const fixed2 = fixId(id)
      if (fixed2 && fs.existsSync(fixed2)) {
        return fs.readFileSync(fixed2, 'utf-8')
      }
    }
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
      '@': path.resolve(__dirname, 'src'),
    },
  },
})