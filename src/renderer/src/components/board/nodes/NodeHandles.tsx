import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

/**
 * Eight uniquely-id'd connection handles (4 sides + 4 corners) for precise
 * string routing. Rendered on the node's un-rotated root so geometry stays
 * exact. Visibility is driven by CSS (.tm-handle) — hidden by default, shown
 * for the selected node or while a connection is being dragged.
 */
const POINTS: { id: string; position: Position; style?: React.CSSProperties }[] = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
  { id: 'top-left', position: Position.Top, style: { left: 0 } },
  { id: 'top-right', position: Position.Top, style: { left: '100%' } },
  { id: 'bottom-left', position: Position.Bottom, style: { left: 0 } },
  { id: 'bottom-right', position: Position.Bottom, style: { left: '100%' } }
]

function NodeHandlesImpl(): JSX.Element {
  return (
    <>
      {POINTS.map((p) => (
        <Handle
          key={p.id}
          id={p.id}
          type="source"
          position={p.position}
          className="tm-handle"
          style={p.style}
        />
      ))}
    </>
  )
}

export const NodeHandles = memo(NodeHandlesImpl)
