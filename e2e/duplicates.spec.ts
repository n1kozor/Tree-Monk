import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp } from './helpers'

// Exercises the full duplicate pipeline against the real database: create two
// matching people, scan, merge them, and undo the merge via the audit log.
let app: ElectronApplication
let window: Page

test.beforeAll(async () => {
  ;({ app, window } = await launchApp())
})

test.afterAll(async () => {
  await app?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */

test('detects, merges and un-merges two duplicate people', async () => {
  // Seed two near-identical people directly through the API.
  const ids = await window.evaluate(async () => {
    const api = (window as any).api
    const a = await api.people.create({ givenName: 'Anna', surname: 'Kovacs', birthDate: '1900', birthPlace: 'Pest' })
    const b = await api.people.create({ givenName: 'Anna', surname: 'Kovacs', birthDate: '1900', birthPlace: 'Pest' })
    return { aId: a.id, bId: b.id }
  })

  const countBefore = await window.evaluate(async () => (await (window as any).api.people.list()).length)
  expect(countBefore).toBe(2)

  // The scan surfaces the pair.
  const candidates = await window.evaluate(async () => (window as any).api.duplicates.scan())
  expect(candidates.length).toBeGreaterThan(0)

  // Merge → one person remains.
  const res = await window.evaluate(
    async (p: { aId: string; bId: string }) =>
      (window as any).api.duplicates.merge(p.aId, p.bId, { givenName: 'Anna', surname: 'Kovacs' }),
    ids
  )
  expect(await window.evaluate(async () => (await (window as any).api.people.list()).length)).toBe(1)

  // Undo via the audit log → both are back.
  await window.evaluate(async (seq: number) => (window as any).api.audit.revert(seq), res.auditSeq)
  expect(await window.evaluate(async () => (await (window as any).api.people.list()).length)).toBe(2)
})
