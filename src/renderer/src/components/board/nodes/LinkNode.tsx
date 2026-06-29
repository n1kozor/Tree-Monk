import { memo, useEffect, useState } from 'react'
import { type NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import { ExternalLink, Globe, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBoardStore, type BoardNodeData } from '../useBoardStore'
import { rotationFor } from '../nodeUtil'
import { NodeHandles } from './NodeHandles'
import { ThreadPins } from './ThreadPins'

const SPRING = { type: 'spring', stiffness: 520, damping: 32 } as const

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** External web link / reference pinned to the board. */
function LinkNodeImpl({ id, data, selected, dragging }: NodeProps): JSX.Element {
  const d = data as BoardNodeData
  const cork = useBoardStore((s) => s.boardMode === 'corkboard')
  const update = useBoardStore((s) => s.updateNodeData)
  const persist = useBoardStore((s) => s.persistNode)
  const editReq = useBoardStore((s) => s.editingNodeId === id)
  const requestEdit = useBoardStore((s) => s.requestEdit)
  const [editing, setEditing] = useState(false)
  const rotate = cork ? rotationFor(id) : 0

  const url = d.content ?? ''
  const title = d.label || (url ? hostOf(url) : 'Link')

  useEffect(() => {
    if (editReq) {
      setEditing(true)
      requestEdit(null)
    }
  }, [editReq, requestEdit])

  // Newly added links open straight into edit mode so the URL can be typed.
  useEffect(() => {
    if (!url && !d.label) setEditing(true)
  }, [])

  const open = (): void => {
    if (url) void window.api.app.openExternal(url)
  }

  return (
    <div className="relative" style={{ width: d.width ?? 240, transform: rotate ? `rotate(${rotate}deg)` : undefined }}>
      <NodeHandles />
      {cork && <ThreadPins nodeId={id} />}
      <motion.div
        animate={{ scale: dragging ? 1.04 : 1 }}
        transition={SPRING}
        onDoubleClick={() => setEditing(true)}
        className={cn(
          'w-full',
          cork
            ? 'cork-paper rounded-[2px] text-zinc-900'
            : 'overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm hover:border-primary/40',
          selected && 'ring-2 ring-primary'
        )}
      >
        {editing ? (
          <div className="nodrag space-y-1.5 p-2.5">
            <input
              autoFocus
              value={d.label ?? ''}
              placeholder="Title"
              onChange={(e) => update(id, { label: e.target.value })}
              onBlur={() => persist(id)}
              className={cn(
                'w-full rounded px-1.5 py-1 text-sm outline-none',
                cork ? 'bg-black/10 placeholder:text-zinc-500' : 'bg-foreground/10 placeholder:text-muted-foreground'
              )}
            />
            <input
              value={url}
              placeholder="https://…"
              onChange={(e) => update(id, { content: e.target.value })}
              onBlur={() => persist(id)}
              onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
              className={cn(
                'w-full rounded px-1.5 py-1 text-xs outline-none',
                cork ? 'bg-black/10 placeholder:text-zinc-500' : 'bg-foreground/10 placeholder:text-muted-foreground'
              )}
            />
            <div className="flex justify-end">
              <button onClick={() => setEditing(false)} className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                OK
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-500">
              <Globe className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{title}</p>
              {url && <p className="truncate text-[11px] text-muted-foreground">{url}</p>}
            </div>
            {url && (
              <button
                onClick={open}
                title="Open link"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
            {!url && <Link2 className="h-4 w-4 text-muted-foreground/50" />}
          </div>
        )}
      </motion.div>
    </div>
  )
}

export const LinkNode = memo(LinkNodeImpl)
