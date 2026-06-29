import { memo, useEffect, useState } from 'react'
import { type NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBoardStore, type BoardNodeData } from '../useBoardStore'
import { rotationFor } from '../nodeUtil'
import { NodeHandles } from './NodeHandles'
import { ThreadPins } from './ThreadPins'

const SPRING = { type: 'spring', stiffness: 520, damping: 32 } as const

function NoteNodeImpl({ id, data, selected, dragging }: NodeProps): JSX.Element {
  const { t } = useTranslation()
  const d = data as BoardNodeData
  const update = useBoardStore((s) => s.updateNodeData)
  const persist = useBoardStore((s) => s.persistNode)
  const cork = useBoardStore((s) => s.boardMode === 'corkboard')
  const editReq = useBoardStore((s) => s.editingNodeId === id)
  const requestEdit = useBoardStore((s) => s.requestEdit)
  const [editing, setEditing] = useState(false)
  // Post-it tilt ONLY on the corkboard. The "Letisztult" (flat) board keeps notes
  // perfectly straight — a clean card, not a pinned paper scrap.
  const rotate = cork ? rotationFor(id) * 0.6 : 0
  const bg = d.color ?? '#fde68a'

  useEffect(() => {
    if (editReq) {
      setEditing(true)
      requestEdit(null)
    }
  }, [editReq, requestEdit])

  return (
    <div
      className="relative"
      style={{ width: d.width ?? 208, transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    >
      <NodeHandles />
      {cork && <ThreadPins nodeId={id} />}
      <motion.div
        style={cork ? { backgroundColor: bg } : undefined}
        animate={{ scale: dragging ? 1.05 : 1 }}
        transition={SPRING}
        onDoubleClick={() => setEditing(true)}
        className={cn(
          'relative w-full',
          cork
            ? 'tm-postit paper-note text-zinc-900'
            : 'overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-md',
          selected && 'ring-2 ring-primary'
        )}
      >
        {/* Flat: a slim colour accent keeps the note's colour code without the paper. */}
        {!cork && <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: bg }} />}
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 text-xs font-semibold',
            cork ? 'border-b border-black/10 text-zinc-700/80' : 'border-b border-border/60 pl-3.5 text-muted-foreground'
          )}
        >
          <StickyNote className="h-3.5 w-3.5" />
          {t('board.addNote')}
        </div>
        {editing ? (
          <textarea
            autoFocus
            className={cn(
              'nodrag h-28 w-full resize-none bg-transparent p-2 text-sm outline-none',
              cork ? 'text-zinc-900 placeholder:text-zinc-500' : 'pl-3.5 text-foreground placeholder:text-muted-foreground'
            )}
            defaultValue={d.content ?? ''}
            placeholder={t('board.noteePlaceholder')}
            onBlur={(e) => {
              update(id, { content: e.target.value })
              persist(id)
              setEditing(false)
            }}
          />
        ) : (
          <p className={cn('min-h-[5rem] whitespace-pre-wrap p-2 text-sm font-medium', !cork && 'pl-3.5')}>
            {d.content || <span className="opacity-50">{t('board.noteePlaceholder')}</span>}
          </p>
        )}
      </motion.div>
    </div>
  )
}

export const NoteNode = memo(NoteNodeImpl)
