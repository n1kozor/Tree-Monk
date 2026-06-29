import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ChevronDown, ChevronRight, Heart, Loader2, Route, Search, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { useAppStore } from '@/store/useAppStore'
import { cn, fullName } from '@/lib/utils'
import { PanZoom } from '@/components/tree/PanZoom'
import { relationTerm } from '@/lib/kinship'
import type { Person, RelationKind, RelationshipPath } from '@shared/types'

const PICK_CAP = 50
const yr = (d: string | null): string => d?.match(/\b(\d{4})\b/)?.[1] ?? ''
/** Identifying detail so people with the same name/year are distinguishable. */
function personDetail(p: Person): string {
  const b = yr(p.birthDate)
  const d = yr(p.deathDate)
  const span = b || d ? `${b || '?'}–${d || (p.deceased ? '†' : '')}` : ''
  return [span, p.birthPlace || ''].filter(Boolean).join(' · ')
}

const CARD_W = 230
const CARD_H = 96 // name row + spouse line + children toggle
const COL = CARD_W + 110
const STEP_Y = 132
const PAD = 90

/** Rounded elbow connector (same shape as the pedigree's connectors). */
function elbow(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y1 - y2) < 1) return `M ${x1} ${y1} H ${x2}`
  const midX = (x1 + x2) / 2
  const r = Math.min(14, Math.abs(y2 - y1) / 2)
  const dir = y2 > y1 ? 1 : -1
  return `M ${x1} ${y1} H ${midX - r} Q ${midX} ${y1} ${midX} ${y1 + r * dir} V ${y2 - r * dir} Q ${midX} ${y2} ${midX + r} ${y2} H ${x2}`
}

/** Compact searchable person picker. */
function PersonSelect({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (id: string) => void
  placeholder: string
}): JSX.Element {
  const { t } = useTranslation()
  const people = useAppStore((s) => s.people)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const selected = people.find((p) => p.id === value)

  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Search-only (the tree may hold 100k+ people): never render the full list,
  // require a query, cap the results and report how many more matched.
  const result = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return { list: [] as Person[], total: 0, prompt: true }
    const all = people.filter((p) => fullName(p).toLowerCase().includes(needle))
    return { list: all.slice(0, PICK_CAP), total: all.length, prompt: false }
  }, [people, q])

  return (
    <div ref={boxRef} className="relative flex-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-7"
          value={open ? q : selected ? fullName(selected) : ''}
          placeholder={placeholder}
          onFocus={() => {
            setQ('')
            setOpen(true)
          }}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-xl">
          {result.prompt ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">{t('kinship.typeToSearch')}</p>
          ) : result.list.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">{t('kinship.noMatches')}</p>
          ) : (
            <>
              {result.list.map((p) => {
                const detail = personDetail(p)
                return (
                  <button
                    key={p.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(p.id)
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                  >
                    <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-7 w-7 shrink-0 text-[9px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{fullName(p)}</span>
                      {detail && (
                        <span className="block truncate text-[11px] tabular-nums text-muted-foreground">{detail}</span>
                      )}
                    </span>
                  </button>
                )
              })}
              {result.total > PICK_CAP && (
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  {t('kinship.more', { count: result.total - PICK_CAP })}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function RelationshipView(): JSX.Element {
  const { t } = useTranslation()
  const defaultRootId = useAppStore((s) => s.defaultRootId)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const kinshipFrom = useAppStore((s) => s.kinshipFrom)
  const kinshipTo = useAppStore((s) => s.kinshipTo)
  const families = useAppStore((s) => s.families)
  const peopleById = useAppStore((s) => s.peopleById)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [path, setPath] = useState<RelationshipPath | null>(null)
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fitTick, setFitTick] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Spouse + children of each person (for the family context on each path card).
  const ctx = useMemo(() => {
    const spouses = new Map<string, string[]>()
    const children = new Map<string, string[]>()
    const parents = new Map<string, string[]>()
    const push = (m: Map<string, string[]>, k: string, v: string | null): void => {
      if (!v) return
      const a = m.get(k) ?? []
      if (!a.includes(v)) a.push(v)
      m.set(k, a)
    }
    for (const f of families) {
      if (f.husbandId) {
        push(spouses, f.husbandId, f.wifeId)
        for (const c of f.childIds) push(children, f.husbandId, c)
      }
      if (f.wifeId) {
        push(spouses, f.wifeId, f.husbandId)
        for (const c of f.childIds) push(children, f.wifeId, c)
      }
      for (const c of f.childIds) {
        push(parents, c, f.husbandId)
        push(parents, c, f.wifeId)
      }
    }
    return { spouses, children, parents }
  }, [families])
  const nameOf = (id: string): string => {
    const p = peopleById.get(id)
    return p ? fullName(p) : '—'
  }
  // Path nodes carry a backend-combined name; reorder per locale from the store,
  // falling back to that name if the person isn't loaded.
  const pathName = (node: { id: string; name: string }): string => {
    const p = peopleById.get(node.id)
    return p ? fullName(p) : node.name
  }
  const toggleExpand = (id: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  useEffect(() => {
    if (!fromId && defaultRootId) setFromId(defaultRootId)
  }, [defaultRootId, fromId])

  // Opened from a profile's "How are we related?" — pre-fill both ends and run.
  useEffect(() => {
    if (!kinshipTo) return
    const f = kinshipFrom ?? defaultRootId ?? ''
    setFromId(f)
    setToId(kinshipTo)
    if (f && f !== kinshipTo && window.api.relationship) {
      setLoading(true)
      setSearched(true)
      window.api.relationship.find(f, kinshipTo).then((p) => {
        setPath(p)
        setLoading(false)
        setFitTick((n) => n + 1)
      })
    }
    useAppStore.setState({ kinshipFrom: undefined, kinshipTo: undefined })
  }, [kinshipFrom, kinshipTo, defaultRootId])

  const find = async (): Promise<void> => {
    if (!fromId || !toId || !window.api.relationship) return
    setLoading(true)
    setSearched(true)
    setPath(await window.api.relationship.find(fromId, toId))
    setLoading(false)
    setFitTick((n) => n + 1)
  }

  // Lay the path out on a canvas: each hop steps right; "parent" rises, "child"
  // drops, "spouse" stays level — so the route reads like a tree path.
  const layout = useMemo(() => {
    if (!path || path.nodes.length === 0) return null
    const raw: { x: number; y: number }[] = []
    let y = 0
    for (let i = 0; i < path.nodes.length; i++) {
      if (i > 0) {
        const r = path.relations[i - 1]
        y += r === 'parent' ? -STEP_Y : r === 'child' ? STEP_Y : 0
      }
      raw.push({ x: i * COL, y })
    }
    const ys = raw.map((p) => p.y)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const offY = PAD - minY
    const pos = raw.map((p) => ({ x: p.x + PAD, y: p.y + offY }))
    const links = pos.slice(0, -1).map((p, i) => {
      const x1 = p.x + CARD_W
      const y1 = p.y + CARD_H / 2
      const x2 = pos[i + 1].x
      const y2 = pos[i + 1].y + CARD_H / 2
      return { id: `l${i}`, d: elbow(x1, y1, x2, y2), midX: (x1 + x2) / 2, midY: (y1 + y2) / 2, rel: path.relations[i] }
    })
    return {
      pos,
      links,
      width: (path.nodes.length - 1) * COL + CARD_W + PAD * 2,
      height: maxY - minY + CARD_H + PAD * 2
    }
  }, [path])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="space-y-2.5 border-b border-border p-3">
        {/* Title row (the topbar no longer prints the page name) */}
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="text-sm font-semibold leading-tight">{t('kinship.title')}</h2>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            · {t('kinship.subtitle')}
          </span>
          {path && path.relations.length > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              {t('kinship.steps', { count: path.relations.length })}
            </span>
          )}
        </div>

        {/* Aligned From → To → Find row */}
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="min-w-[180px] flex-1 space-y-1">
            <label className="block text-[11px] font-medium text-muted-foreground">{t('kinship.from')}</label>
            <PersonSelect value={fromId} onChange={setFromId} placeholder={t('kinship.pickPlaceholder')} />
          </div>
          <div className="hidden h-9 items-center text-muted-foreground sm:flex">
            <ArrowRight className="h-4 w-4" />
          </div>
          <div className="min-w-[180px] flex-1 space-y-1">
            <label className="block text-[11px] font-medium text-muted-foreground">{t('kinship.to')}</label>
            <PersonSelect value={toId} onChange={setToId} placeholder={t('kinship.pickPlaceholder')} />
          </div>
          <Button size="sm" className="h-9 gap-1.5" onClick={find} disabled={!fromId || !toId || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
            {t('kinship.find')}
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative min-h-0 flex-1">
        {!searched && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Users className="h-10 w-10 opacity-40" />
            <p className="max-w-sm text-sm">{t('kinship.intro')}</p>
          </div>
        )}
        {searched && !loading && !path && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <X className="h-10 w-10 opacity-40" />
            <p className="text-sm">{t('kinship.none')}</p>
          </div>
        )}
        {path && layout && (
          <PanZoom fitKey={fitTick} contentWidth={layout.width} contentHeight={layout.height}>
            <div className="relative" style={{ width: layout.width, height: layout.height }}>
              <svg className="absolute inset-0 overflow-visible" width={layout.width} height={layout.height}>
                {layout.links.map((l) =>
                  l.rel === 'spouse' ? (
                    // A marriage hop: this is where the line stops being a BLOOD
                    // relation. Drawn rose + dashed so the branch is unmistakable.
                    <path
                      key={l.id}
                      d={l.d}
                      fill="none"
                      stroke="#f43f5e"
                      strokeOpacity={0.8}
                      strokeWidth={3}
                      strokeDasharray="6 5"
                    />
                  ) : (
                    <g key={l.id}>
                      <path d={l.d} fill="none" stroke="hsl(var(--primary))" strokeOpacity={0.22} strokeWidth={3} />
                      <path d={l.d} className="rel-flow" fill="none" stroke="hsl(var(--primary))" strokeWidth={3} />
                    </g>
                  )
                )}
              </svg>

              {/* The cards already carry the kinship term, so the only connector
                  label we keep marks the marriage branch (blood → by marriage). */}
              {layout.links.map((l) =>
                l.rel === 'spouse' ? (
                  <div
                    key={`lbl-${l.id}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-rose-400/60 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600 shadow-sm dark:bg-rose-950/50 dark:text-rose-300"
                    style={{ left: l.midX, top: l.midY }}
                    title={t('kinship.byMarriage')}
                  >
                    ⚭ {t('kinship.byMarriage')}
                  </div>
                ) : null
              )}

              {/* Person cards (pedigree look) + spouse line + expandable children. */}
              {(() => {
                const pathIds = new Set(path.nodes.map((n) => n.id))
                return path.nodes.map((node, i) => {
                  const isEnd = i === 0 || i === path.nodes.length - 1
                  const spouses = (ctx.spouses.get(node.id) ?? []).filter((id) => peopleById.has(id))
                  const off = (id: string): boolean => !pathIds.has(id) && peopleById.has(id)
                  const otherParents = (ctx.parents.get(node.id) ?? []).filter(off)
                  const otherChildren = (ctx.children.get(node.id) ?? []).filter(off)
                  const familyCount = otherParents.length + otherChildren.length
                  const isOpen = expanded.has(node.id)
                  // Whether this person is reached THROUGH a marriage (in-law) —
                  // used to colour their card frame (the term label was removed).
                  const rt = relationTerm(path.relations.slice(0, i), node.sex)
                  const chip = (cid: string): JSX.Element => {
                    const cp = peopleById.get(cid)!
                    const detail = personDetail(cp)
                    return (
                      <button
                        key={cid}
                        onClick={() => selectPerson(cid)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-accent"
                      >
                        <PersonAvatar personId={cid} name={fullName(cp)} sex={cp.sex} className="h-6 w-6 shrink-0 text-[9px]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs">{fullName(cp)}</span>
                          {detail && (
                            <span className="block truncate text-[10px] tabular-nums text-muted-foreground">{detail}</span>
                          )}
                        </span>
                      </button>
                    )
                  }
                  return (
                    <div
                      key={node.id}
                      className="absolute"
                      style={
                        {
                          left: layout.pos[i].x,
                          top: layout.pos[i].y,
                          width: CARD_W,
                          zIndex: isOpen ? 60 : undefined
                        } as CSSProperties
                      }
                    >
                      <div
                        className={cn('overflow-hidden rounded-xl border bg-card shadow-lg', isEnd && 'rel-endpoint')}
                        style={
                          rt.inLaw
                            ? { borderColor: '#f43f5e' } // by-marriage (non-blood) → rose frame
                            : isEnd
                              ? { borderColor: 'hsl(var(--primary))' }
                              : { borderColor: 'hsl(var(--border))' }
                        }
                      >
                        <button
                          onClick={() => selectPerson(node.id)}
                          className="group/row flex h-[52px] w-full items-center gap-2 px-2.5 text-left"
                        >
                          <PersonAvatar personId={node.id} name={pathName(node)} sex={node.sex} className="h-9 w-9 text-[11px]" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold leading-tight group-hover/row:text-primary">
                              {pathName(node)}
                            </span>
                            {node.lifespan && (
                              <span className="block text-[11px] leading-tight tabular-nums text-muted-foreground">
                                {node.lifespan}
                              </span>
                            )}
                          </span>
                        </button>
                        <div className="flex min-h-[40px] flex-col justify-center gap-0.5 border-t border-border/60 bg-secondary/30 px-2.5 py-1">
                          {spouses.length > 0 && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Heart className="h-3 w-3 shrink-0 text-pink-500" />
                              <span className="truncate">{spouses.map(nameOf).join(', ')}</span>
                            </div>
                          )}
                          {familyCount > 0 && (
                            <button
                              onClick={() => toggleExpand(node.id)}
                              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                            >
                              {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              {t('kinship.family', { count: familyCount })}
                            </button>
                          )}
                        </div>
                      </div>
                      {isOpen && familyCount > 0 && (
                        <div className="absolute left-0 top-full mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
                          <div
                            className="max-h-56 overflow-y-auto p-1"
                            onWheel={(e) => e.stopPropagation()}
                          >
                            {otherParents.length > 0 && (
                              <>
                                <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                                  {t('kinship.parents')}
                                </p>
                                {otherParents.map(chip)}
                              </>
                            )}
                            {otherChildren.length > 0 && (
                              <>
                                <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                                  {t('kinship.children')}
                                </p>
                                {otherChildren.map(chip)}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          </PanZoom>
        )}
      </div>
    </div>
  )
}
