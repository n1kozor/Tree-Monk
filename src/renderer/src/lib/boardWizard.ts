import type { DocumentRecord, Family, Person, ResearchLog } from '@shared/types'
import { fullName, yearOf } from './utils'

/** What relationship the investigation is hunting for. */
export type WizardRelation = 'father' | 'mother' | 'child' | 'spouse'
/** Which record/event the user means to chase down (drives the guidance notes). */
export type WizardFocus = 'birth' | 'marriage' | 'death'

/** One node the wizard will drop onto the assembled board. */
export interface InvestigationClue {
  kind: 'person' | 'note' | 'evidence' | 'document'
  label: string
  content?: string | null
  refId?: string | null
  mime?: string
  ext?: string
}

/** A fully-resolved blueprint the board store turns into nodes + threads. */
export interface InvestigationPlan {
  zoneTitle: string
  mysteryLabel: string
  mysteryContent: string | null
  anchor: { id: string; label: string }
  clues: InvestigationClue[]
}

type T = (k: string, o?: Record<string, unknown>) => string

const extOf = (filePath: string): string => filePath.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
const dash = '…'

/** A person's short "years · place" descriptor for a clue subtitle. */
function personSub(p: Person): string {
  const yrs = [yearOf(p.birthDate), yearOf(p.deathDate)].join('–').replace(/^–$/, '')
  return [yrs, (p.birthPlace ?? '').split(',')[0].trim()].filter(Boolean).join(' · ')
}

/**
 * Turns a goal (relation + focus + anchor person) plus everything we already know
 * from the database into a board blueprint: the unknown, the anchor, the known
 * relatives/sources/prior-research that could crack it, and scripted, localized
 * research guidance. Pure → unit-testable; the caller fetches docs/logs first.
 */
export function buildInvestigationPlan(opts: {
  relation: WizardRelation
  focus: WizardFocus
  anchor: Person
  families: Family[]
  peopleById: Map<string, Person>
  documents: DocumentRecord[]
  logs: ResearchLog[]
  t: T
}): InvestigationPlan {
  const { relation, focus, anchor, families, peopleById, documents, logs, t } = opts
  const name = fullName(anchor)
  const clues: InvestigationClue[] = []
  const personClue = (p: Person, role: string): InvestigationClue => ({
    kind: 'person',
    label: fullName(p),
    refId: p.id,
    content: [role, personSub(p)].filter(Boolean).join(' — ')
  })

  // --- Known vitals as a context note ---
  const vitals: string[] = []
  if (anchor.birthDate || anchor.birthPlace)
    vitals.push(t('board.wizard.fact.born', { date: anchor.birthDate || dash, place: anchor.birthPlace || dash }))
  if (anchor.deathDate || anchor.deathPlace)
    vitals.push(t('board.wizard.fact.died', { date: anchor.deathDate || dash, place: anchor.deathPlace || dash }))
  if (vitals.length) clues.push({ kind: 'note', label: '', content: `${t('board.wizard.fact.title')}\n${vitals.join('\n')}` })

  // --- Relationship-specific known people ---
  const parentFamily = families.find((f) => f.childIds.includes(anchor.id))
  const unions = families.filter((f) => f.husbandId === anchor.id || f.wifeId === anchor.id)

  // Known PARENT-side context — only relevant when hunting a parent.
  if (relation === 'father' || relation === 'mother') {
    if (parentFamily) {
      const knownParentId = relation === 'father' ? parentFamily.wifeId : parentFamily.husbandId
      const known = knownParentId ? peopleById.get(knownParentId) : undefined
      if (known) clues.push(personClue(known, t('board.wizard.role.knownParent')))
      for (const cid of parentFamily.childIds) {
        if (cid === anchor.id) continue
        const sib = peopleById.get(cid)
        if (sib) clues.push(personClue(sib, t('board.wizard.role.sibling')))
      }
    }
  }

  // The anchor's OWN marriages/spouses — useful context for ANY investigation.
  // When a union has a recorded marriage we note its date/place; when there's a
  // spouse (or children) but NO marriage on file, we add the "find the marriage
  // record first" lead — it usually names the parents and the prior residence.
  const bornPlace = anchor.birthPlace?.trim() || dash
  const bornYear = yearOf(anchor.birthDate) || dash
  for (const f of unions) {
    const spId = f.husbandId === anchor.id ? f.wifeId : f.husbandId
    const sp = spId ? peopleById.get(spId) : undefined
    if (sp) clues.push(personClue(sp, t('board.wizard.role.spouse')))
    const spouseName = sp ? fullName(sp) : dash
    if (f.marriageDate || f.marriagePlace) {
      clues.push({
        kind: 'note',
        label: '',
        content: t('board.wizard.fact.marriage', { spouse: spouseName, date: f.marriageDate || dash, place: f.marriagePlace || dash })
      })
    } else if (sp || f.childIds.length) {
      clues.push({
        kind: 'note',
        label: '',
        content: t('board.wizard.guide.findMarriage', { spouse: spouseName, name, place: bornPlace, year: bornYear })
      })
    }
    if (relation === 'child' || relation === 'spouse') {
      for (const cid of f.childIds) {
        const ch = peopleById.get(cid)
        if (ch) clues.push(personClue(ch, t(relation === 'spouse' ? 'board.wizard.role.sharedChild' : 'board.wizard.role.knownChild')))
      }
    }
  }

  // --- Evidence already attached to the anchor (cap the count) ---
  for (const d of documents.slice(0, 6)) {
    const isImg = (d.mimeType ?? '').startsWith('image/')
    clues.push({
      kind: isImg ? 'evidence' : 'document',
      label: d.title || t('board.wizard.role.document'),
      refId: d.id,
      mime: d.mimeType ?? undefined,
      ext: extOf(d.filePath)
    })
  }

  // --- Prior research (incl. negative results — what's already been ruled out) ---
  for (const l of logs.slice(0, 4)) {
    clues.push({
      kind: 'note',
      label: '',
      content: `${t('board.wizard.role.priorResearch')}\n${l.date} · ${t(`research.result.${l.result}`, { defaultValue: l.result })}\n${l.title}${l.repository ? `\n${l.repository}` : ''}`
    })
  }

  // --- Scripted, localized research guidance ---
  const place =
    (focus === 'death' ? anchor.deathPlace : anchor.birthPlace)?.trim() ||
    anchor.birthPlace?.trim() ||
    dash
  const year =
    yearOf(focus === 'death' ? anchor.deathDate : anchor.birthDate) || yearOf(anchor.birthDate) || dash
  clues.push({ kind: 'note', label: '', content: t(`board.wizard.guide.${relation}`, { name, place, year }) })
  clues.push({ kind: 'note', label: '', content: t(`board.wizard.records.${focus}`, { place, year }) })

  return {
    zoneTitle: t('board.wizard.zoneTitle', { name, relation: t(`board.wizard.rel.${relation}`) }),
    mysteryLabel: t(`board.wizard.mystery.${relation}`, { name }),
    mysteryContent: t(`board.wizard.mysteryDesc.${relation}`, { name }),
    anchor: { id: anchor.id, label: name },
    clues
  }
}
