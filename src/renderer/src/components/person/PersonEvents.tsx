import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, GripVertical, Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/common/DateInput'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/store/useAppStore'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { normalizeDate } from '@/lib/dates'
import { useDateFormat } from '@/hooks/useDateFormat'
import { cn } from '@/lib/utils'
import type { EventRecord, EventType } from '@shared/types'

const TYPES: EventType[] = [
  'residence',
  'divorce',
  'military',
  'nationality',
  'caste',
  'title',
  'description',
  'naturalization',
  'cremation',
  'education',
  'religious',
  'other'
]

type Tr = (key: string) => string
/** Known types get a translated label; anything else (custom / FS-derived)
 *  shows raw. FS/GEDCOMX types arrive CamelCase ("Residence") — retry the
 *  lookup lowercased so they translate too. */
function typeLabel(t: Tr, type: string): string {
  for (const candidate of [type, type.toLowerCase()]) {
    const key = `events.type.${candidate}`
    const label = t(key)
    if (label !== key) return label
  }
  return type
}

/** Modal editor for one event — change every field, or delete it. */
function EventEditDialog({
  event,
  onClose,
  onChanged
}: {
  event: EventRecord | null
  onClose: () => void
  onChanged: () => Promise<void> | void
}): JSX.Element {
  const { t } = useTranslation()
  const [type, setType] = useState('other')
  const [value, setValue] = useState('')
  const [place, setPlace] = useState('')
  const [date, setDate] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!event) return
    setType(event.type)
    setValue(event.value ?? '')
    setPlace(event.place ?? '')
    setDate(event.date ?? '')
    setDateTo(event.endDate ?? '')
    setNote(event.note ?? '')
  }, [event])

  // Include a custom/FS-derived type as its own option so it isn't lost on save.
  const options = TYPES.includes(type as EventType) ? TYPES : [type, ...TYPES]

  const save = async (): Promise<void> => {
    if (!event) return
    await window.api.events.update(event.id, {
      type: type.trim() || 'other',
      value: value.trim() || null,
      place: place.trim() || null,
      date: normalizeDate(date) || null,
      endDate: normalizeDate(dateTo) || null,
      note: note.trim() || null
    })
    await onChanged()
    onClose()
  }
  const remove = async (): Promise<void> => {
    if (!event) return
    await window.api.events.remove(event.id)
    await onChanged()
    onClose()
  }

  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('events.edit')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('events.title')}</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
            >
              {options.map((ty) => (
                <option key={ty} value={ty}>
                  {typeLabel(t, ty)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('events.value')}</span>
            <Input value={value} onChange={(e) => setValue(e.target.value)} className="h-9 text-sm" />
          </label>
          <div className="flex gap-2">
            <label className="block flex-1 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('person.place')}</span>
              <Input value={place} onChange={(e) => setPlace(e.target.value)} className="h-9 text-sm" />
            </label>
            <label className="block w-24 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('events.from')}</span>
              <DateInput value={date} onValueChange={setDate} className="h-9 text-sm" />
            </label>
            <label className="block w-24 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('events.to')}</span>
              <DateInput value={dateTo} onValueChange={setDateTo} className="h-9 text-sm" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('person.notes')}</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[64px] text-sm" />
          </label>
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>
            {t('common.delete')}
          </Button>
          <Button onClick={save}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A person's life events / facts (residences — several allowed — plus military,
 * nationality, etc.). Add inline, click a row to edit it in a modal, or delete.
 * Populated by the FS/GEDCOM import but fully hand-maintainable.
 */
export function PersonEvents({ personId }: { personId: string }): JSX.Element {
  const { t } = useTranslation()
  const fmtDate = useDateFormat()
  const [list, setList] = useState<EventRecord[]>([])
  const [editing, setEditing] = useState<EventRecord | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [type, setType] = useState<EventType>('residence')
  const [value, setValue] = useState('')
  const [place, setPlace] = useState('')
  const [date, setDate] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(async () => {
    setList(await window.api.events.forPerson(personId))
  }, [personId])
  // Reload after a FamilySearch sync too (residence & other facts are merged
  // into the events table, but this panel fetches its own list).
  const syncNonce = useAppStore((s) => s.personSyncNonce)
  useEffect(() => {
    void load()
  }, [load, syncNonce])

  const add = async (): Promise<void> => {
    if (!value.trim() && !place.trim() && !date.trim()) return
    await window.api.events.create(personId, {
      type,
      value: value.trim() || null,
      place: place.trim() || null,
      date: normalizeDate(date) || null,
      endDate: normalizeDate(dateTo) || null
    })
    setValue('')
    setPlace('')
    setDate('')
    setDateTo('')
    await load()
  }
  const remove = async (id: string): Promise<void> => {
    await window.api.events.remove(id)
    await load()
  }
  // Drop the dragged (undated) event just before the target row and persist the
  // new manual order. Dated events stay date-sorted, so only undated rows drag.
  const reorderTo = async (targetId: string): Promise<void> => {
    const id = dragId
    setDragId(null)
    if (!id || id === targetId) return
    const next = [...list]
    const from = next.findIndex((e) => e.id === id)
    if (from < 0) return
    const [moved] = next.splice(from, 1)
    const to = next.findIndex((e) => e.id === targetId)
    if (to < 0) return
    next.splice(to, 0, moved)
    setList(next)
    await window.api.events.reorder(next.map((e) => e.id))
  }

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" /> {t('events.title')}
      </h4>

      {list.length > 0 && (
        <div className="space-y-1">
          {list.map((e) => {
            return (
            <div
              key={e.id}
              role="button"
              tabIndex={0}
              onClick={() => setEditing(e)}
              onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && setEditing(e)}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={(ev) => { ev.preventDefault(); void reorderTo(e.id) }}
              className={cn(
                'group flex cursor-pointer items-center gap-2 rounded-lg border border-border/40 bg-secondary/40 px-2.5 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-accent',
                dragId === e.id && 'opacity-50'
              )}
            >
              <span
                draggable
                onClick={(ev) => ev.stopPropagation()}
                onDragStart={() => setDragId(e.id)}
                onDragEnd={() => setDragId(null)}
                title={t('common.dragToReorder')}
                className="-ml-0.5 shrink-0 cursor-grab text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              <span className="shrink-0 rounded bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {typeLabel(t, e.type)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {[e.value, e.place].filter(Boolean).join(' · ') || '—'}
                {e.date && (
                  <span className="ml-1.5 tabular-nums text-muted-foreground">
                    {e.endDate ? `${fmtDate(e.date)}–${fmtDate(e.endDate)}` : fmtDate(e.date)}
                  </span>
                )}
              </span>
              <button
                onClick={(ev) => {
                  ev.stopPropagation()
                  void remove(e.id)
                }}
                className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                title={t('common.delete')}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as EventType)}
          className="h-8 shrink-0 rounded-lg border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
        >
          {TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {typeLabel(t, ty)}
            </option>
          ))}
        </select>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('events.value')}
          className="h-8 min-w-[72px] flex-1 text-xs"
        />
        <Input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder={t('person.place')}
          className="h-8 min-w-[72px] flex-1 text-xs"
        />
        <DateInput
          value={date}
          onValueChange={setDate}
          placeholder={t('events.from')}
          className="h-8 w-20 text-xs"
        />
        <DateInput
          value={dateTo}
          onValueChange={setDateTo}
          placeholder={t('events.to')}
          className="h-8 w-20 text-xs"
        />
        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={add} title={t('events.title')}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <EventEditDialog event={editing} onClose={() => setEditing(null)} onChanged={load} />
    </div>
  )
}
