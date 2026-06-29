import { describe, it, expect } from 'vitest'
import { citationYear, sourceYear } from '@/lib/citationYear'

const cite = (o: Partial<Parameters<typeof citationYear>[0]>): Parameters<typeof citationYear>[0] => ({
  sourceTitle: '',
  sourceAuthor: null,
  sourcePublication: null,
  page: null,
  ...o
})

// A real FamilySearch church-record citation: collection range + a parenthetical
// "(url : accessed date)" + the record year at the very end.
const CHURCH =
  '"Hungary, Catholic Church Records, 1636-1895", <i>FamilySearch</i> ' +
  '(https://www.familysearch.org/ark:/61903/1:1:XXQ4-L9J : Thu Jan 16 22:46:00 UTC 2025), ' +
  'Entry for Erzsebet and Barkoczi Istvan, 1889.'

// A civil-registration citation: NO record year in the text (only the access
// year 2014 inside the parens and two collection ranges).
const CIVIL =
  '"Hungary, Civil Registration, 1895-1980," database with images, <i>FamilySearch</i> ' +
  '(https://familysearch.org/ark:/61903/3:1:33S7 : 16 June 2014), ' +
  'Heves > Csány > Births (Születtek) 1909-1913 > image 133 of 158.'

describe('citationYear', () => {
  it('takes the record year at the end, ignoring the access date and the range', () => {
    expect(citationYear(cite({ sourceAuthor: CHURCH }))).toBe(1889)
  })

  it('returns null when the citation has no record year (access/ranges only)', () => {
    expect(citationYear(cite({ sourceAuthor: CIVIL }))).toBeNull()
  })

  it('reads a plain year from a short title', () => {
    expect(citationYear(cite({ sourceTitle: 'Keresztelési ak. 1861' }))).toBe(1861)
  })
})

describe('sourceYear', () => {
  it('uses a structured record date when present and plausible', () => {
    expect(sourceYear({ recordDate: '1936', sourceTitle: '', sourceAuthor: null, sourcePublication: null, page: null })).toBe(1936)
  })

  it('ignores a non-date record value (e.g. a sort ordinal) and falls back to the text', () => {
    expect(
      sourceYear({ recordDate: '0000000001', sourceTitle: '', sourceAuthor: CHURCH, sourcePublication: null, page: null })
    ).toBe(1889)
  })
})
