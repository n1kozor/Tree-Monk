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

test('collapses and re-expands the sidebar', async () => {
  const sidebar = window.getByTestId('sidebar')
  const expandedWidth = (await sidebar.boundingBox())!.width

  await window.getByTestId('toggle-sidebar').click()
  // The width animates down to the collapsed rail.
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? expandedWidth).toBeLessThan(
    expandedWidth
  )
  const collapsedWidth = (await sidebar.boundingBox())!.width

  await window.getByTestId('toggle-sidebar').click()
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? collapsedWidth).toBeGreaterThan(
    collapsedWidth
  )
})
