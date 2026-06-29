import React from 'react'
import ReactDOM from 'react-dom/client'
import i18n from 'i18next'
import { toast } from 'sonner'
import App from '@/App'
import '@/i18n'
import '@/index.css'
import '@xyflow/react/dist/style.css'
import { useTheme, type Theme } from '@/store/useTheme'
import { initSettings } from '@/store/useSettings'
import { initDemoDb } from './connection'
import { createDemoApi, setReadOnlyHandler } from './api-browser'
import { DemoBanner } from './DemoBanner'
import { DemoIntroModal } from './DemoIntroModal'
import dbUrl from '../../resources/demo.sqlite?url'

// The demo always starts in light mode (a manual toggle still sticks afterwards).
function initDemoTheme(): void {
  const stored = localStorage.getItem('treemonk.theme') as Theme | null
  useTheme.getState().setTheme(stored === 'dark' || stored === 'light' ? stored : 'light')
}

// Flags the build as the read-only demo so the renderer can hide write-only
// features (FamilySearch / GEDCOM import, etc.). Set before anything renders.
;(window as unknown as { __TREEMONK_DEMO__?: boolean }).__TREEMONK_DEMO__ = true

async function boot(): Promise<void> {
  // Load the bundled sample database into in-memory WASM SQLite, then expose the
  // read-only browser API as window.api exactly like the Electron preload does.
  const bytes = new Uint8Array(await (await fetch(dbUrl)).arrayBuffer())
  await initDemoDb(bytes)
  window.api = createDemoApi()
  setReadOnlyHandler(() => toast(i18n.t('demo.readonlyToast'), { id: 'demo-readonly' }))

  initDemoTheme()
  initSettings()

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
      <DemoBanner />
      <DemoIntroModal />
    </React.StrictMode>
  )
}

void boot()
