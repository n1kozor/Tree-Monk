import { describe, it, expect } from 'vitest'
import { peopleFor, lifespanBand, isMissing } from '@/lib/dashboardDrill'
import type { Person } from '@shared/types'

/** Build a Person with sane defaults; override only what a test cares about. */
function mk(p: Partial<Person>): Person {
  return {
    id: Math.random().toString(36).slice(2),
    gedcomId: null,
    fsId: null,
    givenName: '',
    surname: '',
    sex: 'U',
    birthDate: null,
    birthPlace: null,
    deathDate: null,
    deathPlace: null,
    deceased: false, illegitimate: false, verified: false,
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
    ...p
  }
}

const people: Person[] = [
  mk({ givenName: 'Mária', surname: 'Behán', sex: 'F', birthDate: '1893', deathDate: '1959', birthPlace: 'Újkígyós' }),
  mk({ givenName: 'Mihály', surname: 'Behán', sex: 'M', birthDate: '1896', deathDate: '1976', birthPlace: 'Újkígyós' }),
  mk({ givenName: 'Imre', surname: 'Szász', sex: 'M', birthDate: '1891', deathDate: '1967', birthPlace: 'Békés' }),
  mk({ givenName: 'Anna', surname: 'Kovács', sex: 'F', birthDate: '1990' }) // living, no place
]

describe('peopleFor', () => {
  it('filters by surname', () => {
    expect(peopleFor({ kind: 'surname', value: 'Behán' }, people)).toHaveLength(2)
  })

  it('filters by birth place', () => {
    expect(peopleFor({ kind: 'birthPlace', value: 'Békés' }, people).map((p) => p.givenName)).toEqual(['Imre'])
  })

  it('filters by sex', () => {
    expect(peopleFor({ kind: 'sex', sex: 'F' }, people)).toHaveLength(2)
  })

  it('separates living from deceased', () => {
    expect(peopleFor({ kind: 'living', living: true }, people).map((p) => p.givenName)).toEqual(['Anna'])
    expect(peopleFor({ kind: 'living', living: false }, people)).toHaveLength(3)
  })

  it('filters by birth century', () => {
    expect(peopleFor({ kind: 'birthCentury', century: 1800 }, people)).toHaveLength(3)
    expect(peopleFor({ kind: 'birthCentury', century: 1900 }, people)).toHaveLength(1)
  })

  it('filters by lifespan band', () => {
    // Mária 1893–1959 = 66 → band "60–69"
    expect(peopleFor({ kind: 'lifespanBand', band: '60–69' }, people).map((p) => p.givenName)).toContain('Mária')
  })

  it('finds people missing a field', () => {
    expect(peopleFor({ kind: 'missing', field: 'birthPlace' }, people).map((p) => p.givenName)).toEqual(['Anna'])
  })
})

describe('lifespanBand', () => {
  it('computes the 10-year band, 90+ capped', () => {
    expect(lifespanBand(mk({ birthDate: '1900', deathDate: '1945' }))).toBe('40–49')
    expect(lifespanBand(mk({ birthDate: '1850', deathDate: '1945' }))).toBe('90+')
    expect(lifespanBand(mk({ birthDate: '1900' }))).toBeNull()
  })
})

describe('isMissing', () => {
  it('treats a recorded death OR deceased flag as having death info', () => {
    expect(isMissing(mk({ deceased: true }), 'deathInfo')).toBe(false)
    expect(isMissing(mk({ deathDate: '1959' }), 'deathInfo')).toBe(false)
    expect(isMissing(mk({}), 'deathInfo')).toBe(true)
  })
})
