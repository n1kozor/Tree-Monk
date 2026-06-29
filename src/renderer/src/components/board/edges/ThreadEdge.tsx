import { memo, useState } from 'react'
import { EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'
import { jitterFor } from '../nodeUtil'

/**
 * Drooping "string" edge for the Detective Corkboard. Certainty drives the
 * stroke: solid = verified, dashed = suspicion, dotted/faded = theory. The ends
 * are nudged to the pushpin centres (same hand-jitter the pins use) so the
 * string is tied exactly where its pin sits.
 */
function ThreadEdgeImpl({
  source,
  target,
  sourceHandleId,
  targetHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
  label,
  data
}: EdgeProps): JSX.Element {
  const sj = jitterFor(`${source}:${sourceHandleId || 'top'}`)
  const tj = jitterFor(`${target}:${targetHandleId || 'top'}`)
  const sx = sourceX + sj.dx
  const sy = sourceY + sj.dy
  const tx = targetX + tj.dx
  const ty = targetY + tj.dy

  const dist = Math.hypot(tx - sx, ty - sy)
  const sag = Math.min(140, 24 + dist * 0.16)
  const midX = (sx + tx) / 2
  const midY = (sy + ty) / 2 + sag
  const path = `M ${sx},${sy} Q ${midX},${midY} ${tx},${ty}`
  const color = (data?.color as string) || 'hsl(var(--thread))'
  const certainty = (data?.certainty as string) || 'verified'
  const dash = certainty === 'theory' ? '2 9' : certainty === 'suspicion' ? '11 9' : undefined
  const opacity = data?.dimmed ? 0.1 : certainty === 'theory' ? 0.6 : 1
  const labelX = midX
  const labelY = (sy + ty) / 2 + sag / 2
  const [hot, setHot] = useState(false)

  return (
    <g style={{ filter: 'url(#thread-shadow)', opacity, transition: 'opacity .2s' }}>
      {/* Wide invisible hit area — easy to grab and left-click. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={28}
        strokeLinecap="round"
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onMouseEnter={() => setHot(true)}
        onMouseLeave={() => setHot(false)}
      />
      <path
        className={hot ? 'tm-rope-hot' : undefined}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 3.6 : 2.6}
        strokeLinecap="round"
        strokeDasharray={dash}
        style={{ pointerEvents: 'none' }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="tm-edge-label nodrag nopan"
            style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, opacity }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}

export const ThreadEdge = memo(ThreadEdgeImpl)
