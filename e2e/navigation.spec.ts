import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp, VIEWS } from './helpers'

// Smoke-test that EVERY view in the app opens and renders without crashing.
let app: ElectronApplication
let window: Page

test.beforeAll(async () => {
  ;({ app, window } = await launchApp())
})

test.afterAll(async () => {
  await app?.close()
})

for (const view of VIEWS) {
  test(`opens the "${view}" view`, async () => {
    await window.getByTestId(`nav-${view}`).click()
    // The view container exposes data-view = the active view (language-neutral).
    await expect(window.locator(`[data-view="${view}"]`)).toBeVisible()
  })
}

test('the map view initializes a MapLibre canvas', async () => {
  await window.getByTestId('nav-map').click()
  await expect(window.locator('canvas.maplibregl-canvas')).toBeVisible()
})
