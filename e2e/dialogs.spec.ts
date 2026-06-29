import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp } from './helpers'

// The sidebar dialogs (feedback / support / help) open and close cleanly.
let app: ElectronApplication
let window: Page

test.beforeAll(async () => {
  ;({ app, window } = await launchApp())
})

test.afterAll(async () => {
  await app?.close()
})

const DIALOGS = [
  { name: 'feedback', testid: 'open-feedback' },
  { name: 'support', testid: 'open-support' },
  { name: 'help', testid: 'open-help' }
]

for (const d of DIALOGS) {
  test(`opens and closes the ${d.name} dialog`, async () => {
    await window.getByTestId(d.testid).click()
    await expect(window.getByRole('dialog')).toBeVisible()
    // Radix dialogs close on Escape and unmount their content from the DOM.
    await window.keyboard.press('Escape')
    await expect(window.getByRole('dialog')).toHaveCount(0)
  })
}
