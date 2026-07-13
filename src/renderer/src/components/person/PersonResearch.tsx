import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, HelpCircle, Pencil, Plus, Trash2, XCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { useAppStore } from '@/store/useAppStore'
import type { ResearchLog, ResearchResult } from '@shared/types'

const RESULTS: { key: ResearchResult; icon: typeof XCircle; cls: string }[] = [
  { key: 'negative', icon: XCircle, cls: 'text-destructive border-destructive/40 bg-destructive/10' },
  { key: 'positive', icon: CheckCircle2, cls: 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10' },
  { key: 'inconclusive', icon: HelpCircle, cls: 'text-amber-500 border-amber-500/40 bg-amber-500/10' }
]

const todayISO = (): string => new Date().toISOString().slice(0, 10)

/** Research History — log targeted sessions incl. NEGATIVE results so you never
 *  re-search the same place twice. */
export function PersonResearch({ personId }: { personId: string }): JSX.Element {
  const { t } = useTranslation()
  const fmtDate = useDateFormat()
  const refreshResearch = useAppStore((s) => s.refreshResearch)
  const [logs, setLogs] = useState<ResearchLog[]>([])
  const [open, setOpen] = useState(false)
  const blank = {
    title: '',
    date: todayISO(),
    repository: '',
    sourceDesc: '',
    dateRange: '',
    result: 'negative' as ResearchResult,
    detail: ''
  }
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState<ResearchLog | null>(null)
  const [editForm, setEditForm] = useState(blank)

  const openEdit = (l: ResearchLog): void => {
    setEditForm({
      title: l.title ?? '',
      date: l.date ?? todayISO(),
      repository: l.repository ?? '',
      sourceDesc: l.sourceDesc ?? '',
      dateRange: l.dateRange ?? '',
      result: l.result,
      detail: l.detail ?? ''
    })
    setEditing(l)
  }
  const saveEdit = async (): Promise<void> => {
    if (!editing) return
    await window.api.research.updateLog(editing.id, editForm)
    setEditing(null)
    await load()
    await refreshResearch()
  }

  const load = useCallback(async () => {
    setLogs(await window.api.research.logsForPerson(personId))
  }, [personId])
  useEffect(() => {
    void load()
  }, [load])

  const submit = async (): Promise<void> => {
    if (!form.title.trim() && !form.sourceDesc.trim()) return
    await window.api.research.createLog({ personId, ...form })
    setForm(blank)
    setOpen(false)
    await load()
    await refreshResearch()
  }
  const remove = async (id: string): Promise<void> => {
    await window.api.research.removeLog(id)
    await load()
    await refreshResearch()
  }

  const meta = (r: ResearchResult): (typeof RESULTS)[number] => RESULTS.find((x) => x.key === r) ?? RESULTS[0]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('research.history')} ({logs.length})
        </h4>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={() => setOpen((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> {t('research.add')}
        </Button>
      </div>

      {open && (
        <div className="space-y-2 rounded-xl border border-border/40 bg-secondary/40 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('research.title')}>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-8 text-xs" />
            </Field>
            <Field label={t('research.date')}>
              <Input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-8 text-xs" />
            </Field>
            <Field label={t('research.repository')}>
              <Input value={form.repository} onChange={(e) => setForm({ ...form, repository: e.target.value })} className="h-8 text-xs" />
            </Field>
            <Field label={t('research.dateRange')}>
              <Input value={form.dateRange} onChange={(e) => setForm({ ...form, dateRange: e.target.value })} placeholder="1840–1845" className="h-8 text-xs" />
            </Field>
          </div>
          <Field label={t('research.searched')}>
            <Input value={form.sourceDesc} onChange={(e) => setForm({ ...form, sourceDesc: e.target.value })} className="h-8 text-xs" />
          </Field>
          <Field label={t('research.result')}>
            <div className="flex gap-1.5">
              {RESULTS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setForm({ ...form, result: r.key })}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors',
                    form.result === r.key ? r.cls : 'border-border/40 text-muted-foreground hover:bg-accent'
                  )}
                >
                  <r.icon className="h-3.5 w-3.5" /> {t(`research.${r.key}`)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('research.detail')}>
            <Textarea value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} rows={2} className="text-xs" />
          </Field>
          <div className="flex justify-end">
            <Button size="sm" onClick={submit}>
              {t('research.save')}
            </Button>
          </div>
        </div>
      )}

      {logs.length === 0 && !open && (
        <p className="py-4 text-center text-sm text-muted-foreground">{t('research.empty')}</p>
      )}

      <div className="space-y-2">
        {logs.map((l) => {
          const m = meta(l.result)
          return (
            <div
              key={l.id}
              onClick={() => openEdit(l)}
              className="group cursor-pointer rounded-xl border border-border/40 bg-secondary/40 p-2.5 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="flex items-start gap-2">
                <span className={cn('mt-0.5 flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase', m.cls)}>
                  <m.icon className="h-3 w-3" /> {t(`research.${l.result}`)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.title || l.sourceDesc || '—'}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[l.repository, l.dateRange, fmtDate(l.date)].filter(Boolean).join(' · ')}
                  </p>
                  {l.detail && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{l.detail}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void remove(l.id)
                    }}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('research.edit')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('research.title')}>
                <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="h-8 text-xs" />
              </Field>
              <Field label={t('research.date')}>
                <Input value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="h-8 text-xs" />
              </Field>
              <Field label={t('research.repository')}>
                <Input value={editForm.repository} onChange={(e) => setEditForm({ ...editForm, repository: e.target.value })} className="h-8 text-xs" />
              </Field>
              <Field label={t('research.dateRange')}>
                <Input value={editForm.dateRange} onChange={(e) => setEditForm({ ...editForm, dateRange: e.target.value })} placeholder="1840–1845" className="h-8 text-xs" />
              </Field>
            </div>
            <Field label={t('research.searched')}>
              <Input value={editForm.sourceDesc} onChange={(e) => setEditForm({ ...editForm, sourceDesc: e.target.value })} className="h-8 text-xs" />
            </Field>
            <Field label={t('research.result')}>
              <div className="flex gap-1.5">
                {RESULTS.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setEditForm({ ...editForm, result: r.key })}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors',
                      editForm.result === r.key ? r.cls : 'border-border/40 text-muted-foreground hover:bg-accent'
                    )}
                  >
                    <r.icon className="h-3.5 w-3.5" /> {t(`research.${r.key}`)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t('research.detail')}>
              <Textarea value={editForm.detail} onChange={(e) => setEditForm({ ...editForm, detail: e.target.value })} rows={4} className="text-xs" />
            </Field>
          </div>
          <DialogFooter className="justify-between sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => {
                if (editing) void remove(editing.id)
                setEditing(null)
              }}
            >
              <Trash2 className="h-4 w-4" /> {t('common.delete')}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={saveEdit}>
                {t('research.save')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      {children}
    </div>
  )
}
