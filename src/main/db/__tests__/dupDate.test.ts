import { describe, it, expect } from 'vitest'
import { birthDateRelation } from '../dupDate'

describe('birthDateRelation', () => {
  it('treats different years as different dates (the "Kis János 1888 vs 1889" bug)', () => {
    expect(birthDateRelation('1888', '1889')).toBe('diff')
    expect(birthDateRelation('1888', '1890')).toBe('diff')
    expect(birthDateRelation('1888-03-12', '1889-03-12')).toBe('diff')
  })

  it('treats the same year as the same date when that is the only precision', () => {
    expect(birthDateRelation('1888', '1888')).toBe('same')
  })

  it('matches identical full dates', () => {
    expect(birthDateRelation('1888-03-12', '1888-03-12')).toBe('same')
  })

  it('separates the same year with a confidently different month or day', () => {
    expect(birthDateRelation('1888-03-12', '1888-09-20')).toBe('diff') // month differs
    expect(birthDateRelation('1888-03-12', '1888-03-25')).toBe('diff') // day differs
    expect(birthDateRelation('March 1888', 'September 1888')).toBe('diff') // named months
  })

  it('treats a coarser date as compatible with a finer one (same year)', () => {
    expect(birthDateRelation('1888', '1888-03-12')).toBe('same')
    expect(birthDateRelation('1888-03-12', 'March 1888')).toBe('same')
  })

  it('parses EN / HU / DE month names and GEDCOM abbreviations', () => {
    expect(birthDateRelation('11 JAN 1906', '1906-01-11')).toBe('same')
    expect(birthDateRelation('11 JAN 1906', '1906-02-11')).toBe('diff')
    expect(birthDateRelation('1850. április', 'April 1850')).toBe('same')
    expect(birthDateRelation('1. Januar 1907', '1907-01-01')).toBe('same')
    expect(birthDateRelation('1850. április', '1850. május')).toBe('diff')
  })

  it('returns unknown when either date is missing or unparseable', () => {
    expect(birthDateRelation(null, '1888')).toBe('unknown')
    expect(birthDateRelation('1888', null)).toBe('unknown')
    expect(birthDateRelation(null, null)).toBe('unknown')
    expect(birthDateRelation('', '1888')).toBe('unknown')
    expect(birthDateRelation('unknown', '1888')).toBe('unknown')
  })

  it('does not invent a contradiction from ambiguous numeric day/month order', () => {
    // We only trust day from ISO, so "1888.03.12" parses as year-only → compatible.
    expect(birthDateRelation('1888.03.12', '1888')).toBe('same')
  })

  // Real false positives: one record has only a christening date, the other only a
  // birth date. The duplicate scan feeds birthDate ?? christeningDate in here, so
  // these must come out as clearly different people.
  it('separates a christening date from a birth date in a different year', () => {
    expect(birthDateRelation('17 Sep 1876', '1903. szeptember 30.')).toBe('diff') // Maria vs Margit
    expect(birthDateRelation('1846', '19 Jul 1850')).toBe('diff') // Ficzek Julianna ×2
  })
})
