import { describe, expect, it } from 'vitest'
import { peopleWithinFamilyTreeDepth, normalizeFsScanDepth } from '@/lib/fsScanDepth'
import type { Family, Person } from '@shared/types'

function person(id: string): Person {
  return {
    id,
    gedcomId: null,
    fsId: `${id.toUpperCase()}-FS1`,
    givenName: id,
    surname: '',
    sex: 'U',
    birthDate: null,
    birthPlace: null,
    deathDate: null,
    deathPlace: null,
    deceased: false,
    illegitimate: false,
    callName: null,
    namePrefix: null,
    nameSuffix: null,
    stillborn: false,
    isPrivate: false,
    verified: false,
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
    updatedAt: ''
  }
}

function family(id: string, husbandId: string | null, wifeId: string | null, childIds: string[]): Family {
  return {
    id,
    gedcomId: null,
    husbandId,
    wifeId,
    marriageDate: null,
    marriagePlace: null,
    marriageOrder: null,
    relationship: null,
    notes: null,
    childIds
  }
}

const people = ['root', 'spouse', 'father', 'mother', 'child', 'grandchild', 'sibling', 'siblingSpouse', 'unrelated'].map(
  person
)

const families = [
  family('parents', 'father', 'mother', ['root', 'sibling']),
  family('rootFamily', 'root', 'spouse', ['child']),
  family('childFamily', 'child', null, ['grandchild']),
  family('siblingFamily', 'sibling', 'siblingSpouse', [])
]

describe('normalizeFsScanDepth', () => {
  it('keeps all as an explicit unlimited scan', () => {
    expect(normalizeFsScanDepth(null)).toBeNull()
    expect(normalizeFsScanDepth('all')).toBeNull()
  })

  it('clamps numeric scan depths to the supported range', () => {
    expect(normalizeFsScanDepth(0)).toBe(1)
    expect(normalizeFsScanDepth(99)).toBe(20)
    expect(normalizeFsScanDepth('4.4')).toBe(4)
  })
})

describe('peopleWithinFamilyTreeDepth', () => {
  it('includes spouses at the same generation', () => {
    const ids = peopleWithinFamilyTreeDepth(people, families, 'root', 1).map((p) => p.id)
    expect(ids).toEqual(['root', 'spouse', 'father', 'mother', 'child'])
  })

  it('adds collateral and descendant generations as depth increases', () => {
    const ids = peopleWithinFamilyTreeDepth(people, families, 'root', 2).map((p) => p.id)
    expect(ids).toEqual(['root', 'spouse', 'father', 'mother', 'child', 'grandchild', 'sibling', 'siblingSpouse'])
  })

  it('preserves full-tree scanning when unlimited or no root is selected', () => {
    expect(peopleWithinFamilyTreeDepth(people, families, 'root', null)).toHaveLength(people.length)
    expect(peopleWithinFamilyTreeDepth(people, families, undefined, 2)).toHaveLength(people.length)
  })
})
