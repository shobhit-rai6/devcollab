import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin"
    },
    proxy: {
      // HTTP proxies
      '/users': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/projects': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/ai': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/cdn': {
        target: 'https://unpkg.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cdn/, '')
      },
      // WebSocket proxy - this is the critical fix!
      '/socket.io': {
        target: 'ws://localhost:3000',
        ws: true,  // Enable WebSocket proxying
        changeOrigin: true
      }
    }
  }
})