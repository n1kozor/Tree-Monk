import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp } from './helpers'

let app: ElectronApplication
let window: Page

test.beforeAll(async () => {
  ;({ app, window } = await launchApp())
})

test.afterAll(async () => {
  await app?.close()
})

test('adds a new person and opens the editing panel', async () => {
  await window.getByTestId('nav-people').click()
  await expect(window.locator('[data-view="people"]')).toBeVisible()

  // Creating a person selects them, which slides in the person panel.
  await window.getByTestId('people-add').click()
  await expect(window.getByTestId('person-panel')).toBeVisible()
})
