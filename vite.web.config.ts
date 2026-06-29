import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Standalone Vite build for the read-only browser demo (treemonk.eu/demo).
 * Reuses the entire renderer; the only swaps are the data layer (Electron IPC →
 * in-memory WASM SQLite) wired through module aliases below.
 */

// Redirect the repository layer's `./connection` import (the Node/better-sqlite3
// one) to the browser WASM connection — only for modules under src/main/db.
function aliasConnection(): Plugin {
  // Forward slashes so the returned id matches Vite's normalised module id —
  // otherwise (on Windows) the repo layer and the demo entry load two separate
  // copies of connection.ts and getDb() never sees the initialised database.
  const browser = resolve(__dirname, 'src/web/connection.ts').replace(/\\/g, '/')
  return {
    name: 'treemonk-alias-connection',
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        source === './connection' &&
        importer &&
        importer.replace(/\\/g, '/').includes('/src/main/db/')
      ) {
        return browser
      }
      return null
    }
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  // Served from a sub-path on the VPS.
  base: '/demo/',
  plugins: [aliasConnection(), react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
      // Node 'crypto' → Web Crypto shim (repo.ts imports randomUUID).
      crypto: resolve(__dirname, 'src/web/crypto-shim.ts')
    }
  },
  build: {
    outDir: resolve(__dirname, 'out-web'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000
  }
})
