import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, ExternalLink, FileText, Pencil, Plus, Quote } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { CitationDetail } from '@shared/types'

/**
 * The research "reason" note for a vital fact (e.g. a cause of death) — imported
 * from FamilySearch but fully editable. Full-width, so it sits below the date/place
 * pair without disturbing the grid. Empty → a subtle "add reason" affordance.
 */
export function VitalNote({
  value,
  label,
  onSave
}: {
  value: string
  label: string
  onSave: (v: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const has = value.trim().length > 0

  const openModal = (): void => {
    setDraft(value)
    setOpen(true)
  }
  const commit = (): void => {
    onSave(draft.trim())
    setOpen(false)
  }

  return (
    <>
      {has ? (
        <button
          type="button"
          onClick={openModal}
          title={t('common.edit')}
          className="group flex w-full items-start gap-1.5 rounded-xl border border-border/40 bg-muted/50 px-2 py-1.5 text-left text-xs leading-snug text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/70"
        >
          <span className="line-clamp-2 flex-1 whitespace-pre-line">{value}</span>
          <Pencil className="mt-0.5 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
        </button>
      ) : (
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-primary"
        >
          <Plus className="h-3 w-3" />
          {t('person.addReason')}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {label} · {t('person.reason')}
            </DialogTitle>
          </DialogHeader>
          <textarea
            value={draft}
            autoFocus
            rows={8}
            placeholder={t('person.reasonHint')}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full resize-y rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors focus:border-primary"
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border/40 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={commit}
              className="rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t('common.save')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * A tiny "sources" chip shown next to a fact (Birth / Death / Christening / …).
 * It appears only when the person has citations tagged for that fact's event
 * (citation.eventTag, set at FamilySearch import) and opens them in a modal — so
 * the evidence for a fact is reachable right from the fact itself.
 */
export function FactSources({
  citations,
  tags,
  label,
  className
}: {
  citations: CitationDetail[]
  tags: string[]
  label?: string
  className?: string
}): JSX.Element | null {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const matching = citations.filter((c) => c.eventTag && tags.includes(c.eventTag))
  if (!matching.length) return null

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        title={t('person.viewSources', { count: matching.length })}
        className={cn(
          'inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/25',
          className
        )}
      >
        <FileText className="h-3 w-3" />
        {matching.length}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              {label ? `${label} · ` : ''}
              {t('person.sourcesCount', { count: matching.length })}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
            {matching.map((c) => {
              const url = (c.sourcePublication || '').match(/https?:\/\/\S+/)?.[0]
              return (
                <div key={c.id} className="rounded-xl border border-border/40 bg-card/50 p-3">
                  <p className="text-sm font-medium leading-snug">{c.sourceTitle || t('person.sources')}</p>
                  {(c.recordDate || c.page) && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {c.recordDate && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {c.recordDate}
                        </span>
                      )}
                      {c.page && (
                        <span className="inline-flex items-center gap-1">
                          <Quote className="h-3 w-3" />
                          {c.page}
                        </span>
                      )}
                    </div>
                  )}
                  {c.sourceAuthor && (
                    <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{c.sourceAuthor}</p>
                  )}
                  {c.note && (
                    <p className="mt-1.5 rounded bg-amber-500/10 px-2 py-1 text-xs leading-snug text-amber-700 dark:text-amber-300">
                      {c.note}
                    </p>
                  )}
                  {url && (
                    <button
                      type="button"
                      onClick={() => void window.api.app.openExternal(url)}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border/40 px-2 py-1 text-xs font-medium transition-colors hover:bg-accent"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t('person.openOnFs')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
