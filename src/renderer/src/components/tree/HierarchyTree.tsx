import { useEffect, useMemo, useState } from 'react'
import { hierarchy, tree as d3tree, type HierarchyNode } from 'd3-hierarchy'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { formatName } from '@/lib/utils'
import { PanZoom } from './PanZoom'
import type { TreeNodeDatum } from '@shared/types'

// Hungarian shows surname first; fall back to the backend-combined name.
const nodeName = (d: TreeNodeDatum): string => formatName(d.given, d.surname) || d.name

const CARD_W = 188
const CARD_H = 70
const H_GAP = 236 // sibling spacing (card 188 → ~48px gap)
const V_GAP = 160 // generation spacing
const PAD = 90
const SPRING = { type: 'spring', stiffness: 240, damping: 30 } as const

const idOf = (d: TreeNodeDatum): string => d.personId ?? d.name

interface Positioned {
  id: string
  datum: TreeNodeDatum
  x: number
  y: number
  hasChildren: boolean
}
interface PositionedLink {
  id: string
  d: string
}

export function HierarchyTree({
  root,
  onSelect
}: {
  root: TreeNodeDatum
  onSelect: (personId: string) => void
}): JSX.Element {
  // Strict 1-level expansion: only nodes in `expanded` reveal their immediate
  // children. Default = root only, so opening a node loads just the next gen.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([idOf(root)]))
  useEffect(() => setExpanded(new Set([idOf(root)])), [root.personId])

  const { nodes, links, width, height } = useMemo(() => {
    const h: HierarchyNode<TreeNodeDatum> = hierarchy(root, (d) =>
      expanded.has(idOf(d)) ? d.children : undefined
    )
    d3tree<TreeNodeDatum>().nodeSize([H_GAP, V_GAP])(h)

    const all = h.descendants()
    const xs = all.map((n) => n.x!)
    const minX = Math.min(...xs)
    const offX = -minX + PAD

    const nodes: Positioned[] = all.map((n) => ({
      id: idOf(n.data),
      datum: n.data,
      x: n.x! + offX,
      y: n.y! + PAD,
      hasChildren: !!n.data.children?.length
    }))

    const links: PositionedLink[] = h.links().map((l) => {
      const px = l.source.x! + offX
      const py = l.source.y! + PAD + CARD_H / 2
      const cx = l.target.x! + offX
      const cy = l.target.y! + PAD - CARD_H / 2
      const mid = (py + cy) / 2
      return {
        id: `${idOf(l.source.data)}->${idOf(l.target.data)}`,
        d: `M ${px},${py} C ${px},${mid} ${cx},${mid} ${cx},${cy}`
      }
    })

    const maxX = Math.max(...xs)
    const maxY = Math.max(...all.map((n) => n.y!))
    return {
      nodes,
      links,
      width: maxX - minX + PAD * 2,
      height: maxY + PAD * 2
    }
  }, [root, expanded])

  const toggle = (datum: TreeNodeDatum): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(idOf(datum))) {
        const sub = new Set<string>()
        const collect = (d: TreeNodeDatum): void => {
          sub.add(idOf(d))
          d.children?.forEach(collect)
        }
        collect(datum)
        sub.forEach((id) => next.delete(id))
      } else {
        next.add(idOf(datum))
      }
      return next
    })

  return (
    <PanZoom>
      <div className="flex h-full w-full justify-center pt-6">
        <div className="relative" style={{ width, height }}>
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
                  stroke="hsl(var(--border))"
                  strokeWidth={2}
                />
              ))}
            </AnimatePresence>
          </svg>

          <AnimatePresence>
            {nodes.map((n) => {
              const open = expanded.has(n.id)
              const years = n.datum.attributes?.years as string | undefined
              const docs = n.datum.attributes?.docs as number | undefined
              const accent =
                n.datum.sex === 'F'
                  ? 'border-l-pink-400'
                  : n.datum.sex === 'M'
                    ? 'border-l-teal-400'
                    : 'border-l-zinc-400'
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1, left: n.x - CARD_W / 2, top: n.y - CARD_H / 2 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={SPRING}
                  className="absolute"
                  style={{ width: CARD_W, height: CARD_H }}
                >
                  <div
                    onClick={() => n.datum.personId && onSelect(n.datum.personId)}
                    className={cnCard(accent)}
                  >
                    <PersonAvatar
                      personId={n.datum.personId}
                      name={nodeName(n.datum)}
                      sex={n.datum.sex}
                      className="h-9 w-9 text-[11px]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold leading-tight">{nodeName(n.datum)}</p>
                      {years && <p className="text-[11px] text-muted-foreground">{years}</p>}
                    </div>
                    {docs ? (
                      <span className="flex items-center gap-0.5 self-start rounded-full bg-primary/15 px-1 text-[9px] font-medium text-primary">
                        <FileText className="h-2 w-2" />
                        {docs}
                      </span>
                    ) : null}
                  </div>

                  {n.hasChildren && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(n.datum)
                      }}
                      className="absolute -bottom-3 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow hover:text-primary"
                    >
                      {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </PanZoom>
  )
}

function cnCard(accent: string): string {
  return `flex h-full items-center gap-2 rounded-xl border border-l-4 ${accent} border-border bg-card px-2.5 py-2 shadow-lg transition-colors hover:border-primary/50`
}
