import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crosshair,
  FileText,
  Link2,
  Maximize2,
  Minimize2,
  Plus,
  TreeDeciduous,
  UserPlus,
  Users
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import type { PedigreeCouple, PedigreePerson, Sex } from '@shared/types'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { cn, formatName } from '@/lib/utils'
import { KinshipContext, useKinshipNote } from './kinshipContext'
import { PanZoom, useTreeLod } from './PanZoom'

/** Optional per-person card tint for the custom view's colour-coding. A function
 *  id → CSS colour (or null). Provided by PedigreeChart, consumed by PersonRow. */
const CardColorContext = createContext<((id: string) => string | null | undefined) | null>(null)

/** Per-card look (frame, background, radius, shadow) — set from the display
 *  settings at the chart root, consumed by every card in every card-based view. */
export interface CardStyle {
  bg: string
  border: string
  borderWidth: number
  radius: number
  shadow: boolean
}
const CARD_STYLE_DEFAULT: CardStyle = { bg: 'auto', border: 'auto', borderWidth: 1, radius: 12, shadow: true }
export const CardStyleContext = createContext<CardStyle>(CARD_STYLE_DEFAULT)
export function useCardStyle(): CardStyle {
  return useContext(CardStyleContext)
}
/** True if a `#rrggbb` colour is dark (so text on it should be light). Uses
 *  perceived luminance; non-hex (e.g. 'auto') is treated as not-dark. */
export function isDarkColor(hex: string): boolean {
  const m = hex.replace('#', '')
  if (m.length < 6) return false
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return false
  return 0.299 * r + 0.587 * g + 0.114 * b < 140
}

/** Resolves the card-style settings into concrete CSS for a card wrapper.
 *  `accent` is the active accent colour (used when border is set to 'accent'),
 *  `selected` highlights the card with the accent ring regardless of the base.
 *  When a custom card background is set, the theme text variables are flipped so
 *  text stays readable: light text on a dark card, dark text on a light card. */
export function cardStyleCss(cs: CardStyle, accent: string, selected: boolean): CSSProperties {
  const border =
    cs.border === 'accent' ? accent : cs.border === 'auto' ? 'hsl(var(--border))' : cs.border
  // Override the foreground/muted/border theme vars (they cascade to every child
  // via Tailwind's text-foreground / text-muted-foreground / border-border).
  const textVars =
    cs.bg === 'auto'
      ? {}
      : isDarkColor(cs.bg)
        ? { '--foreground': '210 40% 98%', '--muted-foreground': '214 20% 80%', '--border': '215 20% 50%', '--secondary': '215 25% 27%' }
        : { '--foreground': '222 47% 11%', '--muted-foreground': '215 16% 40%', '--border': '214 20% 84%', '--secondary': '210 40% 94%' }
  return {
    borderRadius: cs.radius,
    borderWidth: cs.borderWidth,
    borderStyle: 'solid',
    ...textVars,
    // Names (and any text without an explicit colour) INHERIT `color`, so set it
    // on the card from the (now overridden) foreground var — else they'd keep the
    // page-level colour and stay dark on a dark card.
    ...(cs.bg !== 'auto' ? { backgroundColor: cs.bg, color: 'hsl(var(--foreground))' } : {}),
    ...(selected
      ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}55, 0 10px 20px -8px rgba(0,0,0,0.5)` }
      : { borderColor: border, boxShadow: cs.shadow ? '0 10px 20px -12px rgba(0,0,0,0.45)' : 'none' })
  } as CSSProperties
}

export interface PedigreeLayout {
  colGap: number
  rowGap: number
  accent: string
  connectorWidth: number
  connectorOpacity: number
  background: string
  contrast: number
  brightness: number
  saturation: number
  sepia: number
  cardBg: string
  cardBorder: string
  cardBorderWidth: number
  cardRadius: number
  cardShadow: boolean
}

export const SPRING = { type: 'spring', stiffness: 240, damping: 30 } as const
export const CARD_W = 252
// CARD_H accounts for the two person rows + marriage line + children toggle so
// that the layout reserves the real card height.
export const CARD_H = 128
export const PAD = 80

export type BoxKind = 'anc' | 'desc'

export interface Box {
  couple: PedigreeCouple
  gen: number
  x: number
  y: number
  kind: BoxKind
  /** Stable, collision-proof key for this box instance (a couple.id may repeat). */
  uid?: string
}
export interface Link {
  id: string
  d: string
  /** Optional per-link stroke colour (portrait uses it to tint father/mother lines). */
  stroke?: string
}

export function elbow(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y1 - y2) < 1) return `M ${x1} ${y1} H ${x2}`
  const midX = (x1 + x2) / 2
  // Round the corners in the actual direction of travel. Ancestors run rightward
  // (x1 < x2) and descendants run leftward (x1 > x2); without the x-direction the
  // corner offsets point the wrong way on the descendant side and the line kinks.
  const r = Math.min(14, Math.abs(y2 - y1) / 2, Math.abs(x2 - x1) / 2)
  const ydir = y2 > y1 ? 1 : -1
  const xdir = x2 > x1 ? 1 : -1
  return `M ${x1} ${y1} H ${midX - r * xdir} Q ${midX} ${y1} ${midX} ${y1 + r * ydir} V ${y2 - r * ydir} Q ${midX} ${y2} ${midX + r * xdir} ${y2} H ${x2}`
}

export function PedigreeChart({
  root,
  probandId,
  issueIds,
  onSelectPerson,
  onRecenter,
  onAddParent,
  onAddChild,
  onAddSpouse,
  onSwitchUnion,
  layout,
  highlightIds,
  cardColor,
  kinshipNotes,
  refitSignal
}: {
  root: PedigreeCouple
  /** The focused start-person id (proband) — drives paternal/maternal line. */
  probandId?: string
  /** Person ids flagged by the sanity check — shown as a warning on the card. */
  issueIds: Set<string>
  onSelectPerson: (id: string) => void
  onRecenter: (id: string) => void
  /** Create a father (M) / mother (F) for the given child and re-fetch. */
  onAddParent: (childId: string, sex: Sex) => void
  /** Add a child to the given union family. */
  onAddChild: (familyId: string) => void
  /** Fill the empty husband/wife slot of an existing union family. */
  onAddSpouse: (familyId: string, role: 'husband' | 'wife') => void
  /** Re-root the tree on a person's alternate union (a different family tree). */
  onSwitchUnion: (personId: string, familyId: string) => void
  /** Display settings: generation/row spacing + accent color. */
  layout: PedigreeLayout
  /** When set, people in the set are highlighted and the rest are dimmed
   *  (the "Egyedi" custom view). Undefined = normal pedigree (no dimming). */
  highlightIds?: Set<string>
  /** Custom view colour-coding: person id → card tint (or null). */
  cardColor?: (id: string) => string | null | undefined
  /** person id → unusual-marriage tooltip (consanguinity / step-sibling). */
  kinshipNotes?: Map<string, string>
  /** Bumped when the tree page is re-shown — re-fits the camera so a stale
   *  viewport (it can drift "scattered" while hidden) snaps cleanly back. */
  refitSignal?: number
}): JSX.Element {
  const { t } = useTranslation()
  // Ancestors expand to the RIGHT; descendants expand to the LEFT. Each direction
  // has its own strict 1-level expansion set, keyed by couple id.
  const [ancExpanded, setAncExpanded] = useState<Set<string>>(() => new Set([root.id]))
  const [descExpanded, setDescExpanded] = useState<Set<string>>(() => new Set())
  // Camera intent: 'fit' = reframe everything (new tree / bulk), 'focus' = pan
  // to follow the just-toggled node at the current zoom.
  const [camera, setCamera] = useState<{ kind: 'fit' | 'focus'; id: string; tick: number }>(() => ({
    kind: 'fit',
    id: root.id,
    tick: 0
  }))
  const fitCamera = (): void => setCamera((c) => ({ kind: 'fit', id: root.id, tick: c.tick + 1 }))
  const focusCamera = (id: string): void => setCamera((c) => ({ kind: 'focus', id, tick: c.tick + 1 }))

  // Auto-collapse cleanup: whenever the root (tree/context) changes, reset BOTH
  // expansion sets so a previously-opened descendant branch never "leaks" into
  // the next tree. Returning to a tree always starts neatly collapsed.
  useEffect(() => {
    setAncExpanded(new Set([root.id]))
    setDescExpanded(new Set())
    setCamera((c) => ({ kind: 'fit', id: root.id, tick: c.tick + 1 }))
  }, [root.id])

  // Re-fit when the tree page is shown again (refitSignal bumps). The expansion
  // sets are LEFT UNTOUCHED, so the tree re-frames cleanly without losing how it
  // was opened. The very first value (mount) is ignored — that fit already runs.
  const rootIdRef = useRef(root.id)
  rootIdRef.current = root.id
  const firstRefit = useRef(true)
  useEffect(() => {
    if (firstRefit.current) {
      firstRefit.current = false
      return
    }
    setCamera((c) => ({ kind: 'fit', id: rootIdRef.current, tick: c.tick + 1 }))
  }, [refitSignal])

  const { boxes, links, width, height } = useMemo(() => {
    const colW = layout.colGap
    const leaf = layout.rowGap
    // ---- Ancestor pass (rightward, root at gen 0) ----
    const ancBoxes: Box[] = []
    let ancLeaf = 0
    const placeAnc = (couple: PedigreeCouple, gen: number): number => {
      const x = gen * colW
      const open = ancExpanded.has(couple.id)
      const fp = open ? couple.fatherParents : null
      const mp = open ? couple.motherParents : null
      let y: number
      if (!fp && !mp) {
        y = ancLeaf * leaf
        ancLeaf++
      } else if (fp && mp) {
        const yF = placeAnc(fp, gen + 1)
        const yM = placeAnc(mp, gen + 1)
        y = (yF + yM) / 2
      } else {
        y = placeAnc((fp ?? mp)!, gen + 1)
      }
      ancBoxes.push({ couple, gen, x, y, kind: 'anc' })
      return y
    }
    const rootY = placeAnc(root, 0)

    // ---- Descendant pass (leftward) ----
    const descBoxes: Box[] = []
    let descLeaf = 0
    const placeDesc = (couple: PedigreeCouple, depth: number): number => {
      const x = -depth * colW
      const kids = descExpanded.has(couple.id) ? couple.descendants : []
      let y: number
      if (!kids.length) {
        y = descLeaf * leaf
        descLeaf++
      } else {
        const ys = kids.map((k) => placeDesc(k, depth + 1))
        y = (Math.min(...ys) + Math.max(...ys)) / 2
      }
      descBoxes.push({ couple, gen: -depth, x, y, kind: 'desc' })
      return y
    }
    if (descExpanded.has(root.id)) for (const d of root.descendants) placeDesc(d, 1)

    // Center the descendant band vertically on the root so the chart stays balanced.
    if (descBoxes.length) {
      const dys = descBoxes.map((b) => b.y)
      const shift = rootY - (Math.min(...dys) + Math.max(...dys)) / 2
      descBoxes.forEach((b) => (b.y += shift))
    }

    const all = [...ancBoxes, ...descBoxes]

    // Normalize so the whole layout sits in positive space with padding.
    const ys = all.map((b) => b.y)
    const xs = all.map((b) => b.x)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const offsetX = -minX + PAD
    const offsetY = -minY + PAD
    all.forEach((b) => {
      b.x += offsetX
      b.y += offsetY + CARD_H / 2
    })

    const byCouple = new Map<PedigreeCouple, Box>(all.map((b) => [b.couple, b]))

    // A couple can legitimately appear more than once (pedigree collapse — a cousin
    // marriage reaches the same ancestor via both the father's and mother's line),
    // so couple.id is NOT unique across boxes. Give each box a stable, unique uid so
    // React / AnimatePresence keys never collide — duplicate keys were what made the
    // connector lines "fall apart" on re-root.
    const occ = new Map<string, number>()
    for (const b of all) {
      const n = occ.get(b.couple.id) ?? 0
      occ.set(b.couple.id, n + 1)
      b.uid = n === 0 ? `${b.kind}-${b.couple.id}` : `${b.kind}-${b.couple.id}#${n}`
    }

    const links: Link[] = []

    // Ancestor connectors: card right edge → its parents (to the right).
    for (const b of ancBoxes) {
      if (!ancExpanded.has(b.couple.id)) continue
      const childRight = b.x + CARD_W
      const fp = b.couple.fatherParents && byCouple.get(b.couple.fatherParents)
      const mp = b.couple.motherParents && byCouple.get(b.couple.motherParents)
      if (fp) links.push({ id: `f-${b.uid}`, d: elbow(childRight, b.y - 28, fp.x, fp.y) })
      if (mp) links.push({ id: `m-${b.uid}`, d: elbow(childRight, b.y + 28, mp.x, mp.y) })
    }

    // Descendant connectors: parent card left edge → each child couple's right edge.
    const rootBox = byCouple.get(root)
    const descSources = rootBox ? [rootBox, ...descBoxes] : descBoxes
    for (const b of descSources) {
      if (!descExpanded.has(b.couple.id)) continue
      for (const child of b.couple.descendants) {
        const cb = byCouple.get(child)
        if (cb) links.push({ id: `d-${b.uid}-${cb.uid}`, d: elbow(b.x, b.y, cb.x + CARD_W, cb.y) })
      }
    }

    return {
      boxes: all,
      links,
      width: maxX - minX + CARD_W + PAD * 2,
      height: maxY - minY + PAD * 2 + CARD_H
    }
  }, [root, ancExpanded, descExpanded, layout.colGap, layout.rowGap])

  // Collapse prunes the entire subtree so re-opening reveals only the next
  // generation again (not everything that was once expanded).
  const toggleAnc = (couple: PedigreeCouple): void => {
    focusCamera(couple.id)
    setAncExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(couple.id)) {
        const collect = (c: PedigreeCouple): void => {
          next.delete(c.id)
          if (c.fatherParents) collect(c.fatherParents)
          if (c.motherParents) collect(c.motherParents)
        }
        collect(couple)
      } else {
        next.add(couple.id)
      }
      return next
    })
  }

  const toggleDesc = (couple: PedigreeCouple): void => {
    focusCamera(couple.id)
    setDescExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(couple.id)) {
        const collect = (c: PedigreeCouple): void => {
          next.delete(c.id)
          c.descendants.forEach(collect)
        }
        collect(couple)
      } else {
        next.add(couple.id)
      }
      return next
    })
  }

  // ---- Bulk expand/collapse controls (reframe everything) ----
  const collapseAll = (): void => {
    fitCamera()
    setAncExpanded(new Set())
    setDescExpanded(new Set())
  }
  const expandAll = (): void => {
    fitCamera()
    const anc = new Set<string>()
    const ca = (c: PedigreeCouple): void => {
      anc.add(c.id)
      if (c.fatherParents) ca(c.fatherParents)
      if (c.motherParents) ca(c.motherParents)
    }
    ca(root)
    const desc = new Set<string>()
    const cd = (c: PedigreeCouple): void => {
      desc.add(c.id)
      c.descendants.forEach(cd)
    }
    if (root.descendants.length) {
      desc.add(root.id)
      root.descendants.forEach(cd)
    }
    setAncExpanded(anc)
    setDescExpanded(desc)
  }
  // The proband's OWN parents couple. The root couple is the proband + spouse,
  // so the proband's ancestry hangs off fatherParents (proband = husband) or
  // motherParents (proband = wife) — NOT the spouse's side.
  const probandParents =
    probandId && root.partner?.id === probandId ? root.motherParents : root.fatherParents

  // Expand a single direct line of the PROBAND: their father's (paternal) or
  // mother's (maternal) ancestry.
  const expandLine = (side: 'father' | 'mother'): void => {
    fitCamera()
    const s = new Set<string>([root.id])
    if (probandParents) {
      s.add(probandParents.id)
      let cur: PedigreeCouple | null =
        side === 'father' ? probandParents.fatherParents : probandParents.motherParents
      while (cur) {
        s.add(cur.id)
        cur = side === 'father' ? cur.fatherParents : cur.motherParents
      }
    }
    setAncExpanded(s)
    setDescExpanded(new Set())
  }

  const focusBox = camera.kind === 'focus' ? boxes.find((b) => b.couple.id === camera.id) : undefined

  return (
    <div
      className="absolute inset-0"
      style={{
        background: layout.background === 'auto' ? 'hsl(var(--background))' : layout.background
      }}
    >
      <div className="glass-subtle absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-xl p-1">
        <button
          onClick={expandAll}
          title={t('tree.expandAll')}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">{t('tree.expandAll')}</span>
        </button>
        <button
          onClick={collapseAll}
          title={t('tree.collapseAll')}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Minimize2 className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">{t('tree.collapseAll')}</span>
        </button>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <button
          onClick={() => expandLine('father')}
          title={t('tree.paternalLine')}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-sky-500 hover:bg-accent"
        >
          <span className="text-sm leading-none">♂</span>
          <span className="hidden lg:inline">{t('tree.paternalLine')}</span>
        </button>
        <button
          onClick={() => expandLine('mother')}
          title={t('tree.maternalLine')}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-pink-500 hover:bg-accent"
        >
          <span className="text-sm leading-none">♀</span>
          <span className="hidden lg:inline">{t('tree.maternalLine')}</span>
        </button>
      </div>

      <KinshipContext.Provider value={kinshipNotes ?? null}>
      <CardColorContext.Provider value={cardColor ?? null}>
      <CardStyleContext.Provider value={{ bg: layout.cardBg, border: layout.cardBorder, borderWidth: layout.cardBorderWidth, radius: layout.cardRadius, shadow: layout.cardShadow }}>
      <PanZoom
        fitKey={camera.kind === 'fit' ? camera.tick : undefined}
        contentWidth={width}
        contentHeight={height}
        focusKey={camera.kind === 'focus' ? camera.tick : undefined}
        focusX={focusBox ? focusBox.x + CARD_W / 2 : undefined}
        focusY={focusBox ? focusBox.y : undefined}
      >
        <div
          className="relative"
          style={{
            width,
            height,
            filter: `contrast(${layout.contrast}) brightness(${layout.brightness}) saturate(${layout.saturation}) sepia(${layout.sepia})`
          }}
        >
        <svg className="absolute inset-0 overflow-visible" width={width} height={height}>
          <AnimatePresence>
            {links.map((l) => (
              <motion.path
                key={l.id}
                d={l.d || ''}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SPRING}
                fill="none"
                stroke={layout.accent}
                strokeOpacity={layout.connectorOpacity}
                strokeWidth={layout.connectorWidth}
              />
            ))}
          </AnimatePresence>
        </svg>
        <AnimatePresence>
          {boxes.map((b) => (
            <CoupleCard
              key={b.uid}
              box={b}
              isRoot={b.couple.id === root.id}
              accent={layout.accent}
              issueIds={issueIds}
              ancExpandedFlag={ancExpanded.has(b.couple.id)}
              descExpandedFlag={descExpanded.has(b.couple.id)}
              onToggleAnc={() => toggleAnc(b.couple)}
              onToggleDesc={() => toggleDesc(b.couple)}
              onSelectPerson={onSelectPerson}
              onRecenter={onRecenter}
              onAddParent={onAddParent}
              onAddChild={onAddChild}
              onAddSpouse={onAddSpouse}
              onSwitchUnion={onSwitchUnion}
              living={t('tree.living')}
              deceased={t('tree.deceased')}
              highlightIds={highlightIds}
            />
          ))}
        </AnimatePresence>
      </div>
      </PanZoom>
      </CardStyleContext.Provider>
      </CardColorContext.Provider>
      </KinshipContext.Provider>
    </div>
  )
}

export function CoupleCard({
  box,
  isRoot,
  accent,
  issueIds,
  ancExpandedFlag,
  descExpandedFlag,
  onToggleAnc,
  onToggleDesc,
  onSelectPerson,
  onRecenter,
  onAddParent,
  onAddChild,
  onAddSpouse,
  onSwitchUnion,
  living,
  deceased,
  highlightIds,
  orientation = 'landscape',
  fatherExpandedFlag,
  motherExpandedFlag,
  onToggleAncSide
}: {
  box: Box
  isRoot: boolean
  accent: string
  issueIds: Set<string>
  ancExpandedFlag: boolean
  descExpandedFlag: boolean
  onToggleAnc: () => void
  onToggleDesc: () => void
  onSelectPerson: (id: string) => void
  onRecenter: (id: string) => void
  onAddParent: (childId: string, sex: Sex) => void
  onAddChild: (familyId: string) => void
  onAddSpouse: (familyId: string, role: 'husband' | 'wife') => void
  onSwitchUnion: (personId: string, familyId: string) => void
  living: string
  deceased: string
  highlightIds?: Set<string>
  /** 'landscape' = ancestors grow right (default); 'portrait' = ancestors grow up. */
  orientation?: 'landscape' | 'portrait'
  /** Portrait only: independent father's-line / mother's-line expansion. */
  fatherExpandedFlag?: boolean
  motherExpandedFlag?: boolean
  onToggleAncSide?: (side: 'father' | 'mother') => void
}): JSX.Element {
  const { t } = useTranslation()
  const { couple, x, y, kind } = box
  const [showKids, setShowKids] = useState(false)
  const [addMenu, setAddMenu] = useState<'primary' | 'partner' | null>(null)
  const [unionMenu, setUnionMenu] = useState<'primary' | 'partner' | null>(null)

  const isDesc = kind === 'desc'
  const portrait = orientation === 'portrait'
  const hasParents = !!(couple.fatherParents || couple.motherParents)
  const hasDescendants = couple.descendants.length > 0
  const kids = couple.children ?? []
  const openUp = kids.length > 3

  // Inline "Add Parent" placeholders appear at genuine ancestor branch ends:
  // a person shown here who has no parents recorded in the DB. Never on
  // descendant cards (their parent is the card to the right).
  const canAddForPrimary = !isDesc && !!couple.primary && couple.fatherParents === null
  const canAddForPartner = !isDesc && !!couple.partner && couple.motherParents === null
  const cardStyle = useCardStyle()

  return (
    <motion.div
      className="absolute"
      // Position is STATIC (set on every render), so a card and its connector
      // lines always move together. Animating left/top with a spring made the
      // cards glide while the SVG line `d` snapped instantly — that desync was
      // what made the tree "fall apart" (lines detached from cards) on re-root,
      // expand, or when returning to the tree from another view. Only the
      // enter/exit fade+scale animates now; the camera (PanZoom) animates reframes.
      style={{ width: CARD_W, left: x, top: y - CARD_H / 2, zIndex: showKids || addMenu ? 50 : undefined }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={SPRING}
    >
      <div
        className={cn('overflow-hidden', cardStyle.bg === 'auto' && 'bg-card')}
        style={{
          ...cardStyleCss(cardStyle, accent, isRoot),
          // Let the browser skip painting cards scrolled out of view — viewport
          // culling for free, which keeps panning a large tree smooth. The card
          // body already clips its own content, so paint containment is a no-op
          // when on-screen. The intrinsic size keeps geometry stable while skipped.
          contentVisibility: 'auto',
          containIntrinsicSize: `${CARD_W}px ${CARD_H}px`
        }}
      >
        <PersonRow
          person={couple.primary}
          hasUnions={couple.primaryUnions.length > 1}
          onToggleUnions={() => setUnionMenu((v) => (v === 'primary' ? null : 'primary'))}
          onSelect={onSelectPerson}
          onRecenter={onRecenter}
          living={living}
          deceased={deceased}
          highlightIds={highlightIds}
          hasIssue={!!couple.primary && issueIds.has(couple.primary.id)}
          onAddEmpty={couple.familyId ? () => onAddSpouse(couple.familyId!, 'husband') : undefined}
          addLabel={t('tree.addFather')}
        />
        <div className="flex items-center gap-1 border-y border-border/60 bg-secondary/40 px-2.5 py-0.5">
          <span className="truncate text-[10px] text-muted-foreground">
            {couple.marriageDate || couple.marriagePlace
              ? `⚭ ${[couple.marriageDate, couple.marriagePlace].filter(Boolean).join(' · ')}`
              : '⚭'}
          </span>
        </div>
        <PersonRow
          person={couple.partner}
          hasUnions={couple.partnerUnions.length > 1}
          onToggleUnions={() => setUnionMenu((v) => (v === 'partner' ? null : 'partner'))}
          onSelect={onSelectPerson}
          onRecenter={onRecenter}
          living={living}
          deceased={deceased}
          highlightIds={highlightIds}
          hasIssue={!!couple.partner && issueIds.has(couple.partner.id)}
          onAddEmpty={couple.familyId ? () => onAddSpouse(couple.familyId!, 'wife') : undefined}
          addLabel={t('tree.addMother')}
        />

        {/* Children summary + inline add-child (real unions only). */}
        {(kids.length > 0 || couple.familyId) && (
          <div className="flex items-center justify-between border-t border-border/60 px-2.5 py-1 text-[11px] font-medium">
            {kids.length > 0 ? (
              <button onClick={() => setShowKids((v) => !v)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                {t('person.children')} ({kids.length})
                {showKids ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            ) : (
              <span className="text-muted-foreground/60">
                {t('person.children')} (0)
              </span>
            )}
            {couple.familyId && (
              <button
                onClick={() => onAddChild(couple.familyId!)}
                className="flex items-center gap-0.5 text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> {t('person.addChild')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Floating children list — closes when you click anywhere else. */}
      {showKids && kids.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowKids(false)} />
          <div
            onWheel={(e) => e.stopPropagation()}
            className={`glass-strong absolute left-0 right-0 z-50 max-h-52 overflow-y-auto overscroll-contain rounded-2xl text-card-foreground ${
              openUp ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
          >
          {kids.map((k) => {
            const kn = formatName(k.given, k.surname) || k.name
            return (
            <button
              key={k.id}
              onClick={() => onSelectPerson(k.id)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent"
            >
              <PersonAvatar personId={k.id} name={kn} sex={k.sex} className="h-6 w-6 text-[9px]" />
              <span className="flex-1 truncate text-xs">{kn}</span>
              {k.birthYear && <span className="text-[10px] text-muted-foreground">{k.birthYear}</span>}
            </button>
            )
          })}
          </div>
        </>
      )}

      {/* Spouse switcher — re-roots on a different union (a different tree). */}
      {unionMenu &&
        (() => {
          const person = unionMenu === 'primary' ? couple.primary : couple.partner
          const unions = unionMenu === 'primary' ? couple.primaryUnions : couple.partnerUnions
          if (!person) return null
          return (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUnionMenu(null)} />
              <div
                className={`glass-strong absolute left-full z-50 ml-2 w-52 overflow-hidden rounded-2xl p-1 text-card-foreground ${
                  unionMenu === 'primary' ? 'top-0' : 'bottom-0'
                }`}
              >
                <p className="truncate px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('tree.switchUnion')}
                </p>
                {unions.map((u) => (
                  <button
                    key={u.familyId}
                    onClick={() => {
                      onSwitchUnion(person.id, u.familyId)
                      setUnionMenu(null)
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent ${
                      u.familyId === couple.familyId ? 'bg-accent/60' : ''
                    }`}
                  >
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate">
                      {formatName(u.spouseGiven, u.spouseSurname) || u.spouseName}
                    </span>
                    {u.familyId === couple.familyId && <span className="text-[9px] text-primary">●</span>}
                  </button>
                ))}
              </div>
            </>
          )
        })()}

      {/* Ancestor toggle — landscape: one toggle on the right (opens both lines). */}
      {!portrait && hasParents && (
        <button
          onClick={onToggleAnc}
          title={ancExpandedFlag ? t('tree.collapse') : t('tree.expandAncestors')}
          className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow hover:text-primary"
        >
          {ancExpandedFlag ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      )}

      {/* Portrait: TWO independent toggles on the top edge — the father's line
          (left, sky) and the mother's line (right, pink) open/close separately. */}
      {portrait && couple.fatherParents && (
        <button
          onClick={() => onToggleAncSide?.('father')}
          title={fatherExpandedFlag ? t('tree.collapse') : t('tree.paternalLine')}
          className="absolute -top-3 left-8 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-sky-500/50 bg-background text-sky-500 shadow hover:bg-sky-500/10"
        >
          {fatherExpandedFlag ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      )}
      {portrait && couple.motherParents && (
        <button
          onClick={() => onToggleAncSide?.('mother')}
          title={motherExpandedFlag ? t('tree.collapse') : t('tree.maternalLine')}
          className="absolute -top-3 right-8 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-pink-500/50 bg-background text-pink-500 shadow hover:bg-pink-500/10"
        >
          {motherExpandedFlag ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      )}

      {/* Descendant expand/collapse toggle (to the left) — landscape only, root + descendant cards. */}
      {!portrait && (isRoot || isDesc) && hasDescendants && (
        <button
          onClick={onToggleDesc}
          title={descExpandedFlag ? t('tree.collapse') : t('tree.expandDescendants')}
          className="absolute -left-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow hover:text-primary"
        >
          {descExpandedFlag ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      )}

      {/* Inline "Add Parent" placeholders at ancestor branch ends. */}
      {canAddForPrimary && (
        <AddParentNode
          className={portrait ? '-top-3 left-8' : '-right-3 top-7'}
          open={addMenu === 'primary'}
          onOpen={() => setAddMenu((v) => (v === 'primary' ? null : 'primary'))}
          onClose={() => setAddMenu(null)}
          onAdd={(sex) => {
            onAddParent(couple.primary!.id, sex)
            setAddMenu(null)
          }}
          forName={couple.primary!.name}
        />
      )}
      {canAddForPartner && (
        <AddParentNode
          className={portrait ? '-top-3 right-8' : '-right-3 bottom-7'}
          open={addMenu === 'partner'}
          onOpen={() => setAddMenu((v) => (v === 'partner' ? null : 'partner'))}
          onClose={() => setAddMenu(null)}
          onAdd={(sex) => {
            onAddParent(couple.partner!.id, sex)
            setAddMenu(null)
          }}
          forName={couple.partner!.name}
        />
      )}
    </motion.div>
  )
}

/** Persistent "+" placeholder that opens an Add Father / Add Mother menu. */
function AddParentNode({
  className,
  open,
  onOpen,
  onClose,
  onAdd,
  forName
}: {
  className: string
  open: boolean
  onOpen: () => void
  onClose: () => void
  onAdd: (sex: Sex) => void
  forName: string
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className={`absolute z-20 ${className}`}>
      <button
        onClick={onOpen}
        title={t('tree.addParentFor', { name: forName })}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-primary/60 bg-background text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div className="glass-strong absolute left-7 top-0 z-50 w-40 overflow-hidden rounded-2xl p-1 text-card-foreground">
            <p className="truncate px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {forName}
            </p>
            <button
              onClick={() => onAdd('M')}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
            >
              <UserPlus className="h-3.5 w-3.5 text-sky-500" /> {t('tree.addFather')}
            </button>
            <button
              onClick={() => onAdd('F')}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
            >
              <UserPlus className="h-3.5 w-3.5 text-pink-500" /> {t('tree.addMother')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function PersonRow({
  person,
  onSelect,
  onRecenter,
  living,
  deceased,
  hasUnions,
  onToggleUnions,
  hasIssue,
  onAddEmpty,
  addLabel,
  highlightIds
}: {
  person: PedigreePerson | null
  onSelect: (id: string) => void
  onRecenter: (id: string) => void
  living: string
  deceased: string
  hasUnions?: boolean
  onToggleUnions?: () => void
  hasIssue?: boolean
  onAddEmpty?: () => void
  addLabel?: string
  highlightIds?: Set<string>
}): JSX.Element {
  // Drop portrait images when zoomed out — dozens of decoded photos are the main
  // cause of slowdown on a fully-expanded tree.
  const lod = useTreeLod()
  // Custom view colour-coding (sex / century / surname / place), if active.
  const cardColor = useContext(CardColorContext)
  const kinNote = useKinshipNote(person?.id)
  const fsChange = useAppStore((s) => (person ? s.fsChanges[person.id] : undefined))
  const { t: tFs } = useTranslation()
  const fsTitle = tFs('fs.updateAvailable')
  if (!person) {
    return (
      <div className="flex h-[42px] items-center gap-2 px-2.5 text-xs text-muted-foreground/50">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-border">
          {onAddEmpty && <Plus className="h-3.5 w-3.5 text-muted-foreground/60" />}
        </div>
        {onAddEmpty ? (
          <button onClick={onAddEmpty} className="flex items-center gap-1 font-medium text-primary hover:underline">
            <Plus className="h-3 w-3" /> {addLabel}
          </button>
        ) : (
          '—'
        )}
      </div>
    )
  }
  const span =
    person.birthYear && person.deathYear
      ? `${person.birthYear}–${person.deathYear}`
      : person.birthYear
        ? `${person.birthYear}–${person.living ? living : deceased}`
        : person.deathYear
          ? `–${person.deathYear}`
          : person.living
            ? living
            : deceased
  const display = formatName(person.given, person.surname) || person.name
  // "Egyedi" view: highlight matches, dim everyone else.
  const matched = highlightIds?.has(person.id)
  const dimmed = !!highlightIds && !matched
  const tint = cardColor?.(person.id) || null
  return (
    <div
      className={cn(
        'group/row relative flex h-[42px] items-center gap-2 px-2.5 transition-opacity',
        dimmed && 'opacity-25',
        matched && 'bg-primary/10'
      )}
      style={tint && !matched ? { backgroundColor: `${tint}14` } : undefined}
    >
      {tint && <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: tint }} />}
      <PersonAvatar
        personId={person.id}
        name={display}
        sex={person.sex}
        noPhoto={lod !== 'full'}
        className="h-8 w-8 text-[11px]"
      />
      <button
        onClick={() => onSelect(person.id)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-1">
          {hasIssue && (
            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" aria-label="data issue" />
          )}
          {kinNote && (
            <span title={kinNote} aria-label={kinNote} className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
              <Link2 className="h-2.5 w-2.5" />
            </span>
          )}
          {fsChange && (
            <span
              role="button"
              title={fsTitle}
              onClick={(e) => {
                e.stopPropagation()
                window.dispatchEvent(new CustomEvent('fs-open-sync', { detail: { personId: person.id } }))
              }}
              className="flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-white shadow hover:bg-emerald-600"
            >
              <TreeDeciduous className="h-2.5 w-2.5" />
            </span>
          )}
          <span className="truncate text-[13px] font-semibold leading-tight hover:text-primary">
            {display}
          </span>
          {person.docs > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary/15 px-1 text-[9px] font-medium text-primary">
              <FileText className="h-2 w-2" />
              {person.docs}
            </span>
          )}
        </div>
        <span className="block text-[11px] leading-tight text-muted-foreground">{span}</span>
      </button>
      {hasUnions && (
        <button
          onClick={onToggleUnions}
          title="Switch spouse"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-amber-500 hover:bg-accent"
        >
          <Users className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        onClick={() => onRecenter(person.id)}
        title="Center here"
        className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-primary group-hover/row:flex"
      >
        <Crosshair className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
