import { memo, useState } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mediaThumb } from '@/lib/mediaUrl'
import { useBoardStore, type BoardNodeData } from '../useBoardStore'
import { rotationFor } from '../nodeUtil'
import { NodeHandles } from './NodeHandles'
import { ThreadPins } from './ThreadPins'

/** Image evidence — a physical photo / torn snippet pinned to the board. */
function EvidenceNodeImpl({ id, data, selected, dragging }: NodeProps): JSX.Element {
  const d = data as BoardNodeData
  const cork = useBoardStore((s) => s.boardMode === 'corkboard')
  const update = useBoardStore((s) => s.updateNodeData)
  const persist = useBoardStore((s) => s.persistNode)
  const [broken, setBroken] = useState(false)
  const rotate = cork ? rotationFor(id) : 0
  const width = d.width ?? 220
  // Served natively by the tmedia:// protocol (no base64 IPC).
  const url = d.refId && !broken ? mediaThumb(d.refId, 1024) : null

  return (
    <div className="relative" style={{ width, transform: rotate ? `rotate(${rotate}deg)` : undefined }}>
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        maxWidth={680}
        keepAspectRatio
        lineClassName="!border-primary/70"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border-2 !border-primary !bg-background"
        onResize={(_, p) => update(id, { width: Math.round(p.width) })}
        onResizeEnd={() => persist(id)}
      />
      <NodeHandles />
      {cork && <ThreadPins nodeId={id} />}
      <motion.div
        animate={{ scale: dragging ? 1.04 : 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
        onDoubleClick={() => d.refId && window.api.documents.open(d.refId)}
        title="Double-click to open"
        className={cn(
          cork ? 'tm-evidence' : 'overflow-hidden rounded-xl border border-border bg-card shadow-md',
          selected && 'ring-2 ring-primary'
        )}
      >
        <div className={cork ? 'tm-evidence-frame' : 'bg-muted leading-[0]'}>
          {url ? (
            <img
              src={url}
              alt={d.label ?? ''}
              className="block w-full select-none object-cover"
              draggable={false}
              onError={() => setBroken(true)}
            />
          ) : (
            <div className="flex h-32 w-full items-center justify-center bg-stone-200 text-stone-500">
              <ImageOff className="h-7 w-7" />
            </div>
          )}
        </div>
        {d.label && (
          <div
            className={
              cork
                ? 'tm-evidence-caption'
                : 'border-t border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground'
            }
          >
            {d.label}
          </div>
        )}
      </motion.div>
    </div>
  )
}

export const EvidenceNode = memo(EvidenceNodeImpl)
