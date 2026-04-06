import base44 from "@base44/vite-plugin"
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const reactDir = path.dirname(require.resolve('react/package.json'))
const reactDomDir = path.dirname(require.resolve('react-dom/package.json'))

const fixReactPaths = {
  name: 'fix-react-paths',
  enforce: 'pre',
  resolveId(id) {
    // Intercept bare sub-path imports
    if (id === 'react/jsx-runtime')     return path.join(reactDir, 'jsx-runtime.js')
    if (id === 'react/jsx-dev-runtime') return path.join(reactDir, 'jsx-dev-runtime.js')
    if (id === 'react-dom/client')      return path.join(reactDomDir, 'client.js')
    if (id === 'react-dom/server')      return path.join(reactDomDir, 'server.js')
    if (id === 'react-dom')             return path.join(reactDomDir, 'index.js')
    if (id === 'react')                 return path.join(reactDir, 'index.js')

    // Intercept already-broken absolute paths like:
    // /app_temp/.../react/index.js/jsx-runtime
    // /app_temp/.../react/index.js/jsx-dev-runtime
    const brokenReact = id.match(/\/react\/index\.js\/(.+)$/)
    if (brokenReact) return path.join(reactDir, brokenReact[1] + '.js')

    const brokenReactDom = id.match(/\/react-dom\/index\.js\/(.+)$/)
    if (brokenReactDom) return path.join(reactDomDir, brokenReactDom[1] + '.js')
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