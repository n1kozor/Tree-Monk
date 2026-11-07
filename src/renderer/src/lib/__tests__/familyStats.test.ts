import { describe, expect, it } from 'vitest'
import {
  buildFamilyRows,
  computeFamilyStats,
  monthOf,
  sharedAncestry,
  timelineEnd,
  unionsPerPerson
} from '@/lib/familyStats'
import type { EventRecord, Family, Person } from '@shared/types'

function mk(id: string, p: Partial<Person> = {}): Person {
  return {
    id,
    gedcomId: null,
    fsId: null,
    givenName: id,
    surname: 'Test',
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

function fam(id: string, f: Partial<Family> = {}): Family {
  return {
    id,
    gedcomId: null,
    husbandId: null,
    wifeId: null,
    marriageDate: null,
    marriagePlace: null,
    marriageOrder: null,
    relationship: null,
    notes: null,
    childIds: [],
    ...f
  }
}

function ev(ownerId: string, type: string, date: string | null, place: string | null = null): EventRecord {
  return { id: `${ownerId}-${type}`, ownerType: 'family', ownerId, type, date, endDate: null, place, value: null, note: null }
}

const people = [
  mk('h1', { sex: 'M', birthDate: '1820', deathDate: '1890' }),
  mk('w1', { sex: 'F', birthDate: '1825', deathDate: '1880' }),
  mk('c1', { birthDate: '1850-03-01' }),
  mk('c2', { birthDate: '1846-07-09' }),
  mk('c3', { birthDate: '1901' }),
  mk('h3', { sex: 'M', birthDate: '1925' }),
  mk('w3', { sex: 'F', birthDate: '1928', deceased: true }),
  mk('h4', { sex: 'M', birthDate: '1975' }),
  mk('w4', { sex: 'F', birthDate: '1978' }),
  mk('h5', { sex: 'M' }),
  mk('w5', { sex: 'F' }),
  mk('w6', { sex: 'F', birthDate: '1850' })
]
const byId = new Map(people.map((p) => [p.id, p]))
const families = [
  fam('A', { husbandId: 'h1', wifeId: 'w1', marriageDate: '10 MAY 1845', childIds: ['c1', 'c2'] }),
  fam('B', { childIds: ['c3'] }),
  fam('C', { husbandId: 'h3', wifeId: 'w3', marriageDate: '1950-06-01' }),
  fam('D', { husbandId: 'h4', wifeId: 'w4', marriageDate: '2000-09-16', relationship: 'partner' }),
  fam('E', { husbandId: 'h5', wifeId: 'w5', marriageDate: '1850' }),
  fam('F', { husbandId: 'h1', wifeId: 'w6' })
]
const events = new Map<string, EventRecord[]>([
  ['C', [ev('C', 'divorce', '1960')]],
  ['F', [ev('F', 'churchMarriage', '1891-11-20', 'Szeged')]]
])
const rows = buildFamilyRows(families, byId, events, 2026)
const row = (id: string) => rows.find((r) => r.family.id === id)!

describe('buildFamilyRows', () => {
  it('derives the wedding, its end and the ages from a GEDCOM-style date', () => {
    const a = row('A')
    expect(a.marriageYear).toBe(1845)
    expect(a.children.map((c) => c.id)).toEqual(['c2', 'c1'])
    expect(a.endYear).toBe(1880)
    expect(a.endReason).toBe('death')
    expect(a.durationYears).toBe(35)
    expect(a.husbandAge).toBe(25)
    expect(a.wifeAge).toBe(20)
    expect(a.ageGap).toBe(5)
    expect(a.ongoing).toBe(false)
    expect(a.remarriage).toBe(true)
  })

  it('estimates the start from the first child when no wedding is known', () => {
    const b = row('B')
    expect(b.startYear).toBe(1900)
    expect(b.startEstimated).toBe(true)
    expect(b.durationYears).toBeNull()
  })

  it('ends a union at the divorce, even when a spouse is deceased', () => {
    const c = row('C')
    expect(c.divorced).toBe(true)
    expect(c.endReason).toBe('divorce')
    expect(c.durationYears).toBe(10)
  })

  it('treats a recent union of two living partners as ongoing', () => {
    const d = row('D')
    expect(d.kind).toBe('partner')
    expect(d.ongoing).toBe(true)
    expect(d.durationYears).toBe(26)
    expect(timelineEnd(d, 2026)).toBe(2026)
  })

  it('never calls a 19th-century union with no death data ongoing', () => {
    const e = row('E')
    expect(e.ongoing).toBe(false)
    expect(e.endYear).toBeNull()
    expect(e.durationYears).toBeNull()
  })

  it('dates the union by the couple’s own children, not a step-child', () => {
    const kids = [mk('own', { birthDate: '1872' }), mk('step', { birthDate: '1860' })]
    const m = new Map(kids.map((p) => [p.id, p]))
    const [r] = buildFamilyRows(
      [fam('S', { childIds: ['step', 'own'], childRelations: { step: { father: 'step', mother: null } } })],
      m,
      new Map(),
      2026
    )
    expect(r.children.map((c) => c.id)).toEqual(['step', 'own'])
    expect(r.firstChildYear).toBe(1872)
    expect(r.startYear).toBe(1871)
  })

  it('falls back to a dated church wedding event for date and place', () => {
    const f = row('F')
    expect(f.marriageDate).toBe('1891-11-20')
    expect(f.marriagePlace).toBe('Szeged')
    expect(f.husbandAge).toBe(71)
  })
})

describe('monthOf', () => {
  it('reads the month from every stored date shape', () => {
    expect(monthOf('1850-05-10')).toBe(5)
    expect(monthOf('10 MAY 1850')).toBe(5)
    expect(monthOf('1850. november 3.')).toBe(11)
    expect(monthOf('3. Dezember 1850')).toBe(12)
    expect(monthOf('18501103')).toBe(11)
    expect(monthOf('1850')).toBeNull()
    expect(monthOf('ABT 1850')).toBeNull()
  })
})

describe('computeFamilyStats', () => {
  it('summarises children, months, decades and records', () => {
    const s = computeFamilyStats(rows, unionsPerPerson(families))
    expect(s.total).toBe(6)
    expect(s.withChildren).toBe(2)
    expect(s.avgChildren).toBeCloseTo(0.5)
    expect(s.childrenHistogram.map((b) => b.count)).toEqual([4, 1, 1])
    expect(s.months[4]).toBe(1) // May
    expect(s.months[10]).toBe(1) // November (church wedding)
    expect(s.months[5]).toBe(1) // June
    expect(s.decades.find((d) => d.label === '1840')?.count).toBe(1)
    // Quiet decades between weddings are present with zero, not skipped.
    expect(s.decades.find((d) => d.label === '1860')?.count).toBe(0)
    expect(s.decades[0].label).toBe('1840')
    expect(s.decades.at(-1)?.label).toBe('2000')
    expect(s.records.largest?.row.family.id).toBe('A')
    expect(s.records.longest?.row.family.id).toBe('A')
    expect(s.remarriedPeople).toBe(1)
    // The running partnership (D) stays out of the average length.
    expect(s.avgDuration).toBeCloseTo((35 + 10) / 2)
  })
})

describe('sharedAncestry', () => {
  // gf & gm → p1, p2 (siblings) → c1 (of p1) and c2 (of p2) marry each other.
  const tree = [
    mk('gf', { sex: 'M' }),
    mk('gm', { sex: 'F' }),
    mk('p1', { sex: 'M' }),
    mk('p2', { sex: 'F' }),
    mk('x1', { sex: 'F' }),
    mk('x2', { sex: 'M' }),
    mk('c1', { sex: 'M' }),
    mk('c2', { sex: 'F' }),
    mk('u1', { sex: 'M' }),
    mk('u2', { sex: 'F' })
  ]
  const ids = new Set(tree.map((p) => p.id))
  const base = [
    fam('g', { husbandId: 'gf', wifeId: 'gm', childIds: ['p1', 'p2'] }),
    fam('f1', { husbandId: 'p1', wifeId: 'x1', childIds: ['c1'] }),
    fam('f2', { husbandId: 'x2', wifeId: 'p2', childIds: ['c2'] }),
    fam('cc', { husbandId: 'c1', wifeId: 'c2' }),
    fam('uu', { husbandId: 'u1', wifeId: 'u2' })
  ]
  const couples = [
    { familyId: 'cc', a: 'c1', b: 'c2' },
    { familyId: 'uu', a: 'u1', b: 'u2' }
  ]

  it('finds the shared grandparents of married first cousins', () => {
    const res = sharedAncestry(base, ids, couples)
    const cc = res.get('cc')!
    expect(cc.genA).toBe(2)
    expect(cc.genB).toBe(2)
    expect([...cc.ancestorIds].sort()).toEqual(['gf', 'gm'])
    expect(res.has('uu')).toBe(false)
  })

  it('ignores adoptive links — they do not make blood relatives', () => {
    const adopted = base.map((f) =>
      f.id === 'f2' ? { ...f, childRelations: { c2: { father: null, mother: 'adopted' as const } } } : f
    )
    expect(sharedAncestry(adopted, ids, couples).has('cc')).toBe(false)
  })

  it('respects the generation limit', () => {
    expect(sharedAncestry(base, ids, couples, 1).has('cc')).toBe(false)
  })
})
