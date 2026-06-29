import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp } from './helpers'

// The app opens on the Investigation Board; its toolbar carries the wizard button.
let app: ElectronApplication
let window: Page

test.beforeAll(async () => {
  ;({ app, window } = await launchApp())
})

test.afterAll(async () => {
  await app?.close()
})

test('opens and closes the investigation wizard', async () => {
  await window.getByTestId('nav-board').click()
  await window.getByTestId('board-wizard').click()
  await expect(window.getByRole('dialog')).toBeVisible()
  await window.keyboard.press('Escape')
  await expect(window.getByRole('dialog')).toHaveCount(0)
})
