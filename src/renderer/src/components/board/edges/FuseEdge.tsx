import { memo, useState } from 'react'
import { EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

/** Flat-mode edge with certainty styling, label and spotlight dimming. */
function FuseEdgeImpl({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  selected,
  label,
  data
}: EdgeProps): JSX.Element {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const color = (data?.color as string) || 'hsl(var(--primary))'
  const certainty = (data?.certainty as string) || 'verified'
  const dash = certainty === 'theory' ? '2 8' : certainty === 'suspicion' ? '10 8' : undefined
  const opacity = data?.dimmed ? 0.1 : certainty === 'theory' ? 0.6 : 1
  const [hot, setHot] = useState(false)

  return (
    <g style={{ opacity, transition: 'opacity .2s' }}>
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={26}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onMouseEnter={() => setHot(true)}
        onMouseLeave={() => setHot(false)}
      />
      <path
        className={hot ? 'tm-rope-hot' : undefined}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 3 : 2.2}
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

export const FuseEdge = memo(FuseEdgeImpl)
