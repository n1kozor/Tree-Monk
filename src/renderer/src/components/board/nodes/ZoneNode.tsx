import { memo, useEffect, useState } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBoardStore, type BoardNodeData } from '../useBoardStore'

const ZONE_COLORS = ['#6366f1', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#0ea5e9']

/** Investigation Zone — a translucent colored box that encloses & moves nodes. */
function ZoneNodeImpl({ id, data, selected }: NodeProps): JSX.Element {
  const d = data as BoardNodeData
  const update = useBoardStore((s) => s.updateNodeData)
  const persist = useBoardStore((s) => s.persistNode)
  const editReq = useBoardStore((s) => s.editingNodeId === id)
  const requestEdit = useBoardStore((s) => s.requestEdit)
  const [editing, setEditing] = useState(false)
  const color = d.color ?? '#6366f1'

  useEffect(() => {
    if (editReq) {
      setEditing(true)
      requestEdit(null)
    }
  }, [editReq, requestEdit])

  return (
    <div className={cn('relative h-full w-full', selected && 'rounded ring-2 ring-offset-2 ring-offset-transparent ring-primary/60')}>
      {/* Aged paper sheet (no frame) — a separate layer behind the label/handles
          carrying the paper texture, soft shadow and a faint wash of the zone colour. */}
      <div className="tm-zone-paper" style={{ ['--zone' as string]: color }} />
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={120}
        lineClassName="!border-transparent"
        handleClassName="!h-3 !w-3 !rounded-sm !border-2 !bg-background"
        handleStyle={{ borderColor: color }}
        onResizeEnd={(_, p) => {
          update(id, { width: Math.round(p.width), height: Math.round(p.height) })
          persist(id)
        }}
      />
      {/* Header — grab here to drag the whole zone (+ its contents). */}
      <div
        className="absolute -top-3 left-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-md"
        style={{ background: color }}
        onDoubleClick={() => setEditing(true)}
      >
        <Layers className="h-3 w-3" />
        {editing ? (
          <input
            autoFocus
            className="nodrag w-32 bg-transparent text-white outline-none placeholder:text-white/60"
            defaultValue={d.label ?? ''}
            onBlur={(e) => {
              update(id, { label: e.target.value })
              persist(id)
              setEditing(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <span>{d.label || 'Zone'}</span>
        )}
      </div>

      {/* Color swatches (visible when selected). */}
      {selected && (
        <div className="nodrag absolute -bottom-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-border bg-popover px-2 py-1 shadow-lg">
          {ZONE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                update(id, { color: c })
                persist(id)
              }}
              className="h-4 w-4 rounded-full border border-black/20"
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const ZoneNode = memo(ZoneNodeImpl)
