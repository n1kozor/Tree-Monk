import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { History, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Undo2, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useAppStore } from '@/store/useAppStore'
import { cn, fullName } from '@/lib/utils'
import type { AuditEntry, AuditFilter, AuditImpact } from '@shared/types'

const ACTION_META = {
  create: { icon: Plus, dot: 'text-emerald-500' },
  update: { icon: Pencil, dot: 'text-amber-500' },
  delete: { icon: Trash2, dot: 'text-red-500' }
} as const

/** Entity categories offered in the filter dropdown (must match the i18n keys). */
const ENTITIES = [
  'person', 'family', 'family_child', 'event', 'occupation',
  'alias', 'source', 'citation', 'note', 'document', 'person_document'
]
const PAGE = 100

/** "2026-06-22 09:41:03" (UTC from SQLite) → a localized local-time string. */
function formatTs(ts: string, lang: string): string {
  const d = new Date(ts.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString(lang)
}
const short = (v: string | null): string => {
  if (v == null || v === '') return '∅'
  return v.length > 40 ? v.slice(0, 40) + '…' : v
}

export function AuditView(): JSX.Element {
  const { t, i18n } = useTranslation()
  const refreshAll = useAppStore((s) => s.refreshAll)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const peopleById = useAppStore((s) => s.peopleById)

  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pending, setPending] = useState<{ entry: AuditEntry; impact: AuditImpact } | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState<'' | 'create' | 'update' | 'delete'>('')

  const baseFilter = useCallback(
    (): AuditFilter => ({ search, entity, action, limit: PAGE }),
    [search, entity, action]
  )

  // (Re)load the first page. Debounced by the effect below so typing is smooth.
  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const page = await window.api.audit.query(baseFilter())
      setEntries(page.entries)
      setTotal(page.total)
      setHasMore(page.hasMore)
    } finally {
      setLoading(false)
    }
  }, [baseFilter])

  // Re-query whenever a filter changes (debounced so each keystroke doesn't hit
  // the DB; at millions of rows the query is indexed but still worth batching).
  const firstRun = useRef(true)
  useEffect(() => {
    const ms = firstRun.current ? 0 : 250
    firstRun.current = false
    const id = setTimeout(() => void reload(), ms)
    return () => clearTimeout(id)
  }, [reload])

  const loadMore = async (): Promise<void> => {
    const last = entries[entries.length - 1]
    if (!last) return
    setLoadingMore(true)
    try {
      const page = await window.api.audit.query({ ...baseFilter(), beforeSeq: last.seq })
      setEntries((prev) => [...prev, ...page.entries])
      setHasMore(page.hasMore)
    } finally {
      setLoadingMore(false)
    }
  }

  const askRevert = async (entry: AuditEntry): Promise<void> => {
    const impact = await window.api.audit.impact(entry.seq)
    setPending({ entry, impact })
  }
  const doRevert = async (seq: number): Promise<void> => {
    const res = await window.api.audit.revert(seq)
    if (res.ok) {
      toast.success(t('audit.undoneToast'))
      await refreshAll()
      await reload()
    } else {
      toast.error(t('audit.revertFailed', { error: res.error ?? '' }))
    }
  }

  const entityLabel = (e: string): string => t(`audit.entity.${e}`, { defaultValue: e })
  const fieldLabel = (col: string): string => t(`audit.field.${col}`, { defaultValue: col })
  const selectCls =
    'h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary/60'
  const hasFilters = !!(search || entity || action)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 pt-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <History className="h-5 w-5 text-primary" /> {t('audit.title')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('audit.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void reload()}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          {t('audit.refresh')}
        </Button>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="audit-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('audit.search')}
            className="h-9 pl-8"
          />
        </div>
        <select className={selectCls} value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">{t('audit.all')}</option>
          {ENTITIES.map((en) => (
            <option key={en} value={en}>
              {entityLabel(en)}
            </option>
          ))}
        </select>
        <select className={selectCls} value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
          <option value="">{t('audit.all')}</option>
          <option value="create">{t('audit.action.create')}</option>
          <option value="update">{t('audit.action.update')}</option>
          <option value="delete">{t('audit.action.delete')}</option>
        </select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => {
              setSearch('')
              setEntity('')
              setAction('')
            }}
          >
            <X className="h-3.5 w-3.5" /> {t('audit.clear')}
          </Button>
        )}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {t('audit.count', { count: total })}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {entries.length === 0 && !loading && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            {hasFilters ? t('audit.noMatches') : t('audit.empty')}
          </p>
        )}

        <ol className="mx-auto max-w-3xl space-y-1.5">
          {entries.map((e) => {
            const { icon: Icon, dot } = ACTION_META[e.action]
            const owner = e.personId ? peopleById.get(e.personId) : undefined
            return (
              <li
                key={e.seq}
                data-testid="audit-entry"
                className={cn(
                  'flex items-start gap-3 rounded-lg border border-border bg-card p-2.5',
                  e.undone && 'opacity-55'
                )}
              >
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', dot)} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    <span className="font-medium">{t(`audit.action.${e.action}`)}</span>
                    <span className="text-muted-foreground">{entityLabel(e.entity)}</span>
                    {e.label && <span className="truncate font-medium">{e.label}</span>}
                    {owner && e.entity !== 'person' && (
                      <button
                        onClick={() => selectPerson(owner.id)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <User className="h-3 w-3" /> {fullName(owner)}
                      </button>
                    )}
                    {e.entity === 'person' && e.personId && (
                      <button
                        onClick={() => selectPerson(e.personId!)}
                        className="text-xs text-primary hover:underline"
                      >
                        {t('audit.open')}
                      </button>
                    )}
                  </div>

                  {e.action === 'update' && e.fields.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {e.fields.slice(0, 4).map((f) => (
                        <div key={f.field} className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground/80">{fieldLabel(f.field)}:</span>{' '}
                          <span className="line-through">{short(f.from)}</span> → <span>{short(f.to)}</span>
                        </div>
                      ))}
                      {e.fields.length > 4 && (
                        <div className="text-[11px] text-muted-foreground">
                          {t('audit.moreFields', { count: e.fields.length - 4 })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-1 text-[10px] tabular-nums text-muted-foreground/70">
                    {formatTs(e.ts, i18n.language)}
                  </div>
                </div>

                {e.undone ? (
                  <span className="shrink-0 self-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t('audit.undone')}
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="audit-undo"
                    className="h-7 shrink-0 gap-1 text-xs"
                    onClick={() => void askRevert(e)}
                  >
                    <Undo2 className="h-3.5 w-3.5" /> {t('audit.undo')}
                  </Button>
                )}
              </li>
            )
          })}
        </ol>

        {hasMore && (
          <div className="mx-auto mt-3 max-w-3xl text-center">
            <Button variant="outline" size="sm" className="gap-1.5" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('audit.loadMore')}
            </Button>
          </div>
        )}
      </div>

      {/* Impact-aware confirm */}
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setPending(null)}
          title={t('audit.confirmTitle')}
          confirmLabel={t('audit.undo')}
          onConfirm={() => {
            const seq = pending.entry.seq
            setPending(null)
            void doRevert(seq)
          }}
        >
          <div className="space-y-2">
            <p>{t('audit.confirmBody')}</p>
            {(pending.impact.laterEdits > 0 ||
              pending.impact.cascadeCount > 0 ||
              pending.impact.missingRefs.length > 0) && (
              <ul className="list-disc space-y-1 pl-5 text-amber-600 dark:text-amber-400">
                {pending.impact.laterEdits > 0 && (
                  <li>{t('audit.warn.laterEdits', { count: pending.impact.laterEdits })}</li>
                )}
                {pending.impact.cascadeCount > 0 && (
                  <li>{t('audit.warn.cascade', { count: pending.impact.cascadeCount })}</li>
                )}
                {pending.impact.missingRefs.length > 0 && (
                  <li>{t('audit.warn.missingRefs', { refs: pending.impact.missingRefs.join(', ') })}</li>
                )}
              </ul>
            )}
          </div>
        </ConfirmDialog>
      )}
    </div>
  )
}
