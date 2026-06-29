import { describe, it, expect } from 'vitest'
import { yearOf } from '@/lib/utils'

describe('yearOf', () => {
  it('extracts the first 4-digit year from a free-form date', () => {
    expect(yearOf('1893. június 26.')).toBe('1893')
    expect(yearOf('26 Jun 1918')).toBe('1918')
  })

  it('returns an empty string when there is no usable year', () => {
    expect(yearOf(null)).toBe('')
    expect(yearOf('')).toBe('')
    expect(yearOf('unknown')).toBe('')
  })
})
