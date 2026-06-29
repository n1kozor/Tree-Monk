import { describe, it, expect } from 'vitest'
import { norm, matchesName, nameScore, canon, sameNameForDup } from '@/lib/nameMatch'

describe('norm', () => {
  it('lowercases and strips diacritics and punctuation', () => {
    expect(norm('Behán Mária')).toBe('behanmaria')
    expect(norm('Kovács-János')).toBe('kovacsjanos')
  })
})

describe('matchesName', () => {
  it('matches regardless of accents', () => {
    expect(matchesName('behan', 'Behán Mária')).toBe(true)
  })

  it('matches the same person across languages (synonyms)', () => {
    // "John Smith" in Latin/Hungarian spelling.
    expect(matchesName('János Kovács', 'Joannes Kovats')).toBe(true)
  })

  it('tolerates small spelling drift', () => {
    expect(matchesName('Kovacs', 'Kovats')).toBe(true)
  })

  it('rejects an unrelated name', () => {
    expect(matchesName('Szabó', 'Behán Mária')).toBe(false)
  })
})

describe('canon', () => {
  // The famous-relatives matcher relies on these: FamilySearch stores notable
  // Hungarians under their anglicized/German given name (Ferenc→Franz, Lajos→
  // Louis), so a Hungarian given name must map to the SAME canonical key.
  it('maps cross-language variants of a given name to one key', () => {
    expect(canon('Ferenc')).toBe(canon('Franz'))
    expect(canon('Ferenc')).toBe(canon('Francis'))
    expect(canon('Lajos')).toBe(canon('Louis'))
    expect(canon('György')).toBe(canon('George'))
    expect(canon('István')).toBe(canon('Stephen'))
  })

  it('keeps unrelated given names in different groups', () => {
    expect(canon('Ferenc')).not.toBe(canon('Lajos'))
    expect(canon('István')).not.toBe(canon('György'))
  })

  it('falls back to the normalized token when there is no synonym group', () => {
    expect(canon('Kovács')).toBe('kovacs')
  })
})

describe('nameScore', () => {
  it('ranks an exact match above a mere synonym', () => {
    expect(nameScore('Maria', 'Maria')).toBeGreaterThan(nameScore('Maria', 'Mari'))
  })

  it('returns 0 when a query word has no counterpart', () => {
    expect(nameScore('Xqz', 'Behán Mária')).toBe(0)
  })
})

describe('sameNameForDup (strict, for duplicate detection)', () => {
  it('does NOT equate different given names that are edit-distance neighbours', () => {
    // The real false positive: "Margit" and "Mária" are 2 edits apart but are
    // different names (different synonym groups).
    expect(sameNameForDup('Margit', 'Nagy', 'Mária', 'Nagy')).toBe(false)
    expect(sameNameForDup('Maria', 'Gyongosi', 'Margit', 'Gyöngyösi')).toBe(false)
  })

  it('equates accent variants and synonym-group given names', () => {
    expect(sameNameForDup('Maria', 'Nagy', 'Mária', 'Nagy')).toBe(true) // accents
    expect(sameNameForDup('Erzsebet', 'Nagy', 'Erzsébet', 'Nagy')).toBe(true)
    expect(sameNameForDup('János', 'Kovács', 'Joannes', 'Kovács')).toBe(true) // synonym
    expect(sameNameForDup('Julianna', 'Ficzek', 'Juliana', 'Ficzek')).toBe(true)
  })

  it('still tolerates surname spelling drift', () => {
    expect(sameNameForDup('János', 'Kovács', 'János', 'Kovats')).toBe(true)
    expect(sameNameForDup('Maria', 'Gyongosi', 'Maria', 'Gyöngyösi')).toBe(true)
  })

  it('requires both a given and a surname match', () => {
    expect(sameNameForDup('János', 'Kovács', 'János', 'Szabó')).toBe(false) // surname differs
    expect(sameNameForDup('', 'Nagy', '', 'Nagy')).toBe(false) // no given name
  })

  it('matches a given name even with an extra middle name', () => {
    expect(sameNameForDup('Maria Anna', 'Nagy', 'Maria', 'Nagy')).toBe(true)
  })
})
