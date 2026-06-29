import { describe, it, expect } from 'vitest'
import { maskDateTyping, ageAt, normalizeDate } from '@/lib/dates'

describe('maskDateTyping', () => {
  it('inserts ISO separators as digits are typed', () => {
    expect(maskDateTyping('2022')).toBe('2022')
    expect(maskDateTyping('202203')).toBe('2022-03')
    expect(maskDateTyping('20220112')).toBe('2022-01-12')
  })

  it('keeps formatting stable as more digits arrive past an existing dash', () => {
    expect(maskDateTyping('2022-0')).toBe('2022-0')
    expect(maskDateTyping('2022-011')).toBe('2022-01-1')
    expect(maskDateTyping('2022-01-12')).toBe('2022-01-12')
  })

  it('ignores extra digits beyond a full date', () => {
    expect(maskDateTyping('2022011299')).toBe('2022-01-12')
  })

  it('leaves dotted/slashed or textual input untouched for normalizeDate', () => {
    expect(maskDateTyping('12.01.2022')).toBe('12.01.2022')
    expect(maskDateTyping('03/1850')).toBe('03/1850')
    expect(maskDateTyping('abt 1850')).toBe('abt 1850')
  })

  it('the masked value still normalizes correctly', () => {
    expect(normalizeDate(maskDateTyping('20220112'))).toBe('2022-01-12')
  })
})

describe('ageAt', () => {
  it('is the plain year difference when months are unknown', () => {
    expect(ageAt('1956', '2024')).toBe(68)
  })

  it('subtracts a year when the birthday has not recurred yet (the burial bug)', () => {
    // Born November, buried the following January → still 67, not 68.
    expect(ageAt('1956-11-20', '2024-01-15')).toBe(67)
    // Same November birth, December death of the prior year → 67.
    expect(ageAt('1956-11-20', '2023-12-30')).toBe(67)
  })

  it('counts the year once the birthday has passed', () => {
    expect(ageAt('1956-11-20', '2024-11-21')).toBe(68)
    expect(ageAt('1956-11-20', '2024-12-01')).toBe(68)
  })

  it('handles same-month day comparison', () => {
    expect(ageAt('1956-11-20', '2024-11-19')).toBe(67)
    expect(ageAt('1956-11-20', '2024-11-20')).toBe(68)
  })

  it('returns null when a year is missing', () => {
    expect(ageAt(null, '2024')).toBeNull()
    expect(ageAt('1956', null)).toBeNull()
  })
})
