import { memo, useMemo, useRef, useState } from 'react'
import { hierarchy, tree as d3tree, type HierarchyPointNode } from 'd3-hierarchy'
import type { TreeNodeDatum } from '@shared/types'
import { formatName } from '@/lib/utils'

const CARD_W = 168
const CARD_H = 50
const GAP_X = 28
const LEVEL_H = 112

interface Hover {
  label: string
  sub: string
  mx: number
  my: number
}

const tint = (sex?: string): string =>
  sex === 'F' ? '#f472b6' : sex === 'M' ? '#2dd4bf' : '#94a3b8'

/** Orthogonal elbow from a parent's bottom edge to a child's top edge. */
function elbow(px: number, py: number, cx: number, cy: number): string {
  const midY = (py + cy) / 2
  return `M ${px} ${py} V ${midY} H ${cx} V ${cy}`
}

/**
 * A dedicated top-down DESCENDANT tree: the root person at the top, each
 * generation of children below, laid out with d3-hierarchy. Click a card to open
 * that person. Pans/zooms inside the surrounding PanZoom canvas.
 */
function DescendantTreeImpl({
  data,
  onSelect
}: {
  data: TreeNodeDatum
  onSelect: (personId: string) => void
}): JSX.Element {
  const [hover, setHover] = useState<Hover | null>(null)
  const downAt = useRef<{ x: number; y: number } | null>(null)
  const pick = (personId: string | undefined, e: { clientX: number; clientY: number }): void => {
    const d = downAt.current
    if (!personId) return
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return
    onSelect(personId)
  }

  const { nodes, links, vb } = useMemo(() => {
    const root = hierarchy<TreeNodeDatum>(data, (d) => d.children)
    d3tree<TreeNodeDatum>().nodeSize([CARD_W + GAP_X, LEVEL_H])(root)
    const ns = root.descendants() as HierarchyPointNode<TreeNodeDatum>[]
    const ls = root.links() as { source: HierarchyPointNode<TreeNodeDatum>; target: HierarchyPointNode<TreeNodeDatum> }[]
    const xs = ns.map((n) => n.x)
    const ys = ns.map((n) => n.y)
    const pad = 40
    const minX = Math.min(...xs) - CARD_W / 2 - pad
    const maxX = Math.max(...xs) + CARD_W / 2 + pad
    const minY = Math.min(...ys) - CARD_H / 2 - pad
    const maxY = Math.max(...ys) + CARD_H / 2 + pad
    return { nodes: ns, links: ls, vb: `${minX} ${minY} ${maxX - minX} ${maxY - minY}` }
  }, [data])

  return (
    <div className="relative h-full w-full">
      <svg
        width="100%"
        height="100%"
        viewBox={vb}
        preserveAspectRatio="xMidYMid meet"
        className="select-none"
        onMouseDown={(e) => (downAt.current = { x: e.clientX, y: e.clientY })}
      >
        {links.map((l, i) => (
          <path
            key={`l-${i}`}
            d={elbow(l.source.x, l.source.y + CARD_H / 2, l.target.x, l.target.y - CARD_H / 2)}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeOpacity={0.55}
            strokeWidth={2}
          />
        ))}
        {nodes.map((n, i) => {
          const full = formatName(n.data.given, n.data.surname) || n.data.name
          const years = [n.data.birthYear, n.data.deathYear].filter(Boolean).join('–')
          return (
            <g
              key={`n-${i}`}
              transform={`translate(${n.x - CARD_W / 2}, ${n.y - CARD_H / 2})`}
              className="cursor-pointer"
              onClick={(e) => pick(n.data.personId, e)}
              onMouseMove={(e) => setHover({ label: full, sub: years, mx: e.clientX, my: e.clientY })}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                width={CARD_W}
                height={CARD_H}
                rx={10}
                className="fill-card stroke-border transition-[stroke] hover:stroke-primary"
                strokeWidth={1.5}
              />
              <rect width={4} height={CARD_H} rx={2} fill={tint(n.data.sex)} />
              <text x={14} y={20} className="pointer-events-none fill-foreground" fontSize={13} fontWeight={600}>
                {full.length > 20 ? full.slice(0, 19) + '…' : full}
              </text>
              {years && (
                <text x={14} y={37} className="pointer-events-none fill-muted-foreground" fontSize={11}>
                  {years}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-xl"
          style={{ left: hover.mx + 14, top: hover.my + 14 }}
        >
          <p className="text-xs font-semibold">{hover.label}</p>
          {hover.sub && <p className="text-[11px] text-muted-foreground">{hover.sub}</p>}
        </div>
      )}
    </div>
  )
}

export const DescendantTree = memo(DescendantTreeImpl)
