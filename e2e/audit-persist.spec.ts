import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Proves the change history is NOT lost on restart: it lives in the same SQLite
// file as the data, so a second launch against the same userData dir still sees
// the entries recorded in the first.
test('the audit log survives an app restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'treemonk-persist-'))

  // --- First launch: make a change, read the history count. ---
  let app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${dir}`] })
  let win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.getByTestId('nav-people').click()
  await win.getByTestId('people-add').click()
  await expect(win.getByTestId('person-panel')).toBeVisible()

  const firstTotal: number = await win.evaluate(
    async () => (await (window as unknown as { api: { audit: { query: (f: object) => Promise<{ total: number }> } } }).api.audit.query({})).total
  )
  expect(firstTotal).toBeGreaterThan(0)
  await app.close()

  // --- Second launch, SAME data dir: the history is still there. ---
  app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${dir}`] })
  win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.getByTestId('nav-audit').waitFor({ state: 'visible' })

  const secondTotal: number = await win.evaluate(
    async () => (await (window as unknown as { api: { audit: { query: (f: object) => Promise<{ total: number }> } } }).api.audit.query({})).total
  )
  expect(secondTotal).toBeGreaterThanOrEqual(firstTotal)
  await app.close()
})
