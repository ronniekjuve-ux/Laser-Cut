import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const versionPlugin = {
  name: 'version-inject',
  transformIndexHtml(html) {
    const v = Date.now()
    return html.replace(/src="([^"]+\.js)"/, `src="$1?v=${v}"`)
  }
}

export default defineConfig({
  plugins: [react(), versionPlugin],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true }
    }
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
})
