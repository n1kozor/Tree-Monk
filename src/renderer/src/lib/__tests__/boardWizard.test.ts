import { describe, it, expect } from 'vitest'
import { buildInvestigationPlan } from '@/lib/boardWizard'
import type { Family, Person } from '@shared/types'

const t = (k: string): string => k // stub: return the key so we can assert structure

function mk(p: Partial<Person>): Person {
  return {
    id: Math.random().toString(36).slice(2),
    gedcomId: null, fsId: null, givenName: '', surname: '', sex: 'U',
    birthDate: null, birthPlace: null, deathDate: null, deathPlace: null,
    deceased: false, illegitimate: false, burialDate: null, burialPlace: null, christeningDate: null,
    christeningPlace: null, religion: null, birthNote: null, deathNote: null, christeningNote: null, burialNote: null, occupation: null, notes: null,
    profilePhotoId: null, profilePhotoCrop: null, createdAt: '', updatedAt: '', ...p
  }
}
const fam = (f: Partial<Family>): Family => ({
  id: Math.random().toString(36).slice(2),
  gedcomId: null, husbandId: null, wifeId: null, marriageDate: null,
  marriagePlace: null, marriageOrder: null, notes: null, childIds: [], ...f
})

describe('buildInvestigationPlan', () => {
  it('for a missing FATHER, surfaces the known mother and siblings as clues', () => {
    const father = mk({ id: 'F', givenName: 'Apa' })
    const mother = mk({ id: 'M', givenName: 'Anya' })
    const child = mk({ id: 'X', givenName: 'Gyerek', birthDate: '1893', birthPlace: 'Újkígyós' })
    const sib = mk({ id: 'S', givenName: 'Testvér' })
    const families = [fam({ husbandId: 'F', wifeId: 'M', childIds: ['X', 'S'] })]
    const byId = new Map([father, mother, child, sib].map((p) => [p.id, p]))

    const plan = buildInvestigationPlan({
      relation: 'father', focus: 'birth', anchor: child,
      families, peopleById: byId, documents: [], logs: [], t
    })

    expect(plan.anchor.id).toBe('X')
    const personRefs = plan.clues.filter((c) => c.kind === 'person').map((c) => c.refId)
    expect(personRefs).toContain('M') // known parent (mother)
    expect(personRefs).toContain('S') // sibling
    // Scripted guidance + records notes are always added.
    expect(plan.clues.filter((c) => c.kind === 'note').length).toBeGreaterThanOrEqual(2)
  })

  it('for a missing CHILD, surfaces the spouse and known children', () => {
    const x = mk({ id: 'X', givenName: 'Szülő' })
    const spouse = mk({ id: 'SP', givenName: 'Társ' })
    const kid = mk({ id: 'C', givenName: 'Ismert' })
    const families = [fam({ husbandId: 'X', wifeId: 'SP', childIds: ['C'] })]
    const byId = new Map([x, spouse, kid].map((p) => [p.id, p]))

    const plan = buildInvestigationPlan({
      relation: 'child', focus: 'birth', anchor: x,
      families, peopleById: byId, documents: [], logs: [], t
    })

    const personRefs = plan.clues.filter((c) => c.kind === 'person').map((c) => c.refId)
    expect(personRefs).toContain('SP')
    expect(personRefs).toContain('C')
  })

  it('includes the anchor\'s own marriage record even when hunting a parent', () => {
    const father = mk({ id: 'F' })
    const mother = mk({ id: 'M' })
    const x = mk({ id: 'X', givenName: 'Gyerek' })
    const spouse = mk({ id: 'SP', givenName: 'Társ' })
    const families = [
      fam({ husbandId: 'F', wifeId: 'M', childIds: ['X'] }),
      fam({ husbandId: 'X', wifeId: 'SP', marriageDate: '1918', marriagePlace: 'Békés', childIds: [] })
    ]
    const byId = new Map([father, mother, x, spouse].map((p) => [p.id, p]))

    const plan = buildInvestigationPlan({
      relation: 'father', focus: 'birth', anchor: x,
      families, peopleById: byId, documents: [], logs: [], t
    })
    // Spouse surfaced + a marriage-fact note (t stub returns the key).
    expect(plan.clues.filter((c) => c.kind === 'person').map((c) => c.refId)).toContain('SP')
    expect(plan.clues.some((c) => c.kind === 'note' && c.content === 'board.wizard.fact.marriage')).toBe(true)
  })

  it('suggests finding the marriage when a spouse exists but no marriage is recorded', () => {
    const x = mk({ id: 'X' })
    const spouse = mk({ id: 'SP' })
    const families = [fam({ husbandId: 'X', wifeId: 'SP', childIds: [] })] // no date/place
    const byId = new Map([x, spouse].map((p) => [p.id, p]))

    const plan = buildInvestigationPlan({
      relation: 'father', focus: 'birth', anchor: x,
      families, peopleById: byId, documents: [], logs: [], t
    })
    expect(plan.clues.some((c) => c.kind === 'note' && c.content === 'board.wizard.guide.findMarriage')).toBe(true)
  })

  it('turns attached documents into evidence/document clues', () => {
    const x = mk({ id: 'X' })
    const plan = buildInvestigationPlan({
      relation: 'spouse', focus: 'marriage', anchor: x,
      families: [], peopleById: new Map([['X', x]]),
      documents: [
        { id: 'd1', title: 'Photo', kind: 'photo', filePath: '/a/p.jpg', mimeType: 'image/jpeg', date: null, description: null, createdAt: '', personIds: ['X'] },
        { id: 'd2', title: 'Scan', kind: 'other', filePath: '/a/s.pdf', mimeType: 'application/pdf', date: null, description: null, createdAt: '', personIds: ['X'] }
      ],
      logs: [], t
    })
    expect(plan.clues.find((c) => c.refId === 'd1')?.kind).toBe('evidence')
    expect(plan.clues.find((c) => c.refId === 'd2')?.kind).toBe('document')
  })
})
