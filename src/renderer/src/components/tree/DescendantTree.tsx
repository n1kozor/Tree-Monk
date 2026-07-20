import { memo, useMemo, useRef } from 'react'
import { hierarchy, tree as d3tree, type HierarchyPointNode } from 'd3-hierarchy'
import { Users } from 'lucide-react'
import type { TreeNodeDatum } from '@shared/types'
import { cn, formatName } from '@/lib/utils'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { useTreeLod } from './PanZoom'

const CARD_W = 210
const CARD_H = 60
const GAP_X = 26
const LEVEL_H = 128
const PAD = 48

const SEX_BAR: Record<string, string> = {
  F: 'bg-pink-400/80',
  M: 'bg-teal-400/80',
  U: 'bg-slate-400/60'
}

/** Orthogonal parent→child connector with rounded corners. */
function roundedElbow(px: number, py: number, cx: number, cy: number, r = 12): string {
  const midY = (py + cy) / 2
  if (Math.abs(cx - px) < r * 2) return `M ${px} ${py} L ${cx} ${cy}` // (nearly) straight down
  const dir = cx > px ? 1 : -1
  return [
    `M ${px} ${py}`,
    `V ${midY - r}`,
    `Q ${px} ${midY} ${px + r * dir} ${midY}`,
    `H ${cx - r * dir}`,
    `Q ${cx} ${midY} ${cx} ${midY + r}`,
    `V ${cy}`
  ].join(' ')
}

/**
 * Top-down DESCENDANT tree: the root person at the top, each generation of
 * children below. Laid out with d3-hierarchy but rendered as the same
 * avatar-carrying HTML cards the pedigree uses (photos, sex accents, hover
 * ring), with rounded connectors — pans/zooms inside the PanZoom canvas.
 */
function DescendantTreeImpl({
  data,
  onSelect
}: {
  data: TreeNodeDatum
  onSelect: (personId: string) => void
}): JSX.Element {
  const lod = useTreeLod()
  const downAt = useRef<{ x: number; y: number } | null>(null)

  const { nodes, links, width, height, minX, minY } = useMemo(() => {
    const root = hierarchy<TreeNodeDatum>(data, (d) => d.children)
    d3tree<TreeNodeDatum>().nodeSize([CARD_W + GAP_X, LEVEL_H])(root)
    const ns = root.descendants() as HierarchyPointNode<TreeNodeDatum>[]
    const ls = root.links() as {
      source: HierarchyPointNode<TreeNodeDatum>
      target: HierarchyPointNode<TreeNodeDatum>
    }[]
    const xs = ns.map((n) => n.x)
    const ys = ns.map((n) => n.y)
    const mnX = Math.min(...xs) - CARD_W / 2 - PAD
    const mxX = Math.max(...xs) + CARD_W / 2 + PAD
    const mnY = Math.min(...ys) - PAD
    const mxY = Math.max(...ys) + CARD_H + PAD
    return { nodes: ns, links: ls, width: mxX - mnX, height: mxY - mnY, minX: mnX, minY: mnY }
  }, [data])

  // Click-vs-pan guard: PanZoom drags can start on a card; only a still click opens.
  const pick = (personId: string | undefined, e: { clientX: number; clientY: number }): void => {
    const d = downAt.current
    if (!personId) return
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return
    onSelect(personId)
  }

  return (
    <div
      className="relative"
      style={{ width, height }}
      onMouseDown={(e) => (downAt.current = { x: e.clientX, y: e.clientY })}
    >
      {/* Connectors underneath the cards. */}
      <svg width={width} height={height} className="pointer-events-none absolute inset-0">
        {links.map((l, i) => (
          <path
            key={`l-${i}`}
            d={roundedElbow(
              l.source.x - minX,
              l.source.y - minY + CARD_H,
              l.target.x - minX,
              l.target.y - minY
            )}
            fill="none"
            className="stroke-border"
            strokeWidth={1.5}
          />
        ))}
      </svg>

      {nodes.map((n, i) => {
        const full = formatName(n.data.given, n.data.surname) || n.data.name || '—'
        const years = [n.data.birthYear, n.data.deathYear].filter(Boolean).join('–')
        const kids = n.data.children?.length ?? 0
        const isRoot = n.depth === 0
        return (
          <button
            key={n.data.personId ?? `n-${i}`}
            onClick={(e) => pick(n.data.personId, e)}
            title={years ? `${full} · ${years}` : full}
            style={{ left: n.x - minX - CARD_W / 2, top: n.y - minY, width: CARD_W, height: CARD_H }}
            className={cn(
              'group absolute flex items-center gap-2.5 overflow-hidden rounded-xl border bg-card pl-3 pr-2 text-left shadow-sm transition-all hover:z-10 hover:shadow-md hover:ring-2 hover:ring-primary/50',
              isRoot ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/25' : 'border-border/60'
            )}
          >
            {/* Sex accent bar. */}
            <span className={cn('absolute inset-y-0 left-0 w-1', SEX_BAR[n.data.sex ?? 'U'])} />
            <PersonAvatar
              personId={n.data.personId ?? ''}
              name={full}
              sex={n.data.sex}
              noPhoto={lod !== 'full'}
              className="h-9 w-9 shrink-0 text-[11px]"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight group-hover:text-primary">
                {full}
              </span>
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                {years || ' '}
              </span>
            </span>
            {/* Descendant count — quiet, only when the branch continues. */}
            {kids > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-secondary/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Users className="h-2.5 w-2.5" />
                {kids}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export const DescendantTree = memo(DescendantTreeImpl)
