import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  File,
  FileText,
  FileType,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  Search,
  Upload,
  Users,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfirmDialog, toastUndo } from '@/components/common/ConfirmDialog'
import { useAppStore } from '@/store/useAppStore'
import { cn, fullName } from '@/lib/utils'
import { canView, fileCategory } from '@/lib/docCategory'
import { DocumentThumb } from './DocumentThumb'
import { DocumentViewerDialog } from './DocumentViewerDialog'
import type { DocumentRecord } from '@shared/types'

type TypeFilter = 'all' | 'image' | 'pdf' | 'doc' | 'media' | 'link' | 'other'
type AttachFilter = 'all' | 'attached' | 'unattached'
type SortKey = 'newest' | 'oldest' | 'title' | 'date'

const TYPE_FILTERS: { id: TypeFilter; icon: typeof File; labelKey: string }[] = [
  { id: 'all', icon: LayoutGrid, labelKey: 'documents.typeAll' },
  { id: 'image', icon: ImageIcon, labelKey: 'documents.typeImage' },
  { id: 'pdf', icon: FileText, labelKey: 'documents.typePdf' },
  { id: 'doc', icon: FileType, labelKey: 'documents.typeDoc' },
  { id: 'media', icon: Film, labelKey: 'documents.typeMedia' },
  { id: 'link', icon: Link2, labelKey: 'documents.typeLink' },
  { id: 'other', icon: File, labelKey: 'documents.typeOther' }
]

const fileName = (s: string): string => s.split(/[\\/]/).pop() ?? s

export function DocumentsView(): JSX.Element {
  const { t } = useTranslation()
  const documents = useAppStore((s) => s.documents)
  const people = useAppStore((s) => s.people)
  const refreshDocuments = useAppStore((s) => s.refreshDocuments)
  const refreshPeople = useAppStore((s) => s.refreshPeople)
  const [active, setActive] = useState<DocumentRecord | null>(null)
  const [deleting, setDeleting] = useState<DocumentRecord | null>(null)

  // Open the viewer for a document chosen in the global search.
  const docFocusId = useAppStore((s) => s.documentFocusId)
  const docFocusNonce = useAppStore((s) => s.documentFocusNonce)
  useEffect(() => {
    if (!docFocusId) return
    const d = documents.find((x) => x.id === docFocusId)
    if (d) setActive(d)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docFocusNonce])

  const [q, setQ] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [attach, setAttach] = useState<AttachFilter>('all')
  const [sort, setSort] = useState<SortKey>('newest')

  const onImport = async (): Promise<void> => {
    await window.api.documents.import()
    await refreshDocuments()
  }

  const nameById = useMemo(() => new Map(people.map((p) => [p.id, fullName(p)])), [people])

  const hasFilters = !!(q.trim() || type !== 'all' || attach !== 'all')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = documents.filter((d) => {
      if (type !== 'all' && fileCategory(d) !== type) return false
      if (attach === 'attached' && d.personIds.length === 0) return false
      if (attach === 'unattached' && d.personIds.length > 0) return false
      if (needle) {
        const names = d.personIds.map((id) => nameById.get(id) ?? '').join(' ')
        const hay = `${d.title} ${d.description ?? ''} ${fileName(d.filePath)} ${names} ${t(
          `documents.kinds.${d.kind}`
        )}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
    const cmp = (a: DocumentRecord, b: DocumentRecord): number => {
      switch (sort) {
        case 'oldest':
          return a.createdAt.localeCompare(b.createdAt)
        case 'title':
          return (a.title || '￿').localeCompare(b.title || '￿')
        case 'date': {
          // Documents with their own date first (newest), undated last.
          if (!a.date && !b.date) return b.createdAt.localeCompare(a.createdAt)
          if (!a.date) return 1
          if (!b.date) return -1
          return b.date.localeCompare(a.date)
        }
        case 'newest':
        default:
          return b.createdAt.localeCompare(a.createdAt)
      }
    }
    return [...list].sort(cmp)
  }, [documents, q, type, attach, sort, nameById, t])

  // The pageable viewer steps through every viewable doc (images + remote links)
  // of the current filtered view.
  const viewable = useMemo(() => filtered.filter(canView), [filtered])

  // Windowed rendering: only the first `limit` cards are mounted; a sentinel at
  // the end grows it as the user scrolls. Thousands of photos thus never create
  // thousands of DOM nodes at once. Reset whenever the filtered set changes.
  const PAGE = 150
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => setLimit(PAGE), [q, type, attach, sort, documents.length])
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || limit >= filtered.length) return
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && setLimit((l) => Math.min(l + PAGE, filtered.length)),
      { rootMargin: '800px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [limit, filtered.length])
  const shown = useMemo(() => filtered.slice(0, limit), [filtered, limit])

  // Images and remote links open in the in-app viewer (a link that turns out not
  // to be an image falls back to the browser); other files open in the OS app.
  const openDoc = (d: DocumentRecord): void => {
    if (canView(d)) setActive(d)
    else void window.api.documents.open(d.id)
  }

  const attachedNames = useMemo(() => {
    if (!deleting) return []
    return deleting.personIds.map((id) => nameById.get(id)).filter((n): n is string => !!n)
  }, [deleting, nameById])

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return
    const snap = await window.api.documents.remove(deleting.id)
    await Promise.all([refreshDocuments(), refreshPeople()])
    setDeleting(null)
    if (snap) {
      toastUndo(t('delete.docDeleted'), t('common.undo'), async () => {
        await window.api.documents.restore(snap)
        await Promise.all([refreshDocuments(), refreshPeople()])
      })
    }
  }

  const clear = (): void => {
    setQ('')
    setType('all')
    setAttach('all')
  }

  const attachBtn = (value: AttachFilter, label: string): JSX.Element => (
    <button
      onClick={() => setAttach(value)}
      className={cn(
        'rounded-xl px-2.5 py-1 text-xs font-medium transition-colors',
        attach === value
          ? 'bg-background text-foreground shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] ring-1 ring-primary/20'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="flex h-full flex-col">
      {/* ---- Toolbar ---- */}
      <div className="glass-subtle space-y-2.5 border-b border-border/40 p-4">
        <div className="flex items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('documents.search')}
              className="pl-8"
            />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('documents.results', { count: filtered.length })}
          </span>
          <div className="flex-1" />
          <Button size="sm" className="gap-2" onClick={onImport}>
            <Upload className="h-4 w-4" />
            {t('documents.import')}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Type chips */}
          <div className="flex flex-wrap items-center gap-1">
            {TYPE_FILTERS.map(({ id, icon: Icon, labelKey }) => (
              <button
                key={id}
                onClick={() => setType(id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl border px-2 py-1 text-xs font-medium transition-colors',
                  type === id
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border/40 text-muted-foreground hover:bg-accent'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(labelKey)}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Attachment segmented */}
          <div className="flex items-center gap-0.5 rounded-xl bg-secondary/40 p-0.5">
            {attachBtn('all', t('documents.attachAll'))}
            {attachBtn('attached', t('documents.attached'))}
            {attachBtn('unattached', t('documents.unattachedShort'))}
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 rounded-xl border border-border/40 bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
            title={t('documents.sort')}
          >
            <option value="newest">{t('documents.sortNewest')}</option>
            <option value="oldest">{t('documents.sortOldest')}</option>
            <option value="date">{t('documents.sortDate')}</option>
            <option value="title">{t('documents.sortTitle')}</option>
          </select>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={clear}>
              <X className="h-3.5 w-3.5" />
              {t('documents.clear')}
            </Button>
          )}
        </div>
      </div>

      {/* ---- Results ---- */}
      {documents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">{t('documents.empty')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">{t('documents.noMatch')}</p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={clear}>
            <X className="h-3.5 w-3.5" />
            {t('documents.clear')}
          </Button>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 p-4">
            {shown.map((d) => (
              <DocumentThumb
                key={d.id}
                doc={d}
                onClick={() => openDoc(d)}
                onDelete={() => setDeleting(d)}
                attachedTo={d.personIds.map((id) => nameById.get(id)).filter((n): n is string => !!n)}
              />
            ))}
          </div>
          {limit < filtered.length && (
            <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              {t('documents.loadingMore', { shown: limit, total: filtered.length, defaultValue: '{{shown}} / {{total}}' })}
            </div>
          )}
        </ScrollArea>
      )}

      <DocumentViewerDialog list={viewable} active={active} onActiveChange={setActive} />

      {deleting && (
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(o) => !o && setDeleting(null)}
          title={t('delete.docTitle', { name: deleting.title || t('common.untitled') })}
          confirmLabel={t('common.delete')}
          onConfirm={confirmDelete}
        >
          {attachedNames.length > 0 ? (
            <>
              <p className="mb-2">{t('delete.docAttached')}</p>
              <ul className="mb-2 space-y-1 rounded-xl border border-border/40 bg-secondary/40 p-2">
                {attachedNames.map((n) => (
                  <li key={n} className="flex items-center gap-2 text-foreground">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" /> {n}
                  </li>
                ))}
              </ul>
              <p>{t('delete.docConsequence')}</p>
            </>
          ) : (
            <p>{t('delete.docUnattached')}</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
