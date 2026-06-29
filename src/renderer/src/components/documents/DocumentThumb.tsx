import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  File,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Link2,
  Loader2,
  Trash2,
  Users
} from 'lucide-react'
import type { DocumentRecord } from '@shared/types'
import { mediaThumb } from '@/lib/mediaUrl'

const ext = (s: string): string => {
  const m = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(s.trim())
  return m ? m[1].toLowerCase() : ''
}

const isImageDoc = (doc: DocumentRecord): boolean =>
  doc.kind === 'photo' ||
  (doc.mimeType ?? '').startsWith('image/') ||
  ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'avif', 'svg'].includes(ext(doc.filePath))

const isLinkDoc = (doc: DocumentRecord): boolean =>
  /^https?:\/\//i.test(doc.filePath) || doc.mimeType === 'text/uri-list'

/** Picks a file-type icon + short badge for documents that have no image preview. */
function fileGlyph(doc: DocumentRecord): { Icon: typeof File; badge: string } {
  const e = ext(doc.filePath)
  const mime = doc.mimeType ?? ''
  if (e === 'pdf' || mime === 'application/pdf') return { Icon: FileText, badge: 'PDF' }
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(e)) return { Icon: FileText, badge: e.toUpperCase() }
  if (['xls', 'xlsx', 'csv', 'ods'].includes(e)) return { Icon: FileSpreadsheet, badge: e.toUpperCase() }
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(e)) return { Icon: FileArchive, badge: e.toUpperCase() }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(e))
    return { Icon: FileAudio, badge: e.toUpperCase() || 'AUDIO' }
  if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(e))
    return { Icon: FileVideo, badge: e.toUpperCase() || 'VIDEO' }
  return { Icon: File, badge: e ? e.toUpperCase() : 'FILE' }
}

/** Lazily loads and renders a document thumbnail from the main process. */
export function DocumentThumb({
  doc,
  onClick,
  onDelete,
  attachedTo
}: {
  doc: DocumentRecord
  onClick?: () => void
  onDelete?: () => void
  /** Names this document is attached to — when provided, shown as a caption. */
  attachedTo?: string[]
}): JSX.Element {
  const { t } = useTranslation()
  const [broken, setBroken] = useState(false)
  const [loading, setLoading] = useState(true)
  const remote = /^https?:\/\//i.test(doc.filePath)
  const image = isImageDoc(doc)
  const link = !image && isLinkDoc(doc)
  // Show an image preview for known images AND remote links — FamilySearch/GEDCOM
  // memories are usually images stored as extension-less URLs. The tmedia://
  // protocol proxies + thumbnails the URL; a failed load falls back to the glyph.
  const url = (image || remote) && !broken ? mediaThumb(doc.id, 256) : null

  const { Icon, badge } = fileGlyph(doc)

  return (
    <div className="group relative block w-full overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/50">
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title="Delete"
          className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <button onClick={onClick} className="block w-full text-left">
        {/* Uniform-size preview: every card shares the same 4:3 image area. */}
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-secondary/40">
          {url ? (
            <>
              <img
                src={url}
                alt={doc.title}
                // Native lazy loading + async decode: off-screen thumbnails are
                // NOT fetched/decoded, so a grid of thousands of photos no longer
                // floods the main process with simultaneous resize requests.
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                onLoad={() => setLoading(false)}
                onError={() => {
                  setBroken(true)
                  setLoading(false)
                }}
              />
              {loading && (
                <span className="absolute inset-0 flex items-center justify-center bg-secondary/40">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </span>
              )}
            </>
          ) : link ? (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <Link2 className="h-8 w-8" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">{t('documents.link')}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <Icon className="h-9 w-9" />
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">
                {badge}
              </span>
            </div>
          )}
        </div>
        <div className="px-2.5 py-2">
          <p className="truncate text-xs font-medium">{doc.title || t('common.untitled')}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] capitalize text-muted-foreground">
            <span>{t(`documents.kinds.${doc.kind}`)}</span>
            {doc.date && <span>· {doc.date}</span>}
          </p>
          {attachedTo && (
            <p className="mt-1 flex items-start gap-1 text-[10px] text-muted-foreground">
              <Users className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-2">
                {attachedTo.length ? attachedTo.join(', ') : t('documents.unattached')}
              </span>
            </p>
          )}
        </div>
      </button>
    </div>
  )
}
