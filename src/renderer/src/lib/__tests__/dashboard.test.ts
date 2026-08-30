import { describe, expect, it } from 'vitest'
import { computeDashboard } from '@/lib/dashboard'
import type { Person } from '@shared/types'

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
    deceased: false,
    illegitimate: false,
    verified: false,
    callName: null,
    namePrefix: null,
    nameSuffix: null,
    stillborn: false,
    isPrivate: false,
    burialDate: null,
    burialPlace: null,
    christeningDate: null,
    christeningPlace: null,
    religion: null,
    birthNote: null,
    deathNote: null,
    christeningNote: null,
    burialNote: null,
    occupation: null,
    notes: null,
    profilePhotoId: null,
    profilePhotoCrop: null,
    createdAt: '',
    updatedAt: '',
    ...p
  }
}

describe('computeDashboard', () => {
  it('normalizes localized country variants in birth and death place buckets', () => {
    const stats = computeDashboard(
      [
        mk({ birthPlace: 'Brasil', deathPlace: 'São José, Santa Catarina, Brasil' }),
        mk({ birthPlace: 'Brazil', deathPlace: 'São José, Santa Catarina, Brazil' }),
        mk({ birthPlace: 'Budapest, Magyarország', deathPlace: 'Budapest, Hungary' })
      ],
      []
    )

    expect(stats.topBirthPlaces).toContainEqual({ label: 'Brazil', count: 2 })
    expect(stats.topBirthPlaces.find((b) => b.label === 'Brasil')).toBeUndefined()
    expect(stats.topBirthPlaces).toContainEqual({ label: 'Budapest, Hungary', count: 1 })
    expect(stats.topDeathPlaces).toContainEqual({
      label: 'São José, Santa Catarina, Brazil',
      count: 2
    })
  })
})
