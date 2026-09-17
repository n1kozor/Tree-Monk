import { describe, expect, it } from 'vitest'
import { canonicalCountryName, canonicalizeCountryInPlace, knownCountryAlias } from '../placeNormalize'

describe('place normalization', () => {
  it('resolves localized country names to English canonical names', () => {
    expect(canonicalCountryName('Brasil')).toBe('Brazil')
    expect(canonicalCountryName('Brasilien')).toBe('Brazil')
    expect(canonicalCountryName('Magyarország')).toBe('Hungary')
    expect(canonicalCountryName('Deutschland')).toBe('Germany')
    expect(canonicalCountryName('Estados Unidos')).toBe('United States')
  })

  it('recognizes only country labels as aliases', () => {
    expect(knownCountryAlias('Brazil')).toBe('Brazil')
    expect(knownCountryAlias('not a country')).toBeNull()
  })

  it('normalizes only the trailing country component of a place', () => {
    expect(canonicalizeCountryInPlace('São Paulo, Brasil')).toBe('São Paulo, Brazil')
    expect(canonicalizeCountryInPlace('Berlin, Deutschland')).toBe('Berlin, Germany')
    expect(canonicalizeCountryInPlace('São Paulo')).toBe('São Paulo')
  })

  it('labels the canonical country in the UI language', () => {
    // Grouping stays language-neutral (both spellings resolve to HU), but the
    // label shown to a Hungarian user is Hungarian, not English.
    expect(canonicalizeCountryInPlace('Budapest, Hungary', 'hu')).toBe('Budapest, Magyarország')
    expect(canonicalizeCountryInPlace('Budapest, Magyarország', 'hu')).toBe('Budapest, Magyarország')
    expect(canonicalCountryName('Germany', 'hu')).toBe('Németország')
    expect(canonicalCountryName('Deutschland', 'pl')).toBe('Niemcy')
    expect(knownCountryAlias('not a country', 'hu')).toBeNull()
  })
})
