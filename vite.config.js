import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'save-port',
      configureServer(server) {
        server.httpServer.once('listening', () => {
          const addr = server.httpServer.address()
          fs.writeFileSync(
            path.resolve(__dirname, '.vite-port'),
            String(addr.port)
          )
        })
      }
    }
  ],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 17173,
    strictPort: false
  }
})
