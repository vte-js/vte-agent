import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // root is this config's directory (web-ide/client)
  root: __dirname,
  plugins: [vue()],
  resolve: {
    alias: {
      // Reuse the existing webview component library + theme (c- namespace).
      // M3 will swap the minimal panes below for these real components.
      '@webview': path.resolve(__dirname, '../../webview/src'),
      '@theme': path.resolve(__dirname, '../../webview/src/theme.css'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
