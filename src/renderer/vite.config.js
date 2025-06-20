import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import autoImport from 'unplugin-auto-import/vite'
import path from 'path'

export default defineConfig({
  plugins: [vue(), autoImport({ imports: ['vue',] })],
  root: path.resolve(__dirname),
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true
  },
  server: {
    port: 3005
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '')
    }
  }
})