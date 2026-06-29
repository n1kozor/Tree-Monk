import { memo, useState } from 'react'
import { type NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { mediaThumb } from '@/lib/mediaUrl'
import { useBoardStore, type BoardNodeData } from '../useBoardStore'
import { rotationFor } from '../nodeUtil'
import { NodeHandles } from './NodeHandles'
import { ThreadPins } from './ThreadPins'

const SPRING = { type: 'spring', stiffness: 520, damping: 32 } as const

function fileMeta(ext: string, mime: string): { Icon: LucideIcon; color: string; label: string } {
  const e = ext.toLowerCase()
  if (mime.startsWith('audio/')) return { Icon: FileAudio, color: '#a855f7', label: e || 'AUDIO' }
  if (mime.startsWith('video/')) return { Icon: FileVideo, color: '#ec4899', label: e || 'VIDEO' }
  if (['pdf'].includes(e)) return { Icon: FileText, color: '#ef4444', label: 'PDF' }
  if (['doc', 'docx', 'rtf', 'odt'].includes(e)) return { Icon: FileText, color: '#3b82f6', label: e }
  if (['xls', 'xlsx', 'csv', 'ods'].includes(e))
    return { Icon: FileSpreadsheet, color: '#22c55e', label: e }
  if (['ppt', 'pptx'].includes(e)) return { Icon: FileText, color: '#f97316', label: e }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e))
    return { Icon: FileArchive, color: '#eab308', label: e }
  if (['txt', 'md'].includes(e)) return { Icon: FileText, color: '#64748b', label: e }
  return { Icon: File, color: '#94a3b8', label: e || 'FILE' }
}

function DocumentNodeImpl({ id, data, selected, dragging }: NodeProps): JSX.Element {
  const d = data as BoardNodeData
  const cork = useBoardStore((s) => s.boardMode === 'corkboard')
  const [broken, setBroken] = useState(false)
  const rotate = cork ? rotationFor(id) : 0
  const isImage = (d.mime ?? '').startsWith('image/')
  // Served natively by the tmedia:// protocol (no base64 IPC).
  // A capped thumbnail (not the full-resolution original) so a board full of
  // photos stays smooth; the full image is only loaded in the viewer.
  const url = isImage && d.refId && !broken ? mediaThumb(d.refId, 1024) : null

  const pin = cork && <ThreadPins nodeId={id} />

  // ---- Image → Polaroid (no filename) ----
  if (isImage) {
    return (
      <div
        className="relative"
        style={{ width: d.width ?? 176, transform: rotate ? `rotate(${rotate}deg)` : undefined }}
      >
        <NodeHandles />
        {pin}
        <motion.div
          animate={{ scale: dragging ? 1.05 : 1 }}
          transition={SPRING}
          onDoubleClick={() => d.refId && window.api.documents.open(d.refId)}
          title="Double-click to open"
          className={cn(
            'w-full',
            cork
              ? 'bg-white p-2 pb-8 shadow-[0_16px_30px_-10px_rgba(0,0,0,0.65)]'
              : 'overflow-hidden rounded-lg border border-border bg-card shadow-sm hover:border-primary/40',
            selected && 'ring-2 ring-primary'
          )}
        >
          <div className={cn('flex items-center justify-center overflow-hidden', cork ? 'h-40 w-full bg-stone-200' : 'h-36 w-full bg-secondary/60')}>
            {url ? (
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
                onError={() => setBroken(true)}
              />
            ) : (
              <FileImage className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
        </motion.div>
      </div>
    )
  }

  // ---- Any other file → document node with file-type icon ----
  const { Icon, color, label } = fileMeta(d.ext ?? '', d.mime ?? '')
  return (
    <div
      className="relative"
      style={{ width: d.width ?? 176, transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    >
      <NodeHandles />
      {pin}
      <motion.div
        animate={{ scale: dragging ? 1.05 : 1 }}
        transition={SPRING}
        onDoubleClick={() => d.refId && window.api.documents.open(d.refId)}
        title="Double-click to open"
        className={cn(
          'flex w-full flex-col items-center gap-2 px-3 py-4',
          cork
            ? 'cork-paper rounded-[2px]'
            : 'rounded-lg border border-border bg-card shadow-sm hover:border-primary/40',
          selected && 'ring-2 ring-primary'
        )}
      >
        <div className="relative flex h-16 w-14 items-center justify-center">
          {/* sheet-of-paper backdrop with a folded corner */}
          <div
            className="absolute inset-0 rounded-md bg-white shadow-sm"
            style={{ clipPath: 'polygon(0 0, 72% 0, 100% 22%, 100% 100%, 0 100%)' }}
          />
          <Icon className="relative h-7 w-7" style={{ color }} strokeWidth={1.75} />
        </div>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: color }}
        >
          {label}
        </span>
        <span className="w-full truncate text-center text-xs font-medium text-card-foreground" title={d.label ?? ''}>
          {d.label || 'File'}
        </span>
      </motion.div>
    </div>
  )
}

export const DocumentNode = memo(DocumentNodeImpl)
