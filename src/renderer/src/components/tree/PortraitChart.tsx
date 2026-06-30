import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronUp, Link2, Plus, UserPlus, Users } from 'lucide-react'
import type { PedigreeCouple, PedigreePerson, Sex } from '@shared/types'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { cn, formatName } from '@/lib/utils'
import { KinshipContext, useKinshipNote } from './kinshipContext'
import { PanZoom } from './PanZoom'
import { PAD, SPRING, CardStyleContext, useCardStyle, cardStyleCss, type PedigreeLayout } from './PedigreeChart'

// ---- Portrait geometry (everything is an UPRIGHT card) ----------------------
const TILE_W = 100
const TILE_GAP = 8
const COUPLE_W = TILE_W * 2 + TILE_GAP // 208
const CPL_H = 136
const SIBC_W = 80 // a small (collateral / descendant) tile
const SIBC_H = 116
const SIBPAIR_GAP = 6 // gap between a small person and their spouse
const PAIR_W = SIBC_W * 2 + SIBPAIR_GAP // 166
const PAIR_OFF = (SIBC_W + SIBPAIR_GAP) / 2 // blood-tile offset from a pair's centre
const SIBC_GAP = 16 // gap between sibling units

const unitW = (hasSpouse: boolean): number => (hasSpouse ? PAIR_W : SIBC_W)
const bloodCx = (centre: number, hasSpouse: boolean): number => (hasSpouse ? centre - PAIR_OFF : centre)
const tilesOf = (centre: number, hasSpouse: boolean): number[] => (hasSpouse ? [centre - PAIR_OFF, centre + PAIR_OFF] : [centre])

const clamp2: React.CSSProperties = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }
const TINY = 'flex h-[18px] w-[18px] items-center justify-center rounded-full border bg-background shadow-sm transition-colors'

/** Vertical connector: straight V → H → V with small rounded 90° corners. */
function velbow(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(x1 - x2) < 1) return `M ${x1} ${y1} V ${y2}`
  const midY = (y1 + y2) / 2
  const r = Math.min(8, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2)
  const ydir = y2 > y1 ? 1 : -1
  const xdir = x2 > x1 ? 1 : -1
  return `M ${x1} ${y1} V ${midY - r * ydir} Q ${x1} ${midY} ${x1 + r * xdir} ${midY} H ${x2 - r * xdir} Q ${x2} ${midY} ${x2} ${midY + r * ydir} V ${y2}`
}

function lifespan(p: PedigreePerson, living: string, deceased: string): string {
  if (p.birthYear && p.deathYear) return `${p.birthYear}–${p.deathYear}`
  if (p.birthYear) return `${p.birthYear}–${p.living ? living : deceased}`
  if (p.deathYear) return `–${p.deathYear}`
  return p.living ? living : deceased
}

const sexRing = (sex?: Sex): string => (sex === 'M' ? '#0ea5e9' : sex === 'F' ? '#f43f5e' : '#94a3b8')

interface Node {
  couple: PedigreeCouple
  slotId: string
  gen: number
  x: number
  y: number
  uid: string
  sibsL: PedigreePerson[]
  sibsR: PedigreePerson[]
  leftOpen: boolean
  rightOpen: boolean
}
interface SmallNode {
  key: string
  person: PedigreePerson
  spouse: PedigreePerson | null
  x: number // unit centre
  y: number // top
  coupleId?: string
  hasChildren: boolean
  isSibling: boolean
}
interface Link {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  elbow: boolean
  /** Fork branch: (x1,y1)=fork centre, x2=parent-tile x, y2=parent bottom; the
   *  90° corner at (x2,y1) is rounded. */
  fork?: boolean
  stroke?: string
  /** Dashed = this parent is NOT the blood ancestor (a switched, non-lineage spouse). */
  dashed?: boolean
}

/** Rounded fork branch: horizontal from the centre to the tile, then up into it. */
function forkPath(cx: number, jy: number, px: number, pby: number): string {
  if (Math.abs(px - cx) < 1) return `M ${px} ${jy} V ${pby}`
  const dir = px > cx ? 1 : -1
  const vdir = pby > jy ? 1 : -1
  const r = Math.min(8, Math.abs(px - cx) / 2, Math.abs(jy - pby) / 2)
  return `M ${cx} ${jy} H ${px - r * dir} Q ${px} ${jy} ${px} ${jy + r * vdir} V ${pby}`
}

// =============================================================================
//  One UPRIGHT person card — used everywhere (just `compact` smaller).
// =============================================================================
function UprightPerson({
  person, compact, isRoot, accent, onSelect, onRecenter, living, deceased, highlightIds, onAddEmpty, addLabel
}: {
  person: PedigreePerson | null
  compact?: boolean
  isRoot?: boolean
  accent: string
  onSelect: (id: string) => void
  onRecenter: (id: string) => void
  living: string
  deceased: string
  highlightIds?: Set<string>
  onAddEmpty?: () => void
  addLabel?: string
}): JSX.Element {
  const w = compact ? SIBC_W : TILE_W
  const h = compact ? SIBC_H : CPL_H
  const kinNote = useKinshipNote(person?.id)
  const cardStyle = useCardStyle()
  if (!person) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 bg-card/40" style={{ width: w, height: h }}>
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-border">{onAddEmpty && <Plus className="h-4 w-4 text-muted-foreground/60" />}</div>
        {onAddEmpty && addLabel ? <button onClick={onAddEmpty} className="px-1 text-[10px] font-medium leading-tight text-primary hover:underline">{addLabel}</button> : <span className="text-xs text-muted-foreground/50">—</span>}
      </div>
    )
  }
  const display = formatName(person.given, person.surname) || person.name
  const matched = highlightIds?.has(person.id)
  const dimmed = !!highlightIds && !matched
  return (
    <button
      onClick={() => onSelect(person.id)}
      onDoubleClick={() => onRecenter(person.id)}
      className={cn('relative flex flex-col items-center gap-1 border text-center transition-colors', cardStyle.bg === 'auto' && 'bg-card', compact ? 'px-1 py-1.5' : 'px-1.5 py-2', matched && 'bg-primary/10', dimmed && 'opacity-25')}
      style={{ width: w, height: h, ...cardStyleCss(cardStyle, accent, !!isRoot) }}
    >
      {kinNote && (
        <span title={kinNote} aria-label={kinNote} className="absolute left-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white shadow">
          <Link2 className="h-2.5 w-2.5" />
        </span>
      )}
      <div className="rounded-full" style={{ boxShadow: `0 0 0 2px ${sexRing(person.sex)}` }}>
        <PersonAvatar personId={person.id} name={display} sex={person.sex} className={compact ? 'h-9 w-9 text-xs' : 'h-12 w-12 text-sm'} />
      </div>
      <div className="w-full min-w-0 leading-tight">
        <p className={cn('font-semibold', compact ? 'text-[10px]' : 'text-[11px]')} style={clamp2}>{display}</p>
        <p className={cn('truncate text-muted-foreground', compact ? 'text-[9px]' : 'text-[10px]')}>{lifespan(person, living, deceased)}</p>
      </div>
    </button>
  )
}

/** A small unit = a person + (optional, line-less) spouse + an optional ▾. */
function SmallCard({
  person, spouse, accent, toggle, onSelect, onRecenter, living, deceased, highlightIds
}: {
  person: PedigreePerson
  spouse: PedigreePerson | null
  accent: string
  toggle?: { open: boolean; loading: boolean; onToggle: () => void }
  onSelect: (id: string) => void
  onRecenter: (id: string) => void
  living: string
  deceased: string
  highlightIds?: Set<string>
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="relative" style={{ width: unitW(!!spouse) }}>
      <div className="flex" style={{ gap: SIBPAIR_GAP }}>
        <UprightPerson person={person} compact accent={accent} onSelect={onSelect} onRecenter={onRecenter} living={living} deceased={deceased} highlightIds={highlightIds} />
        {spouse && <UprightPerson person={spouse} compact accent={accent} onSelect={onSelect} onRecenter={onRecenter} living={living} deceased={deceased} highlightIds={highlightIds} />}
      </div>
      {toggle && (
        <button onClick={(e) => { e.stopPropagation(); toggle.onToggle() }} title={t('tree.expandDescendants')}
          className={cn('absolute -bottom-2 left-1/2 z-20 -translate-x-1/2', TINY, toggle.open ? 'border-primary/50 text-primary' : 'border-border text-muted-foreground hover:text-primary')}>
          {toggle.loading ? <span className="text-[9px]">…</span> : toggle.open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      )}
    </div>
  )
}

// =============================================================================
//  A couple = two upright tiles + tiny per-side toggles + spouse switch
// =============================================================================
function FsCouple({
  node, isRoot, accent, fatherExpanded, motherExpanded, onToggleAncSide, onToggleSibSide, onSwitchInPlace,
  onSelectPerson, onRecenter, onAddParent, onAddSpouse, living, deceased, highlightIds,
  onToggleDesc, descOpen, descLoading
}: {
  node: Node
  isRoot: boolean
  accent: string
  fatherExpanded: boolean
  motherExpanded: boolean
  onToggleAncSide: (side: 'father' | 'mother') => void
  onToggleSibSide: (side: 'father' | 'mother') => void
  onSwitchInPlace: (slotId: string, personId: string, familyId: string) => void
  onSelectPerson: (id: string) => void
  onRecenter: (id: string) => void
  onAddParent: (childId: string, sex: Sex) => void
  onAddSpouse: (familyId: string, role: 'husband' | 'wife') => void
  living: string
  deceased: string
  highlightIds?: Set<string>
  /** Descendant (downward) toggle — only provided for the proband couple. */
  onToggleDesc?: () => void
  descOpen?: boolean
  descLoading?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const [addSide, setAddSide] = useState<'father' | 'mother' | null>(null)
  const [switchSide, setSwitchSide] = useState<'father' | 'mother' | null>(null)
  const { couple } = node
  const hCx = TILE_W / 2
  const wCx = COUPLE_W - TILE_W / 2

  const ParentToggle = ({ side, cx }: { side: 'father' | 'mother'; cx: number }): JSX.Element | null => {
    const has = side === 'father' ? !!couple.fatherParents : !!couple.motherParents
    const person = side === 'father' ? couple.primary : couple.partner
    const expanded = side === 'father' ? fatherExpanded : motherExpanded
    if (has) {
      return (
        <button onClick={() => onToggleAncSide(side)} title={expanded ? t('tree.collapse') : side === 'father' ? t('tree.paternalLine') : t('tree.maternalLine')}
          className={cn('absolute -top-2 z-10 -translate-x-1/2', TINY, side === 'father' ? 'border-sky-500/50 text-sky-500 hover:bg-sky-500/10' : 'border-pink-500/50 text-pink-500 hover:bg-pink-500/10')} style={{ left: cx }}>
          <ChevronUp className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
        </button>
      )
    }
    if (!person) return null
    return (
      <div className="absolute -top-2 z-20 -translate-x-1/2" style={{ left: cx }}>
        <button onClick={() => setAddSide((v) => (v === side ? null : side))} title={t('tree.addParentFor', { name: person.name })} className={cn(TINY, 'border-dashed border-primary/60 text-primary hover:bg-primary hover:text-primary-foreground')}>
          <Plus className="h-3 w-3" />
        </button>
        {addSide === side && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAddSide(null)} />
            <div className="glass-strong absolute left-1/2 top-6 z-50 w-40 -translate-x-1/2 overflow-hidden rounded-2xl p-1 text-card-foreground">
              <button onClick={() => { onAddParent(person.id, 'M'); setAddSide(null) }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"><UserPlus className="h-3.5 w-3.5 text-sky-500" /> {t('tree.addFather')}</button>
              <button onClick={() => { onAddParent(person.id, 'F'); setAddSide(null) }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"><UserPlus className="h-3.5 w-3.5 text-pink-500" /> {t('tree.addMother')}</button>
            </div>
          </>
        )}
      </div>
    )
  }

  const SwitchBtn = ({ side, cx }: { side: 'father' | 'mother'; cx: number }): JSX.Element | null => {
    const person = side === 'father' ? couple.primary : couple.partner
    const unions = side === 'father' ? couple.primaryUnions : couple.partnerUnions
    if (!person || unions.length < 2) return null
    return (
      <div className="absolute z-20 -translate-x-1/2" style={{ left: cx, top: CPL_H - 8 }}>
        <button onClick={() => setSwitchSide((v) => (v === side ? null : side))} title={t('tree.switchUnion')} className={cn(TINY, 'border-amber-500/50 text-amber-500 hover:bg-amber-500/10')}>
          <Users className="h-3 w-3" />
        </button>
        {switchSide === side && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setSwitchSide(null)} />
            <div className="glass-strong absolute left-1/2 top-6 z-50 w-52 -translate-x-1/2 overflow-hidden rounded-2xl p-1 text-card-foreground">
              <p className="truncate px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{t('tree.switchUnion')}</p>
              {unions.map((u) => (
                <button key={u.familyId} onClick={() => { onSwitchInPlace(node.slotId, person.id, u.familyId); setSwitchSide(null) }}
                  className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent', u.familyId === couple.familyId && 'bg-accent/60')}>
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{formatName(u.spouseGiven, u.spouseSurname) || u.spouseName}</span>
                  {u.familyId === couple.familyId && <span className="text-[9px] text-primary">●</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <motion.div className="absolute" style={{ width: COUPLE_W, left: node.x - COUPLE_W / 2, top: node.y, height: CPL_H }}
      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={SPRING}>
      <div className="absolute top-7 z-0 h-px" style={{ left: hCx, width: wCx - hCx, background: 'hsl(var(--border))' }} />
      <div className="relative z-[1] flex items-start" style={{ gap: TILE_GAP }}>
        <UprightPerson person={couple.primary} isRoot={isRoot} accent={accent} onSelect={onSelectPerson} onRecenter={onRecenter} living={living} deceased={deceased} highlightIds={highlightIds} onAddEmpty={couple.familyId ? () => onAddSpouse(couple.familyId!, 'husband') : undefined} addLabel={t('tree.addFather')} />
        <UprightPerson person={couple.partner} isRoot={isRoot} accent={accent} onSelect={onSelectPerson} onRecenter={onRecenter} living={living} deceased={deceased} highlightIds={highlightIds} onAddEmpty={couple.familyId ? () => onAddSpouse(couple.familyId!, 'wife') : undefined} addLabel={t('tree.addMother')} />
      </div>
      <ParentToggle side="father" cx={hCx} />
      <ParentToggle side="mother" cx={wCx} />
      <SwitchBtn side="father" cx={hCx} />
      <SwitchBtn side="mother" cx={wCx} />
      {node.sibsL.length > 0 && (
        <button onClick={() => onToggleSibSide('father')} title={t('tree.expandSiblings')}
          className={cn('absolute top-7 z-10 -translate-y-1/2', TINY, node.leftOpen ? 'border-sky-500/60 text-sky-600' : 'border-border text-muted-foreground hover:text-sky-600')} style={{ left: -10 }}>
          <ChevronLeft className="h-3 w-3" />
        </button>
      )}
      {node.sibsR.length > 0 && (
        <button onClick={() => onToggleSibSide('mother')} title={t('tree.expandSiblings')}
          className={cn('absolute top-7 z-10 -translate-y-1/2', TINY, node.rightOpen ? 'border-pink-500/60 text-pink-600' : 'border-border text-muted-foreground hover:text-pink-600')} style={{ left: COUPLE_W - 8 }}>
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
      {/* Descendants (downward) — the proband's children/grandchildren. */}
      {onToggleDesc && (
        <button onClick={onToggleDesc} title={t('tree.expandDescendants')}
          className={cn('absolute z-20 -translate-x-1/2', TINY, descOpen ? 'border-emerald-500/60 text-emerald-600' : 'border-border text-muted-foreground hover:text-emerald-600')} style={{ left: COUPLE_W / 2, top: CPL_H - 2 }}>
          {descLoading ? <span className="text-[9px] leading-none">…</span> : <ChevronDown className={cn('h-3 w-3 transition-transform', descOpen && 'rotate-180')} />}
        </button>
      )}
    </motion.div>
  )
}

// =============================================================================
//  The chart
// =============================================================================
export function PortraitChart({
  root, probandId, issueIds: _issueIds, onSelectPerson, onRecenter, onAddParent,
  onAddChild: _onAddChild, onAddSpouse, onSwitchUnion: _onSwitchUnion,
  fetchUnionCouple, fetchPersonDescendants, layout, highlightIds, kinshipNotes, refitSignal
}: {
  root: PedigreeCouple
  probandId?: string
  issueIds: Set<string>
  onSelectPerson: (id: string) => void
  onRecenter: (id: string) => void
  onAddParent: (childId: string, sex: Sex) => void
  onAddChild: (familyId: string) => void
  onAddSpouse: (familyId: string, role: 'husband' | 'wife') => void
  onSwitchUnion: (personId: string, familyId: string) => void
  fetchUnionCouple: (familyId: string) => Promise<PedigreeCouple | null>
  fetchPersonDescendants: (personId: string) => Promise<PedigreeCouple | null>
  layout: PedigreeLayout
  highlightIds?: Set<string>
  kinshipNotes?: Map<string, string>
  refitSignal?: number
}): JSX.Element {
  const { t } = useTranslation()
  const rootSides = (): Set<string> => {
    const s = new Set<string>()
    if (root.fatherParents) s.add(`${root.id}|f`)
    if (root.motherParents) s.add(`${root.id}|m`)
    return s
  }
  const [ancExpanded, setAncExpanded] = useState<Set<string>>(rootSides)
  const [sibSides, setSibSides] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Map<string, PedigreeCouple>>(new Map())
  const [overrideBlood, setOverrideBlood] = useState<Map<string, string>>(new Map())
  const [sibDown, setSibDown] = useState<Map<string, PedigreeCouple | null>>(new Map())
  const [sibLoading, setSibLoading] = useState<Set<string>>(new Set())
  const [descOpen, setDescOpen] = useState<Set<string>>(new Set())

  const [camera, setCamera] = useState<{ kind: 'fit' | 'focus'; id: string; tick: number }>(() => ({ kind: 'fit', id: root.id, tick: 0 }))
  const fitCamera = (): void => setCamera((c) => ({ kind: 'fit', id: root.id, tick: c.tick + 1 }))
  const focusCamera = (id: string): void => setCamera((c) => ({ kind: 'focus', id, tick: c.tick + 1 }))

  useEffect(() => {
    setAncExpanded(rootSides())
    setSibSides(new Set())
    setOverrides(new Map())
    setOverrideBlood(new Map())
    setSibDown(new Map())
    setDescOpen(new Set())
    setCamera((c) => ({ kind: 'fit', id: root.id, tick: c.tick + 1 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root.id])

  const rootIdRef = useRef(root.id)
  rootIdRef.current = root.id
  const firstRefit = useRef(true)
  useEffect(() => {
    if (firstRefit.current) { firstRefit.current = false; return }
    setCamera((c) => ({ kind: 'fit', id: rootIdRef.current, tick: c.tick + 1 }))
  }, [refitSignal])

  const { nodes, small, links, width, height } = useMemo(() => {
    const rowH = layout.rowGap
    const GAP = Math.max(24, layout.colGap * 0.1)
    const SEP = 18
    const resolve = (c: PedigreeCouple): PedigreeCouple => overrides.get(c.id) ?? c

    const sidesOf = (c: PedigreeCouple) => {
      const sibsL = c.fatherParents ? c.fatherParents.children.filter((k) => k.id !== c.primary?.id) : []
      const sibsR = c.motherParents ? c.motherParents.children.filter((k) => k.id !== c.partner?.id) : []
      const leftOpen = sibSides.has(`${c.id}|f`) && sibsL.length > 0
      const rightOpen = sibSides.has(`${c.id}|m`) && sibsR.length > 0
      return { sibsL, sibsR, leftOpen, rightOpen }
    }

    const measure = (orig: PedigreeCouple): number => {
      const c = resolve(orig)
      const { sibsL, sibsR, leftOpen, rightOpen } = sidesOf(c)
      const leftW = leftOpen ? sibsL.reduce((s, p) => s + unitW(!!p.spouse) + SIBC_GAP, 0) : 0
      const rightW = rightOpen ? sibsR.reduce((s, p) => s + unitW(!!p.spouse) + SIBC_GAP, 0) : 0
      const half = Math.max(COUPLE_W / 2 + leftW, COUPLE_W / 2 + rightW) + 8
      const fExp = ancExpanded.has(`${c.id}|f`) && c.fatherParents
      const mExp = ancExpanded.has(`${c.id}|m`) && c.motherParents
      let parentsW = 0
      if (fExp && mExp) parentsW = measure(c.fatherParents!) + GAP + measure(c.motherParents!)
      else if (fExp) parentsW = measure(c.fatherParents!)
      else if (mExp) parentsW = measure(c.motherParents!)
      return Math.max(half * 2, parentsW)
    }

    const nodes: Node[] = []
    const place = (orig: PedigreeCouple, gen: number, cx: number): void => {
      const c = resolve(orig)
      const { sibsL, sibsR, leftOpen, rightOpen } = sidesOf(c)
      nodes.push({ couple: c, slotId: orig.id, gen, x: cx, y: -gen * rowH, uid: '', sibsL, sibsR, leftOpen, rightOpen })
      const fExp = ancExpanded.has(`${c.id}|f`) && c.fatherParents
      const mExp = ancExpanded.has(`${c.id}|m`) && c.motherParents
      if (fExp && mExp) {
        const fw = measure(c.fatherParents!)
        const mw = measure(c.motherParents!)
        const total = fw + GAP + mw
        const left = cx - total / 2
        place(c.fatherParents!, gen + 1, left + fw / 2)
        place(c.motherParents!, gen + 1, left + fw + GAP + mw / 2)
      } else if (fExp) place(c.fatherParents!, gen + 1, cx)
      else if (mExp) place(c.motherParents!, gen + 1, cx)
    }
    place(root, 0, 0)

    const occN = new Map<string, number>()
    for (const n of nodes) { const i = occN.get(n.slotId) ?? 0; occN.set(n.slotId, i + 1); n.uid = i === 0 ? n.slotId : `${n.slotId}#${i}` }

    const small: SmallNode[] = []
    const links: Link[] = []
    const byCoupleId = new Map<string, Node>()
    for (const n of nodes) if (!byCoupleId.has(n.couple.id)) byCoupleId.set(n.couple.id, n)

    const occupied = new Map<number, [number, number][]>()
    const addOcc = (lev: number, lo: number, hi: number): void => { const a = occupied.get(lev) ?? []; a.push([lo, hi]); occupied.set(lev, a) }
    for (const n of nodes) addOcc(n.gen, n.x - COUPLE_W / 2, n.x + COUPLE_W / 2)

    // A child line rises, then FORKS into both parent tiles (FamilySearch style).
    // `dashTileX` (optional) marks a non-blood (switched, non-lineage) parent whose
    // branch of the fork is drawn dashed.
    const pushFork = (idp: string, stroke: string, childAnchors: number[], childTopY: number, parentTileXs: number[], parentBottomY: number, dashTileX?: number): void => {
      const centreX = parentTileXs.reduce((a, b) => a + b, 0) / parentTileXs.length
      const span = childTopY - parentBottomY
      const jY = parentBottomY + Math.max(14, Math.min(30, Math.abs(span) * 0.35))
      // one rounded branch per parent tile (so a non-blood side can be dashed)
      parentTileXs.forEach((px, i) => {
        const dashed = dashTileX != null && Math.abs(px - dashTileX) < 1
        links.push({ id: `${idp}-fk${i}`, x1: centreX, y1: jY, x2: px, y2: parentBottomY, elbow: false, fork: true, stroke, dashed })
      })
      childAnchors.forEach((cx, i) => links.push({ id: `${idp}-st${i}`, x1: cx, y1: childTopY, x2: centreX, y2: jY, elbow: true, stroke }))
    }
    // The dashed (non-blood) tile x of a switched parent couple, if any. When the
    // shown couple IS the original lineage family (id === slot), nothing is dashed.
    const dashTileOf = (p: Node): number | undefined => {
      if (p.couple.id === p.slotId) return undefined
      const bloodId = overrideBlood.get(p.slotId)
      if (!bloodId || !p.couple.primary || !p.couple.partner) return undefined
      const fX = p.x - COUPLE_W / 2 + TILE_W / 2
      const mX = p.x + COUPLE_W / 2 - TILE_W / 2
      if (p.couple.primary.id === bloodId) return mX
      if (p.couple.partner.id === bloodId) return fX
      return undefined
    }
    const tilesOfNode = (p: Node): number[] => {
      const fX = p.x - COUPLE_W / 2 + TILE_W / 2
      const mX = p.x + COUPLE_W / 2 - TILE_W / 2
      const arr: number[] = []
      if (p.couple.primary) arr.push(fX)
      if (p.couple.partner) arr.push(mX)
      return arr.length ? arr : [p.x]
    }

    // ---- pass B: sibling pairs (beside) + occupied + up-connectors ----
    const sibInfo: { node: Node; person: PedigreePerson; tiles: number[]; side: 'left' | 'right'; cardH: number }[] = []
    for (const n of nodes) {
      const top = n.y
      const hCenter = n.x - COUPLE_W / 2 + TILE_W / 2
      const wCenter = n.x + COUPLE_W / 2 - TILE_W / 2
      const fExp = ancExpanded.has(`${n.couple.id}|f`) && n.couple.fatherParents
      const mExp = ancExpanded.has(`${n.couple.id}|m`) && n.couple.motherParents

      const pack = (sibs: PedigreePerson[], side: 'left' | 'right'): number[] => {
        const blood: number[] = []
        let cursor = side === 'left' ? n.x - COUPLE_W / 2 : n.x + COUPLE_W / 2
        for (const s of sibs) {
          const hasSp = !!s.spouse
          const uw = unitW(hasSp)
          const cx = side === 'left' ? cursor - SIBC_GAP - uw / 2 : cursor + SIBC_GAP + uw / 2
          cursor = side === 'left' ? cursor - SIBC_GAP - uw : cursor + SIBC_GAP + uw
          blood.push(bloodCx(cx, hasSp))
          small.push({ key: `s-${n.uid}-${s.id}`, person: s, spouse: s.spouse ?? null, x: cx, y: top, hasChildren: true, isSibling: true })
          addOcc(n.gen, cx - uw / 2, cx + uw / 2)
          sibInfo.push({ node: n, person: s, tiles: tilesOf(cx, hasSp), side, cardH: SIBC_H })
        }
        return blood
      }

      const leftBlood = n.leftOpen ? pack(n.sibsL, 'left') : null
      if (fExp) {
        const p = byCoupleId.get(resolve(n.couple.fatherParents!).id)
        if (p) pushFork(`f-${n.uid}`, '#0ea5e9', [hCenter, ...(leftBlood ?? [])], top, tilesOfNode(p), p.y + CPL_H, dashTileOf(p))
      } else if (leftBlood) {
        const busY = top - 16
        const all = [hCenter, ...leftBlood]
        links.push({ id: `fbus-${n.uid}`, x1: Math.min(...all), y1: busY, x2: Math.max(...all), y2: busY, elbow: false, stroke: '#0ea5e9' })
        all.forEach((cx, i) => links.push({ id: `fbd-${n.uid}-${i}`, x1: cx, y1: busY, x2: cx, y2: top, elbow: false, stroke: '#0ea5e9' }))
      }

      const rightBlood = n.rightOpen ? pack(n.sibsR, 'right') : null
      if (mExp) {
        const q = byCoupleId.get(resolve(n.couple.motherParents!).id)
        if (q) pushFork(`m-${n.uid}`, '#f43f5e', [wCenter, ...(rightBlood ?? [])], top, tilesOfNode(q), q.y + CPL_H, dashTileOf(q))
      } else if (rightBlood) {
        const busY = top - 16
        const all = [wCenter, ...rightBlood]
        links.push({ id: `mbus-${n.uid}`, x1: Math.min(...all), y1: busY, x2: Math.max(...all), y2: busY, elbow: false, stroke: '#f43f5e' })
        all.forEach((cx, i) => links.push({ id: `mbd-${n.uid}-${i}`, x1: cx, y1: busY, x2: cx, y2: top, elbow: false, stroke: '#f43f5e' }))
      }
    }

    // The proband's OWN descendants (the starting person's children, grandchildren
    // …) use the very same downward machinery as siblings — just anchored under the
    // full-height root couple instead of a small sibling card.
    const rootNode = nodes.find((n) => n.slotId === root.id)
    const probandPid = probandId ?? root.primary?.id ?? root.partner?.id ?? null
    const probandPerson = probandPid && root.partner?.id === probandPid ? root.partner : root.primary
    if (rootNode && probandPid && probandPerson) {
      const hCenter = rootNode.x - COUPLE_W / 2 + TILE_W / 2
      const wCenter = rootNode.x + COUPLE_W / 2 - TILE_W / 2
      sibInfo.push({
        node: rootNode,
        person: { ...probandPerson, id: probandPid },
        tiles: root.partner ? [hCenter, wCenter] : [hCenter],
        side: 'right',
        cardH: CPL_H
      })
    }

    // ---- pass C: descendant subtrees of OPENED siblings + the proband ----
    for (const info of sibInfo) {
      const fc = sibDown.get(info.person.id)
      if (!fc || !fc.descendants.length) continue
      const gen = info.node.gen

      let leafX = 0
      const cards: { couple: PedigreeCouple; dx: number; rel: number }[] = []
      const forks: { ptiles: number[]; prel: number; crel: number; childBlood: number[] }[] = []
      const rec = (couple: PedigreeCouple, rel: number): number => {
        const hasSp = !!couple.partner
        const w = unitW(hasSp)
        const open = descOpen.has(couple.id) && couple.descendants.length > 0
        let dx: number
        if (open) {
          // Lay out the children first; the parent card centres over them. BUT a
          // wide couple (a pair, 166px) over a narrow set of children can stick
          // out past the subtree it occupies and overlap a NEIGHBOUR at the same
          // level. So reserve the couple's OWN width on both sides.
          const startX = leafX
          const cardStart = cards.length
          const forkStart = forks.length
          const cds = couple.descendants.map((ch) => rec(ch, rel - 1))
          dx = (Math.min(...cds) + Math.max(...cds)) / 2
          // Left overflow → shift this whole subtree (its cards + forks + the
          // children dx used below) right so the couple no longer sticks out left.
          const leftOverflow = startX - (dx - w / 2)
          if (leftOverflow > 0) {
            for (let i = cardStart; i < cards.length; i++) cards[i].dx += leftOverflow
            for (let i = forkStart; i < forks.length; i++) {
              forks[i].ptiles = forks[i].ptiles.map((d) => d + leftOverflow)
              forks[i].childBlood = forks[i].childBlood.map((d) => d + leftOverflow)
            }
            for (let i = 0; i < cds.length; i++) cds[i] += leftOverflow
            dx += leftOverflow
          }
          forks.push({ ptiles: tilesOf(dx, hasSp), prel: rel, crel: rel - 1, childBlood: couple.descendants.map((ch, i) => bloodCx(cds[i], !!ch.partner)) })
          // Right overflow → advance leafX past the couple's right edge so the
          // next sibling/leaf cannot land on top of it.
          leafX = Math.max(leafX, dx + w / 2 + SIBC_GAP)
        } else {
          dx = leafX + w / 2
          leafX += w + SIBC_GAP
        }
        cards.push({ couple, dx, rel })
        return dx
      }
      const topRaw = fc.descendants.map((ch) => ({ dx: rec(ch, -1), hasSp: !!ch.partner }))
      if (!cards.length) continue

      const allDx = cards.map((c) => c.dx)
      const centre = (Math.min(...allDx) + Math.max(...allDx)) / 2
      cards.forEach((c) => (c.dx -= centre))
      forks.forEach((f) => { f.ptiles = f.ptiles.map((d) => d - centre); f.childBlood = f.childBlood.map((d) => d - centre) })
      topRaw.forEach((tc) => (tc.dx -= centre))

      const bandMap = new Map<number, [number, number]>()
      for (const c of cards) {
        const w = unitW(!!c.couple.partner)
        const lo = c.dx - w / 2
        const hi = c.dx + w / 2
        const cur = bandMap.get(c.rel)
        if (!cur) bandMap.set(c.rel, [lo, hi])
        else { cur[0] = Math.min(cur[0], lo); cur[1] = Math.max(cur[1], hi) }
      }
      const present = [...bandMap.entries()].map(([rel, [lo, hi]]) => ({ lev: gen + rel, lo, hi }))

      const anchorX = (info.tiles.reduce((a, b) => a + b, 0) / info.tiles.length)
      let S = 0
      for (let it = 0; it < 120; it++) {
        let push = 0
        for (const b of present) {
          const occ = occupied.get(b.lev) ?? []
          const a1 = anchorX + S + b.lo
          const a2 = anchorX + S + b.hi
          for (const [olo, ohi] of occ) {
            if (a1 < ohi + SEP && a2 > olo - SEP) {
              if (info.side === 'right') push = Math.max(push, ohi + SEP - a1)
              else push = Math.min(push, olo - SEP - a2)
            }
          }
        }
        if (Math.abs(push) < 0.5) break
        S += push
      }
      for (const b of present) addOcc(b.lev, anchorX + S + b.lo, anchorX + S + b.hi)

      for (const c of cards) {
        small.push({ key: `d-${info.person.id}-${c.couple.id}`, person: c.couple.primary!, spouse: c.couple.partner, x: anchorX + S + c.dx, y: -(gen + c.rel) * rowH, coupleId: c.couple.id, hasChildren: c.couple.descendants.length > 0, isSibling: false })
      }
      // sibling → its children (fork into the sibling pair)
      pushFork(`dt-${info.person.id}`, 'hsl(var(--border))', topRaw.map((tc) => anchorX + S + bloodCx(tc.dx, tc.hasSp)), -(gen - 1) * rowH, info.tiles, info.node.y + info.cardH)
      // deeper descendant generations
      for (const f of forks) {
        pushFork(`df-${info.person.id}-${f.prel}-${f.ptiles[0]}`, 'hsl(var(--border))', f.childBlood.map((d) => anchorX + S + d), -(gen + f.crel) * rowH, f.ptiles.map((d) => anchorX + S + d), -(gen + f.prel) * rowH + SIBC_H)
      }
    }

    // ---- bounds over EVERYTHING, then offset ----
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of nodes) { minX = Math.min(minX, n.x - COUPLE_W / 2); maxX = Math.max(maxX, n.x + COUPLE_W / 2); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + CPL_H) }
    for (const s of small) { const w = unitW(!!s.spouse); minX = Math.min(minX, s.x - w / 2); maxX = Math.max(maxX, s.x + w / 2); minY = Math.min(minY, s.y - 18); maxY = Math.max(maxY, s.y + SIBC_H) }
    for (const l of links) { minX = Math.min(minX, l.x1, l.x2); maxX = Math.max(maxX, l.x1, l.x2); minY = Math.min(minY, l.y1, l.y2); maxY = Math.max(maxY, l.y1, l.y2) }
    const offX = -minX + PAD
    const offY = -minY + PAD
    nodes.forEach((n) => { n.x += offX; n.y += offY })
    small.forEach((s) => { s.x += offX; s.y += offY })
    links.forEach((l) => { l.x1 += offX; l.x2 += offX; l.y1 += offY; l.y2 += offY })

    return { nodes, small, links, width: maxX - minX + PAD * 2, height: maxY - minY + PAD * 2 }
  }, [root, probandId, ancExpanded, sibSides, overrides, overrideBlood, sibDown, descOpen, layout.colGap, layout.rowGap])

  // ---- interactions ----------------------------------------------------------
  const toggleAncSide = (couple: PedigreeCouple, side: 'father' | 'mother'): void => {
    focusCamera(couple.id)
    const key = `${couple.id}|${side === 'father' ? 'f' : 'm'}`
    setAncExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        const prune = (c: PedigreeCouple | null): void => {
          if (!c) return
          const r = overrides.get(c.id) ?? c
          next.delete(`${r.id}|f`); next.delete(`${r.id}|m`); prune(r.fatherParents); prune(r.motherParents)
        }
        prune(side === 'father' ? couple.fatherParents : couple.motherParents)
      } else next.add(key)
      return next
    })
  }
  const toggleSibSide = (couple: PedigreeCouple, side: 'father' | 'mother'): void => {
    focusCamera(couple.id)
    const key = `${couple.id}|${side === 'father' ? 'f' : 'm'}`
    setSibSides((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }
  // Switch shows the chosen spouse IN the couple tile (replacing the displayed
  // partner). `personId` is the person we keep (the blood ancestor) → the other
  // tile's fork is drawn dashed (non-lineage spouse).
  const switchInPlace = async (slotId: string, personId: string, familyId: string): Promise<void> => {
    // Switching back to the original (blood) union → drop the override entirely,
    // so the lineage couple returns and its connectors go solid again.
    if (familyId === slotId) {
      setOverrides((prev) => {
        const n = new Map(prev)
        n.delete(slotId)
        return n
      })
      setOverrideBlood((prev) => {
        const n = new Map(prev)
        n.delete(slotId)
        return n
      })
      focusCamera(slotId)
      return
    }
    const fetched = await fetchUnionCouple(familyId)
    if (!fetched) return
    setOverrides((prev) => new Map(prev).set(slotId, fetched))
    setOverrideBlood((prev) => new Map(prev).set(slotId, personId))
    focusCamera(fetched.id)
  }
  const toggleSibDown = async (personId: string): Promise<void> => {
    focusCamera(personId)
    if (sibDown.has(personId)) { setSibDown((prev) => { const n = new Map(prev); n.delete(personId); return n }); return }
    setSibLoading((p) => new Set(p).add(personId))
    const fetched = await fetchPersonDescendants(personId)
    setSibLoading((p) => { const n = new Set(p); n.delete(personId); return n })
    setSibDown((prev) => new Map(prev).set(personId, fetched))
  }
  const toggleDescOpen = (coupleId: string): void => {
    setDescOpen((prev) => { const n = new Set(prev); if (n.has(coupleId)) n.delete(coupleId); else n.add(coupleId); return n })
  }

  const collapseAll = (): void => {
    fitCamera(); setAncExpanded(rootSides()); setSibSides(new Set()); setSibDown(new Map()); setDescOpen(new Set())
  }
  const probandIsPartner = !!(probandId && root.partner?.id === probandId)
  const probandParents = probandIsPartner ? root.motherParents : root.fatherParents
  // The proband person id — used to expand the starting person's own descendants.
  const rootProbandPid = probandId ?? root.primary?.id ?? root.partner?.id ?? ''
  const expandLine = (side: 'father' | 'mother'): void => {
    fitCamera()
    const s = new Set<string>()
    s.add(`${root.id}|${probandIsPartner ? 'm' : 'f'}`)
    let cur: PedigreeCouple | null = probandParents
    while (cur) { s.add(`${cur.id}|${side === 'father' ? 'f' : 'm'}`); cur = side === 'father' ? cur.fatherParents : cur.motherParents }
    setAncExpanded(s)
  }

  const focusNode = camera.kind === 'focus' ? nodes.find((n) => n.couple.id === camera.id) : undefined

  return (
    <KinshipContext.Provider value={kinshipNotes ?? null}>
    <CardStyleContext.Provider value={{ bg: layout.cardBg, border: layout.cardBorder, borderWidth: layout.cardBorderWidth, radius: layout.cardRadius, shadow: layout.cardShadow }}>
    <div className="absolute inset-0" style={{ background: layout.background === 'auto' ? 'hsl(var(--background))' : layout.background }}>
      <div className="glass-subtle absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-xl p-1">
        <button onClick={collapseAll} title={t('tree.collapseAll')} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronsDownUp className="h-3.5 w-3.5" /><span className="hidden xl:inline">{t('tree.collapseAll')}</span></button>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <button onClick={() => expandLine('father')} title={t('tree.paternalLine')} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-sky-500 hover:bg-accent"><span className="text-sm leading-none">♂</span><span className="hidden lg:inline">{t('tree.paternalLine')}</span></button>
        <button onClick={() => expandLine('mother')} title={t('tree.maternalLine')} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-pink-500 hover:bg-accent"><span className="text-sm leading-none">♀</span><span className="hidden lg:inline">{t('tree.maternalLine')}</span></button>
      </div>

      <PanZoom
        fitKey={camera.kind === 'fit' ? camera.tick : undefined}
        contentWidth={width}
        contentHeight={height}
        focusKey={camera.kind === 'focus' ? camera.tick : undefined}
        focusX={focusNode ? focusNode.x : undefined}
        focusY={focusNode ? focusNode.y + CPL_H / 2 : undefined}
      >
        <div className="relative" style={{ width, height, filter: `contrast(${layout.contrast}) brightness(${layout.brightness}) saturate(${layout.saturation}) sepia(${layout.sepia})` }}>
          <svg className="absolute inset-0 overflow-visible" width={width} height={height}>
            <AnimatePresence>
              {links.map((l) => (
                <motion.path key={l.id} d={l.fork ? forkPath(l.x1, l.y1, l.x2, l.y2) : l.elbow ? velbow(l.x1, l.y1, l.x2, l.y2) : `M ${l.x1} ${l.y1} L ${l.x2} ${l.y2}`}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SPRING}
                  fill="none" stroke={l.stroke ?? layout.accent} strokeOpacity={layout.connectorOpacity} strokeWidth={layout.connectorWidth}
                  strokeDasharray={l.dashed ? '6 5' : undefined} />
              ))}
            </AnimatePresence>
          </svg>

          <AnimatePresence>
            {nodes.map((n) => (
              <FsCouple key={n.uid} node={n} isRoot={n.couple.id === root.id || n.slotId === root.id} accent={layout.accent}
                fatherExpanded={ancExpanded.has(`${n.couple.id}|f`)} motherExpanded={ancExpanded.has(`${n.couple.id}|m`)}
                onToggleAncSide={(side) => toggleAncSide(n.couple, side)} onToggleSibSide={(side) => toggleSibSide(n.couple, side)}
                onSwitchInPlace={switchInPlace} onSelectPerson={onSelectPerson} onRecenter={onRecenter} onAddParent={onAddParent} onAddSpouse={onAddSpouse}
                living={t('tree.living')} deceased={t('tree.deceased')} highlightIds={highlightIds}
                onToggleDesc={(n.couple.id === root.id || n.slotId === root.id) && rootProbandPid ? () => void toggleSibDown(rootProbandPid) : undefined}
                descOpen={!!rootProbandPid && sibDown.has(rootProbandPid)}
                descLoading={!!rootProbandPid && sibLoading.has(rootProbandPid)} />
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {small.map((s) => (
              <motion.div key={s.key} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={SPRING}
                className="absolute z-[5]" style={{ left: s.x - unitW(!!s.spouse) / 2, top: s.y }}>
                <SmallCard
                  person={s.person}
                  spouse={s.spouse}
                  accent={layout.accent}
                  toggle={s.isSibling
                    ? { open: sibDown.has(s.person.id), loading: sibLoading.has(s.person.id), onToggle: () => toggleSibDown(s.person.id) }
                    : s.hasChildren && s.coupleId
                      ? { open: descOpen.has(s.coupleId), loading: false, onToggle: () => toggleDescOpen(s.coupleId!) }
                      : undefined}
                  onSelect={onSelectPerson}
                  onRecenter={onRecenter}
                  living={t('tree.living')}
                  deceased={t('tree.deceased')}
                  highlightIds={highlightIds}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </PanZoom>
    </div>
    </CardStyleContext.Provider>
    </KinshipContext.Provider>
  )
}
