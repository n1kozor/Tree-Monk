import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Boots the app with the example plugin pre-installed + enabled, then checks
 * the two halves of the plugin system:
 *  - the API enforces the plugin token's scopes (read yes; write/docs/MCP no)
 *  - the sidebar shows the plugin's menu entry and the sandboxed panel loads
 *    real data through the local API.
 */

const PORT = 27147
const PLUGIN_TOKEN = 'plg_e2e-scoped-token'
const BASE = `http://127.0.0.1:${PORT}`
const AUTH = { Authorization: `Bearer ${PLUGIN_TOKEN}` }

let app: ElectronApplication
let window: Page

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'treemonk-plugins-e2e-'))
  const pluginsDir = join(userDataDir, 'plugins')
  mkdirSync(join(pluginsDir, 'longevity-top'), { recursive: true })
  // Tests run from the repo root (same convention as the 'out/main/index.js' arg).
  cpSync(join(process.cwd(), 'examples', 'plugins', 'longevity-top'), join(pluginsDir, 'longevity-top'), {
    recursive: true
  })
  writeFileSync(
    join(pluginsDir, 'plugins.json'),
    JSON.stringify({ 'longevity-top': { enabled: true, token: PLUGIN_TOKEN } }, null, 2)
  )

  app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
    // NOTE: the API toggle is OFF — the server must run anyway because a
    // plugin is enabled (that used to be the api.enabled-only condition).
    env: { ...process.env, TREEMONK_API_PORT: String(PORT) }
  })
  window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  // Skip the first-launch mode chooser (it blocks clicks on a fresh profile).
  await window.evaluate(() => {
    localStorage.setItem('tm_start_choice', '1')
    localStorage.setItem('tm_fs_mode', '0')
  })
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await expect(async () => {
    const r = await fetch(`${BASE}/api/v1/ping`)
    expect(r.ok).toBe(true)
  }).toPass({ timeout: 20_000 })
})

test.afterAll(async () => {
  await app?.close()
})

test('plugin token: read allowed, write/documents/mcp denied', async () => {
  const people = await fetch(`${BASE}/api/v1/people`, { headers: AUTH })
  expect(people.status).toBe(200)

  const write = await fetch(`${BASE}/api/v1/people`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ givenName: 'Nope', surname: 'Nope' })
  })
  expect(write.status).toBe(403)

  const file = await fetch(`${BASE}/api/v1/documents/whatever/file`, { headers: AUTH })
  expect(file.status).toBe(403) // 'documents' scope was not granted

  const mcp = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
  })
  expect(mcp.status).toBe(403) // MCP is never plugin-accessible

  const bogus = await fetch(`${BASE}/api/v1/people`, { headers: { Authorization: 'Bearer plg_wrong' } })
  expect(bogus.status).toBe(401)
})

test('sidebar shows the plugin entry and the sandboxed panel renders', async () => {
  // Wait out the splash — the sidebar appears once the app is interactive.
  // Plugin entries live in the Plugins flyout menu at the bottom of the sidebar.
  const flyout = window.getByTestId('nav-plugins-flyout')
  await expect(flyout).toBeVisible({ timeout: 30_000 })
  await flyout.click()
  const nav = window.getByTestId('nav-plugin-longevity-top-toplist')
  await expect(nav).toBeVisible()
  await nav.click()

  await expect(window.getByTestId('plugin-host')).toBeVisible()
  const frame = window.frameLocator('[data-testid="plugin-frame"]')
  // The panel booted, read the URL-hash params and talked to the local API
  // (an empty tree renders the "not enough data" state — still via the API).
  // Title is localized to the app language (hu/en/de) — match any of them.
  await expect(frame.locator('#title')).toContainText(/toplist|top list/i, { timeout: 15_000 })
  // The API round-trip must SUCCEED (the error state is localized too — assert
  // on the one string that only the network-failure branch renders).
  await expect(frame.locator('#out')).not.toContainText(/API/, { timeout: 15_000 })
})
