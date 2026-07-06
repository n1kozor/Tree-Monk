import { describe, it, expect } from 'vitest'
import type { Family, Person } from '@shared/types'
import { ancestorIds, buildMonthEvents, parts } from '@/lib/calendar'

function P(id: string, o: Partial<Person> = {}): Person {
  return {
    id,
    gedcomId: null,
    fsId: null,
    givenName: '',
    surname: '',
    sex: 'U',
    birthDate: null,
    birthPlace: null,
    deathDate: null,
    deathPlace: null,
    deceased: false, illegitimate: false,
    burialDate: null,
    burialPlace: null,
    christeningDate: null,
    christeningPlace: null,
    religion: null, birthNote: null, deathNote: null, christeningNote: null, burialNote: null,
    occupation: null,
    notes: null,
    profilePhotoId: null,
    profilePhotoCrop: null,
    createdAt: '',
    updatedAt: '',
    ...o
  } as Person
}
function F(id: string, o: Partial<Family> = {}): Family {
  return { id, gedcomId: null, husbandId: null, wifeId: null, marriageDate: null, marriagePlace: null, marriageOrder: null, notes: null, childIds: [], ...o }
}

describe('parts', () => {
  it('extracts year/month/day from ISO-ish dates', () => {
    expect(parts('1923-05-17')).toEqual({ y: 1923, mo: 5, d: 17 })
    expect(parts('1923.05.17')).toEqual({ y: 1923, mo: 5, d: 17 })
    expect(parts('1923-05')).toEqual({ y: 1923, mo: 5, d: null })
    expect(parts('1923')).toEqual({ y: 1923, mo: null, d: null })
    expect(parts(null)).toEqual({ y: null, mo: null, d: null })
  })
  it('handles day-first numeric dates', () => {
    expect(parts('17.05.1923')).toEqual({ y: 1923, mo: 5, d: 17 })
  })
  it('handles Hungarian textual month names', () => {
    expect(parts('1913. február 24')).toEqual({ y: 1913, mo: 2, d: 24 })
    expect(parts('1913. február 24.')).toEqual({ y: 1913, mo: 2, d: 24 })
    expect(parts('1913. febr. 24')).toEqual({ y: 1913, mo: 2, d: 24 })
    expect(parts('1913. február')).toEqual({ y: 1913, mo: 2, d: null })
  })
  it('handles English/German textual month names', () => {
    expect(parts('24 February 1913')).toEqual({ y: 1913, mo: 2, d: 24 })
    expect(parts('24. Februar 1913')).toEqual({ y: 1913, mo: 2, d: 24 })
  })
})

const child = P('c', { givenName: 'Child', birthDate: '1980-05-10' })
const father = P('f', { givenName: 'Father', sex: 'M', birthDate: '1950-05-20', deathDate: '2000-05-03' })
const mother = P('m', { givenName: 'Mother', sex: 'F', birthDate: '1952-03-01' })
const gf = P('gf', { givenName: 'Grandpa', sex: 'M', birthDate: '1920-05' }) // day unknown
const x = P('x', { givenName: 'Stranger', birthDate: '1990-05-25' })
const people = [child, father, mother, gf, x]
const peopleById = new Map(people.map((p) => [p.id, p]))
const fam1 = F('fam1', { husbandId: 'f', wifeId: 'm', marriageDate: '1975-05-15', childIds: ['c'] })
const fam2 = F('fam2', { husbandId: 'gf', childIds: ['f'] })
const families = [fam1, fam2]
const allKinds = { birth: true, death: true, marriage: true }

describe('ancestorIds', () => {
  it('walks parent families upward (inclusive of root)', () => {
    expect(ancestorIds('c', families)).toEqual(new Set(['c', 'f', 'm', 'gf']))
  })
  it('returns empty set without a root', () => {
    expect(ancestorIds(undefined, families).size).toBe(0)
  })
})

describe('buildMonthEvents', () => {
  it('indexes births/deaths/marriages by day for the given month', () => {
    const r = buildMonthEvents({ month: 5, people, families, peopleById, scopeIds: null, kinds: allKinds })
    expect(r.byDay.get(10)?.[0]).toMatchObject({ kind: 'birth', personId: 'c', year: 1980 })
    expect(r.byDay.get(20)?.[0]).toMatchObject({ kind: 'birth', personId: 'f' })
    expect(r.byDay.get(15)?.[0]).toMatchObject({ kind: 'marriage', personId: 'f' })
    expect(r.byDay.get(15)?.[0].partner?.id).toBe('m')
    expect(r.byDay.get(3)?.[0]).toMatchObject({ kind: 'death', personId: 'f', ageAtDeath: 50 })
  })

  it('counts events whose day is unknown but excludes them from the grid', () => {
    const r = buildMonthEvents({ month: 5, people, families, peopleById, scopeIds: null, kinds: allKinds })
    expect(r.dayUnknown).toBe(1) // grandpa born "1920-05"
    expect([...r.byDay.values()].flat().some((e) => e.personId === 'gf')).toBe(false)
  })

  it('respects the kind filter', () => {
    const r = buildMonthEvents({ month: 5, people, families, peopleById, scopeIds: null, kinds: { birth: true, death: false, marriage: false } })
    expect([...r.byDay.values()].flat().every((e) => e.kind === 'birth')).toBe(true)
  })

  it('respects the scope (ancestors only) filter', () => {
    const scopeIds = ancestorIds('c', families) // excludes "x"
    const r = buildMonthEvents({ month: 5, people, families, peopleById, scopeIds, kinds: allKinds })
    expect([...r.byDay.values()].flat().some((e) => e.personId === 'x')).toBe(false)
    const all = buildMonthEvents({ month: 5, people, families, peopleById, scopeIds: null, kinds: allKinds })
    expect([...all.byDay.values()].flat().some((e) => e.personId === 'x')).toBe(true)
  })

  it('ignores other months', () => {
    const r = buildMonthEvents({ month: 3, people, families, peopleById, scopeIds: null, kinds: allKinds })
    expect(r.byDay.get(1)?.[0]).toMatchObject({ personId: 'm', kind: 'birth' }) // mother born 1952-03-01
    expect(r.total).toBe(1)
  })
})
