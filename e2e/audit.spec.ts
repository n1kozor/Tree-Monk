import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp } from './helpers'

// End-to-end check of the whole audit pipeline: a real edit is captured by the
// SQLite triggers, shows up in the History view, and can be undone.
let app: ElectronApplication
let window: Page

test.beforeAll(async () => {
  ;({ app, window } = await launchApp())
})

test.afterAll(async () => {
  await app?.close()
})

test('captures a created person in the history and undoes it', async () => {
  // Make a change: add a person (this fires an INSERT the trigger records).
  await window.getByTestId('nav-people').click()
  await window.getByTestId('people-add').click()
  await expect(window.getByTestId('person-panel')).toBeVisible()
  // Close the person panel so it doesn't overlay the history view.
  await window.getByTestId('person-panel-backdrop').click({ force: true })

  // The change is listed in the History view.
  await window.getByTestId('nav-audit').click()
  await expect(window.locator('[data-view="audit"]')).toBeVisible()
  const undoButtons = window.getByTestId('audit-undo')
  await expect(undoButtons.first()).toBeVisible()
  const beforeCount = await undoButtons.count()

  // Undo it (confirming through the impact-aware dialog).
  await undoButtons.first().click()
  await window.getByTestId('confirm-ok').click()

  // One fewer un-done entry → the create was reverted and marked undone.
  await expect.poll(async () => undoButtons.count()).toBeLessThan(beforeCount)
})
