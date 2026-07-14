import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Simulates a backup restored on ANOTHER machine: the data folder holds the
 * database, but workspaces.json still points at the old machine's absolute
 * path (different username). Before the healing fix the app died on launch
 * with "Cannot open database because the directory does not exist"; now it
 * must boot, adopt the local file and rewrite the registry.
 */

const PORT = 27127
const TOKEN = 'e2e-heal-token'
const BASE = `http://127.0.0.1:${PORT}`
const AUTH = { Authorization: `Bearer ${TOKEN}` }

let app: ElectronApplication
let dataDir: string

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'treemonk-heal-e2e-'))
  dataDir = join(userDataDir, 'data')
  mkdirSync(dataDir, { recursive: true })
  // The restored database is HERE (an empty file is a valid new SQLite db)…
  writeFileSync(join(dataDir, 'treemonk.db'), '')
  // …but the restored registry points at the old machine's user folder.
  const staleFile = 'C:\\Users\\regi-gep-user\\AppData\\Roaming\\treemonk\\data\\treemonk.db'
  writeFileSync(
    join(dataDir, 'workspaces.json'),
    JSON.stringify(
      {
        active: 'ws-1',
        workspaces: [
          { id: 'ws-1', name: 'Családfa', file: staleFile, color: '#6366f1', createdAt: '2026-01-01T00:00:00.000Z' }
        ]
      },
      null,
      2
    ),
    'utf-8'
  )

  app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      TREEMONK_API: '1',
      TREEMONK_API_PORT: String(PORT),
      TREEMONK_API_TOKEN: TOKEN
    }
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await expect(async () => {
    const r = await fetch(`${BASE}/api/v1/ping`)
    expect(r.ok).toBe(true)
  }).toPass({ timeout: 20_000 })
})

test.afterAll(async () => {
  await app.close()
})

test('boots on a foreign-path registry and heals it to the local file', async () => {
  // The app is up and serving — the old behaviour was a fatal dialog + exit.
  const stats = await (await fetch(`${BASE}/api/v1/stats`, { headers: AUTH })).json()
  expect(typeof stats.people).toBe('number')

  // The registry now points at the file that actually exists on this machine.
  const registry = JSON.parse(readFileSync(join(dataDir, 'workspaces.json'), 'utf-8'))
  expect(registry.workspaces[0].file).toBe(join(dataDir, 'treemonk.db'))
})
