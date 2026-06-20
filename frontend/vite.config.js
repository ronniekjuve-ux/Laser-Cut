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
