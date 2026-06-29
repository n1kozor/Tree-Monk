import { memo, useEffect, useState } from 'react'
import { type NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import { HelpCircle, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBoardStore, type BoardNodeData } from '../useBoardStore'
import { rotationFor } from '../nodeUtil'
import { NodeHandles } from './NodeHandles'
import { ThreadPins } from './ThreadPins'

/** Unknown-person placeholder — a shadowy silhouette with a "?". */
function MysteryNodeImpl({ id, data, selected, dragging }: NodeProps): JSX.Element {
  const d = data as BoardNodeData
  const cork = useBoardStore((s) => s.boardMode === 'corkboard')
  const update = useBoardStore((s) => s.updateNodeData)
  const persist = useBoardStore((s) => s.persistNode)
  const editReq = useBoardStore((s) => s.editingNodeId === id)
  const requestEdit = useBoardStore((s) => s.requestEdit)
  const [editing, setEditing] = useState(false)
  const rotate = cork ? rotationFor(id) : 0

  useEffect(() => {
    if (editReq) {
      setEditing(true)
      requestEdit(null)
    }
  }, [editReq, requestEdit])

  return (
    <div className="relative" style={{ width: d.width ?? 188, transform: rotate ? `rotate(${rotate}deg)` : undefined }}>
      <NodeHandles />
      {cork && <ThreadPins nodeId={id} />}
      <motion.div
        animate={{ scale: dragging ? 1.05 : 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
        onDoubleClick={() => setEditing(true)}
        className={cn('tm-mystery flex w-full flex-col items-center gap-2 px-3 py-3.5', selected && 'ring-2 ring-primary')}
      >
        <div className="tm-mystery-avatar">
          <User className="h-9 w-9" />
          <HelpCircle className="tm-mystery-q" />
        </div>
        {editing ? (
          <input
            autoFocus
            className="nodrag w-full rounded bg-black/10 px-1.5 py-0.5 text-center text-sm text-zinc-900 outline-none"
            defaultValue={d.label ?? ''}
            onBlur={(e) => {
              update(id, { label: e.target.value })
              persist(id)
              setEditing(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <span className="text-center text-sm font-semibold uppercase tracking-wider text-zinc-700">
            {d.label || 'Unknown'}
          </span>
        )}
      </motion.div>
    </div>
  )
}

export const MysteryNode = memo(MysteryNodeImpl)
