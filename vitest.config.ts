import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Standalone Vitest config (separate from electron.vite.config.ts). It mirrors
// the renderer path aliases so tests can import via '@/...' and '@shared/...'.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    // jsdom gives tests a fake browser (localStorage, navigator, document) so
    // modules that touch the DOM on import (e.g. i18n) load cleanly.
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}']
  }
})
