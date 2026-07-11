import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownUp,
  BookText,
  Check,
  Copy,
  ExternalLink,
  FilePlus,
  Link2,
  Pencil,
  Plus,
  Quote,
  Trash2,
  Upload
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NameDialog } from '@/components/common/NameDialog'
import { DocumentThumb } from '@/components/documents/DocumentThumb'
import { DocumentViewerDialog } from '@/components/documents/DocumentViewerDialog'
import { useAppStore } from '@/store/useAppStore'
import { canView } from '@/lib/docCategory'
import { sourceYear } from '@/lib/citationYear'
import { cn } from '@/lib/utils'
import type { CitationDetail, CitationEdit, DocumentRecord } from '@shared/types'

/** Strips inline HTML markup (e.g. <i>FamilySearch</i>) that GEDCOM sources embed. */
function stripHtml(s: string): string {
  return s
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}

type CiteSort = 'year-asc' | 'year-desc' | 'title'

/** Common GEDCOM event tags offered when tying a citation to an event. */
const EVENT_TAGS = ['', 'BIRT', 'CHR', 'MARR', 'DEAT', 'BURI', 'RESI', 'CENS', 'OCCU', 'IMMI', 'NATU', 'DIV']
const QUALITIES = ['', 'primary', 'secondary', 'questionable']

/** Renders text with any URLs turned into clickable external links. */
function Linkify({ text }: { text: string }): JSX.Element {
  const parts = stripHtml(text).split(/(https?:\/\/[^\s)]+)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 break-all text-primary underline decoration-primary/40 hover:decoration-primary"
          >
            {p}
            <ExternalLink className="inline h-2.5 w-2.5" />
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}

function CitationCard({
  c,
  onEdit,
  onDelete
}: {
  c: CitationDetail
  onEdit: () => void
  onDelete: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const year = sourceYear(c)
  const full = [c.sourceTitle, c.sourceAuthor, c.sourcePublication, c.page, c.repositoryName]
    .filter(Boolean)
    .map((s) => stripHtml(s as string))
    .join('\n')

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(full)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group relative cursor-text select-text rounded-xl border border-border/40 bg-card/50 p-3">
      <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={copy}
          title={t('common.copy')}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={onEdit}
          title={t('common.edit')}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          title={t('common.delete')}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-start gap-2">
        <BookText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 pr-16">
          <p className="text-sm font-medium leading-snug">
            <Linkify text={c.sourceTitle} />
          </p>
          {c.sourceAuthor && (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              <Linkify text={c.sourceAuthor} />
            </p>
          )}
          {c.sourcePublication && c.sourcePublication !== c.sourceAuthor && (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              <Linkify text={c.sourcePublication} />
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {year !== null && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                {year}
              </span>
            )}
            {c.eventTag && (
              <span className="rounded bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">
                {t(`person.srcEventTags.${c.eventTag}`, { defaultValue: c.eventTag })}
              </span>
            )}
            {c.page && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Quote className="h-2.5 w-2.5" /> {c.page}
              </span>
            )}
            {c.repositoryName && (
              <span className="text-[11px] text-muted-foreground/80">· {c.repositoryName}</span>
            )}
          </div>
          {c.note && <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{stripHtml(c.note)}</p>}
        </div>
      </div>
    </div>
  )
}

/** Inline add/edit form for a source + its citation. Every field maps onto an
 *  existing column, so editing never requires a schema change. */
function CitationForm({
  initial,
  onSave,
  onCancel
}: {
  initial?: CitationDetail | null
  onSave: (e: CitationEdit) => void | Promise<void>
  onCancel: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [title, setTitle] = useState(initial?.sourceTitle ?? '')
  const [date, setDate] = useState(initial?.recordDate ?? '')
  const [evt, setEvt] = useState(initial?.eventTag ?? '')
  const [page, setPage] = useState(initial?.page ?? '')
  const [author, setAuthor] = useState(initial?.sourceAuthor ?? '')
  const [pub, setPub] = useState(initial?.sourcePublication ?? '')
  const [quality, setQuality] = useState(initial?.quality ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [text, setText] = useState(initial?.sourceText ?? '')
  const [busy, setBusy] = useState(false)

  const nz = (s: string): string | null => {
    const v = s.trim()
    return v ? v : null
  }
  const submit = async (): Promise<void> => {
    setBusy(true)
    await onSave({
      sourceTitle: title.trim(),
      sourceAuthor: nz(author),
      sourcePublication: nz(pub),
      sourceText: nz(text),
      recordDate: nz(date),
      eventTag: nz(evt),
      page: nz(page),
      quality: nz(quality),
      note: nz(note)
    })
    setBusy(false)
  }

  const inputCls =
    'h-8 w-full rounded-lg border border-border/40 bg-background/60 px-2 text-xs outline-none focus:border-primary/60'
  const labelCls = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'

  return (
    <div className="space-y-2.5 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div>
        <label className={labelCls}>{t('person.srcTitle')}</label>
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('person.srcTitle')} autoFocus />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>{t('person.srcDate')}</label>
          <input className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} placeholder="1850" />
        </div>
        <div>
          <label className={labelCls}>{t('person.srcEvent')}</label>
          <select className={inputCls} value={evt} onChange={(e) => setEvt(e.target.value)}>
            {EVENT_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {tag ? t(`person.srcEventTags.${tag}`, { defaultValue: tag }) : '—'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t('person.srcPage')}</label>
          <input className={inputCls} value={page} onChange={(e) => setPage(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>{t('person.srcAuthor')}</label>
          <input className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>{t('person.srcPublication')}</label>
          <input className={inputCls} value={pub} onChange={(e) => setPub(e.target.value)} placeholder="https://…" />
        </div>
      </div>
      <div>
        <label className={labelCls}>{t('person.srcQuality')}</label>
        <select className={cn(inputCls, 'max-w-[12rem]')} value={quality} onChange={(e) => setQuality(e.target.value)}>
          {QUALITIES.map((q) => (
            <option key={q} value={q}>
              {q ? t(`person.quality_${q}`) : '—'}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>{t('person.srcNote')}</label>
        <textarea className={cn(inputCls, 'h-14 resize-y py-1.5')} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>{t('person.srcText')}</label>
        <textarea className={cn(inputCls, 'h-16 resize-y py-1.5')} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => void submit()} disabled={busy || !title.trim()}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

/** Professional source manager: attach files / images / links, plus citations. */
export function PersonSources({ personId }: { personId: string }): JSX.Element {
  const { t } = useTranslation()
  const refreshDocuments = useAppStore((s) => s.refreshDocuments)
  const bumpSources = useAppStore((s) => s.bumpSources)
  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [cites, setCites] = useState<CitationDetail[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [renaming, setRenaming] = useState<DocumentRecord | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [active, setActive] = useState<DocumentRecord | null>(null)
  const [citeSort, setCiteSort] = useState<CiteSort>('year-asc')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // Imported citations arrive in an arbitrary order — sort them by the source's
  // own date (chronological by default, like FamilySearch). Sources with no
  // recorded date always sink to the bottom.
  const sortedCites = useMemo(() => {
    const arr = [...cites]
    if (citeSort === 'title') {
      return arr.sort((a, b) => stripHtml(a.sourceTitle).localeCompare(stripHtml(b.sourceTitle)))
    }
    const dir = citeSort === 'year-desc' ? -1 : 1
    return arr.sort((a, b) => {
      const ya = sourceYear(a)
      const yb = sourceYear(b)
      if (ya === null && yb === null) return 0
      if (ya === null) return 1 // undated always last
      if (yb === null) return -1
      return (ya - yb) * dir
    })
  }, [cites, citeSort])

  // Images + remote links open in the pageable in-app viewer; other files in the OS.
  const viewable = useMemo(() => docs.filter(canView), [docs])
  const openDoc = (d: DocumentRecord): void => {
    if (canView(d)) setActive(d)
    else void window.api.documents.open(d.id)
  }

  const reload = useCallback(async () => {
    const [d, c] = await Promise.all([
      window.api.documents.listForPerson(personId),
      window.api.research.citationsForPerson(personId)
    ])
    setDocs(d)
    setCites(c)
  }, [personId])
  // Reload after a FamilySearch sync too — merged sources/citations are attached
  // server-side, but this panel fetches its own list.
  const syncNonce = useAppStore((s) => s.personSyncNonce)
  useEffect(() => {
    void reload()
  }, [reload, syncNonce])

  const after = async (): Promise<void> => {
    await reload()
    await refreshDocuments()
    bumpSources() // refresh the per-person source count on the tree cards
  }
  const addFiles = async (): Promise<void> => {
    await window.api.documents.import(personId)
    await after()
  }
  const addLink = async (url: string): Promise<void> => {
    await window.api.documents.createLink(url, '', personId)
    await after()
  }
  const detach = async (docId: string): Promise<void> => {
    await window.api.documents.detach(docId, personId)
    await after()
  }
  const onDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setDragOver(false)
    const paths = (Array.from(e.dataTransfer.files) as Array<File & { path?: string }>)
      .map((f) => f.path)
      .filter((p): p is string => !!p)
    if (paths.length) {
      await window.api.documents.importPaths(paths, personId)
      await after()
    }
  }

  // Citation editing (works on FS-imported sources too — e.g. add a date).
  const saveEdit = async (id: string, edit: CitationEdit): Promise<void> => {
    await window.api.research.updateCitation(id, edit)
    setEditingId(null)
    await reload()
  }
  const saveNew = async (edit: CitationEdit): Promise<void> => {
    await window.api.research.addCitation(personId, edit)
    setAdding(false)
    await reload()
    bumpSources() // citations count toward the tree card's source badge too
  }
  const removeCite = async (id: string): Promise<void> => {
    await window.api.research.deleteCitation(id)
    setEditingId(null)
    await reload()
    bumpSources()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('person.sources')} ({docs.length})
        </h4>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={() => setLinkOpen(true)}>
            <Link2 className="h-3.5 w-3.5" /> {t('person.addLink')}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={addFiles}>
            <FilePlus className="h-3.5 w-3.5" /> {t('person.addFile')}
          </Button>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-xl border border-dashed p-3 transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-border'
        )}
      >
        {docs.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-6 text-center text-muted-foreground">
            <Upload className="h-5 w-5" />
            <p className="text-xs">{t('person.sourcesDrop')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
            {docs.map((d) => (
              <DocumentThumb
                key={d.id}
                doc={d}
                onClick={() => openDoc(d)}
                onDelete={() => detach(d.id)}
                onRename={() => setRenaming(d)}
              />
            ))}
          </div>
        )}
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {cites.length > 0 ? `${cites.length} ${t('person.citations')}` : t('person.citations')}
          </h4>
          <div className="flex items-center gap-1.5">
            {cites.length > 1 && (
              <>
                <ArrowDownUp className="h-3 w-3 text-muted-foreground" />
                <select
                  value={citeSort}
                  onChange={(e) => setCiteSort(e.target.value as CiteSort)}
                  className="h-7 rounded-lg border border-border/40 bg-background/60 px-1.5 text-[11px] outline-none focus:border-primary/60"
                  title={t('person.sortBy')}
                >
                  <option value="year-asc">{t('person.sortYearAsc')}</option>
                  <option value="year-desc">{t('person.sortYearDesc')}</option>
                  <option value="title">{t('person.sortTitle')}</option>
                </select>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                setEditingId(null)
                setAdding(true)
              }}
            >
              <Plus className="h-3.5 w-3.5" /> {t('person.addSource')}
            </Button>
          </div>
        </div>

        {adding && <CitationForm onSave={saveNew} onCancel={() => setAdding(false)} />}

        {sortedCites.map((c) =>
          editingId === c.id ? (
            <CitationForm
              key={c.id}
              initial={c}
              onSave={(edit) => saveEdit(c.id, edit)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <CitationCard
              key={c.id}
              c={c}
              onEdit={() => {
                setAdding(false)
                setEditingId(c.id)
              }}
              onDelete={() => void removeCite(c.id)}
            />
          )
        )}

        {cites.length === 0 && !adding && (
          <p className="px-1 text-[11px] text-muted-foreground">{t('person.noCitations')}</p>
        )}
      </section>

      <NameDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        title={t('person.addLink')}
        placeholder="https://…"
        submitLabel={t('common.add')}
        onSubmit={addLink}
      />

      <NameDialog
        open={renaming !== null}
        onOpenChange={(v) => !v && setRenaming(null)}
        title={t('common.rename')}
        initial={renaming?.title ?? ''}
        placeholder={t('person.srcTitle')}
        submitLabel={t('common.save')}
        onSubmit={async (name) => {
          if (renaming) {
            await window.api.documents.update(renaming.id, { title: name.trim() })
            setRenaming(null)
            await reload()
          }
        }}
      />

      <DocumentViewerDialog list={viewable} active={active} onActiveChange={setActive} />
    </div>
  )
}
