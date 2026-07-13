import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Briefcase, GripVertical, Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/common/DateInput'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { normalizeDate } from '@/lib/dates'
import { useDateFormat } from '@/hooks/useDateFormat'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import type { Occupation } from '@shared/types'

/** Formats an occupation's interval: "1900–1910" / "1900–" / "–1910" / "".
 *  `fmt` renders each date in the user's chosen display format. */
function interval(o: Occupation, fmt: (d: string | null | undefined) => string): string {
  if (o.startDate && o.endDate) return `${fmt(o.startDate)}–${fmt(o.endDate)}`
  if (o.startDate) return `${fmt(o.startDate)}–`
  if (o.endDate) return `–${fmt(o.endDate)}`
  return ''
}

/** Modal to edit one occupation in place — change title/dates or delete it, so a
 *  curated/imported occupation never has to be deleted just to tweak it. */
function OccupationEditDialog({
  occ,
  onClose,
  onChanged
}: {
  occ: Occupation | null
  onClose: () => void
  onChanged: () => Promise<void> | void
}): JSX.Element {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    if (!occ) return
    setTitle(occ.title ?? '')
    setFrom(occ.startDate ?? '')
    setTo(occ.endDate ?? '')
  }, [occ])

  const save = async (): Promise<void> => {
    if (!occ || !title.trim()) return
    await window.api.occupations.update(occ.id, {
      title: title.trim(),
      startDate: normalizeDate(from) || null,
      endDate: normalizeDate(to) || null
    })
    await onChanged()
    onClose()
  }
  const del = async (): Promise<void> => {
    if (!occ) return
    await window.api.occupations.remove(occ.id)
    await onChanged()
    onClose()
  }

  return (
    <Dialog open={!!occ} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            {t('person.editOccupation')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('person.occupation')} />
          <div className="flex items-center gap-2">
            <DateInput value={from} onValueChange={setFrom} placeholder={t('person.fromOpt')} className="flex-1" />
            <DateInput value={to} onValueChange={setTo} placeholder={t('person.toOpt')} className="flex-1" />
          </div>
        </div>
        <DialogFooter className="justify-between gap-2 sm:justify-between">
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void del()}>
            {t('common.delete')}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={!title.trim()}>
              {t('common.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A person's occupations — several allowed, each with an optional time interval.
 *  Click a row to edit it in a modal; the inline row adds new ones. */
export function PersonOccupations({ personId }: { personId: string }): JSX.Element {
  const { t } = useTranslation()
  const fmtDate = useDateFormat()
  const [list, setList] = useState<Occupation[]>([])
  const [editing, setEditing] = useState<Occupation | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setList(await window.api.occupations.listForPerson(personId))
  }, [personId])
  // Re-fetch when the global occupations signal changes too — e.g. a FamilySearch
  // sync merges new occupation facts for this person while the panel stays open.
  const occSignal = useAppStore((s) => s.occupationPersonIds)
  useEffect(() => {
    void load()
  }, [load, occSignal])

  const changed = async (): Promise<void> => {
    await load()
    void useAppStore.getState().refreshOccupations() // keep the data-quality scoring in sync
  }

  const add = async (): Promise<void> => {
    if (!title.trim()) return
    await window.api.occupations.create(personId, {
      title: title.trim(),
      startDate: normalizeDate(from) || null,
      endDate: normalizeDate(to) || null
    })
    setTitle('')
    setFrom('')
    setTo('')
    await changed()
  }
  const remove = async (id: string): Promise<void> => {
    await window.api.occupations.remove(id)
    await changed()
  }
  // Drop the dragged (undated) occupation just before the target row and persist
  // the new manual order. Dated entries stay date-sorted, so only undated rows
  // carry a drag handle.
  const reorderTo = async (targetId: string): Promise<void> => {
    const id = dragId
    setDragId(null)
    if (!id || id === targetId) return
    const next = [...list]
    const from = next.findIndex((o) => o.id === id)
    if (from < 0) return
    const [moved] = next.splice(from, 1)
    const to = next.findIndex((o) => o.id === targetId)
    if (to < 0) return
    next.splice(to, 0, moved)
    setList(next)
    await window.api.occupations.reorder(next.map((o) => o.id))
  }

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Briefcase className="h-3.5 w-3.5" /> {t('person.occupation')}
      </h4>
      {list.length > 0 && (
        <div className="space-y-1">
          {list.map((o) => {
            return (
              <div
                key={o.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void reorderTo(o.id) }}
                className={cn(
                  'flex items-center gap-2 rounded-lg border border-border/40 bg-secondary/40 px-2.5 py-1 text-xs',
                  dragId === o.id && 'opacity-50'
                )}
              >
                <span
                  draggable
                  onDragStart={() => setDragId(o.id)}
                  onDragEnd={() => setDragId(null)}
                  title={t('common.dragToReorder')}
                  className="shrink-0 cursor-grab text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </span>
                <button
                  onClick={() => setEditing(o)}
                  title={t('person.editOccupation')}
                  className="flex flex-1 items-center gap-1.5 truncate text-left transition-colors hover:text-primary"
                >
                  <span className="font-medium">{o.title || '—'}</span>
                  {interval(o, fmtDate) && (
                    <span className="text-muted-foreground tabular-nums">{interval(o, fmtDate)}</span>
                  )}
                </button>
                <button
                  onClick={() => void remove(o.id)}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                  title={t('common.delete')}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}
      <div className="space-y-1.5">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('person.occupation')}
          className="h-8 w-full text-xs"
        />
        <div className="flex items-center gap-1.5">
          <DateInput value={from} onValueChange={setFrom} placeholder={t('person.fromOpt')} className="h-8 flex-1 text-xs" />
          <DateInput value={to} onValueChange={setTo} placeholder={t('person.toOpt')} className="h-8 flex-1 text-xs" />
          <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => void add()} title={t('person.addOccupation')}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <OccupationEditDialog occ={editing} onClose={() => setEditing(null)} onChanged={changed} />
    </div>
  )
}
