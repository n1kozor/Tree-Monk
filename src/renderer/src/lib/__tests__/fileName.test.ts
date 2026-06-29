import { describe, it, expect } from 'vitest'
import { safeFileBase } from '@/lib/fileName'

describe('safeFileBase', () => {
  it('keeps accented letters and turns spaces into dashes', () => {
    expect(safeFileBase('Behán Mária')).toBe('Behán-Mária')
  })

  it('strips characters that are illegal in file names', () => {
    expect(safeFileBase('a/b:c*?"<>|d')).toBe('abcd')
  })

  it('trims leading and trailing dashes from surrounding whitespace', () => {
    expect(safeFileBase('  hello world  ')).toBe('hello-world')
  })

  it('falls back to a default when nothing usable remains', () => {
    expect(safeFileBase('')).toBe('treemonk-export')
    expect(safeFileBase('///')).toBe('treemonk-export')
  })

  it('honours a custom fallback', () => {
    expect(safeFileBase('', 'export')).toBe('export')
  })
})
