import { describe, it, expect } from 'vitest'
import { canSearchFamilySearch, familySearchPersonUrl, familySearchSearchUrl, isFamilySearchId } from '@/lib/familySearchSearch'
import type { Person } from '@shared/types'

const person = (p: Partial<Person>): Person => ({
  id: '1', gedcomId: null, fsId: null, givenName: '', surname: '', sex: 'U',
  birthDate: null, birthPlace: null, deathDate: null, deathPlace: null, deceased: false, illegitimate: false, verified: false,
    callName: null, namePrefix: null, nameSuffix: null, stillborn: false, isPrivate: false,
  burialDate: null, burialPlace: null, christeningDate: null, christeningPlace: null,
  religion: null, birthNote: null, deathNote: null, christeningNote: null, burialNote: null, occupation: null, notes: null, profilePhotoId: null, profilePhotoCrop: null,
  createdAt: '', updatedAt: '', ...p
})

describe('familySearchSearchUrl', () => {
  it('builds a pre-filled record search in the given language', () => {
    const url = familySearchSearchUrl(
      person({ givenName: 'István', surname: 'Barkóczi', birthDate: '1891', birthPlace: 'csány' }),
      'de'
    )
    expect(url).toBe(
      'https://www.familysearch.org/de/search/record/results?' +
        'q.givenName=Istv%C3%A1n&q.surname=Bark%C3%B3czi&' +
        'q.birthLikeDate.from=1891&q.birthLikeDate.to=1891&q.birthLikePlace=cs%C3%A1ny'
    )
  })

  it('takes only the year from a full birth date and omits empty fields', () => {
    const url = familySearchSearchUrl(person({ surname: 'Nagy', birthDate: '1903-05-12' }), 'en-US')
    expect(url).toBe(
      'https://www.familysearch.org/en/search/record/results?q.surname=Nagy&q.birthLikeDate.from=1903&q.birthLikeDate.to=1903'
    )
  })

  it('falls back to English when no language is given', () => {
    expect(familySearchSearchUrl(person({ surname: 'Kiss' }))).toContain('/en/search/record/results')
  })

  it('needs at least a name to be useful', () => {
    expect(canSearchFamilySearch(person({ givenName: 'Anna' }))).toBe(true)
    expect(canSearchFamilySearch(person({}))).toBe(false)
  })
})

describe('familySearchPersonUrl', () => {
  it('links to the FamilySearch tree page for a person with an fsId', () => {
    expect(familySearchPersonUrl(person({ fsId: 'LZ12-345' }))).toBe(
      'https://www.familysearch.org/tree/person/details/LZ12-345'
    )
  })

  it('is null when there is no FamilySearch id', () => {
    expect(familySearchPersonUrl(person({ fsId: null }))).toBeNull()
    expect(familySearchPersonUrl(person({ fsId: '  ' }))).toBeNull()
  })

  it('is null for a foreign GEDCOM record id that is not a FamilySearch id', () => {
    // e.g. a MyHeritage RIN imported via GEDCOM → no FamilySearch page exists.
    expect(familySearchPersonUrl(person({ fsId: 'MH:I512' }))).toBeNull()
  })
})

describe('isFamilySearchId', () => {
  it('accepts genuine FamilySearch ids', () => {
    expect(isFamilySearchId('LZ12-345')).toBe(true)
    expect(isFamilySearchId('KWQS-BBQ')).toBe(true)
    expect(isFamilySearchId('LZ1B-2CDQ')).toBe(true)
    expect(isFamilySearchId('  lz12-345  ')).toBe(true) // trimmed + upper-cased
  })

  it('rejects foreign record ids and junk', () => {
    expect(isFamilySearchId('MH:I512')).toBe(false) // MyHeritage RIN
    expect(isFamilySearchId('I512')).toBe(false)
    expect(isFamilySearchId('@I512@')).toBe(false)
    expect(isFamilySearchId('')).toBe(false)
    expect(isFamilySearchId(null)).toBe(false)
    expect(isFamilySearchId(undefined)).toBe(false)
  })
})
