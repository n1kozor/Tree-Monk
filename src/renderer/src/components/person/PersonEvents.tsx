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
import { cn, fullName } from '@/lib/utils'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { RelativeDialog } from './RelativeDialog'
import type { EventParticipant, EventRecord, EventType, Person } from '@shared/types'

const PERSON_TYPES: EventType[] = [
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

/** Event types that belong to a FAMILY (the union), not a person. */
const FAMILY_TYPES: EventType[] = [
  'engagement',
  'banns',
  'civilMarriage',
  'churchMarriage',
  'divorce',
  'separation',
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

/** Modal editor for one event — create a new one (event = null) or change /
 *  delete an existing one. Participants added while CREATING are buffered
 *  locally and flushed once the event exists. */
function EventEditDialog({
  open,
  event,
  ownerType,
  ownerId,
  types,
  onClose,
  onChanged
}: {
  open: boolean
  /** The event being edited — null means create mode. */
  event: EventRecord | null
  ownerType: 'person' | 'family'
  ownerId: string
  types: EventType[]
  onClose: () => void
  onChanged: () => Promise<void> | void
}): JSX.Element {
  const { t } = useTranslation()
  const peopleById = useAppStore((s) => s.peopleById)
  const [type, setType] = useState('other')
  const [value, setValue] = useState('')
  const [place, setPlace] = useState('')
  const [date, setDate] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [note, setNote] = useState('')
  // Shared-event participants (pap, bába, adományozó…), free-form roles.
  // In create mode they live only in this state until the event is saved.
  const [participants, setParticipants] = useState<EventParticipant[]>([])
  const [addingPart, setAddingPart] = useState(false)

  const loadParticipants = useCallback(async () => {
    if (event) setParticipants(await window.api.eventParticipants.forEvent(event.id))
  }, [event])

  useEffect(() => {
    if (!open) return
    setType(event?.type ?? types[0])
    setValue(event?.value ?? '')
    setPlace(event?.place ?? '')
    setDate(event?.date ?? '')
    setDateTo(event?.endDate ?? '')
    setNote(event?.note ?? '')
    setParticipants([])
    void loadParticipants()
  }, [open, event, types, loadParticipants])

  const setRole = async (personId: string, role: string): Promise<void> => {
    if (event) await window.api.eventParticipants.set(event.id, personId, role || null)
    else
      setParticipants((xs) => xs.map((x) => (x.personId === personId ? { ...x, role: role || null } : x)))
  }
  const addParticipant = async (personId: string): Promise<void> => {
    if (event) {
      await window.api.eventParticipants.set(event.id, personId, null)
      await loadParticipants()
    } else {
      setParticipants((xs) =>
        xs.some((x) => x.personId === personId) ? xs : [...xs, { personId, role: null }]
      )
    }
  }
  const removeParticipant = async (personId: string): Promise<void> => {
    if (event) {
      await window.api.eventParticipants.remove(event.id, personId)
      await loadParticipants()
    } else {
      setParticipants((xs) => xs.filter((x) => x.personId !== personId))
    }
  }

  // The dialog offers the owner-appropriate type list, and includes a
  // custom/FS-derived type as its own option so it isn't lost on save.
  const options = types.includes(type as EventType) ? types : [type as EventType, ...types]

  const save = async (): Promise<void> => {
    const input = {
      type: type.trim() || 'other',
      value: value.trim() || null,
      place: place.trim() || null,
      date: normalizeDate(date) || null,
      endDate: normalizeDate(dateTo) || null,
      note: note.trim() || null
    }
    if (event) {
      await window.api.events.update(event.id, input)
    } else {
      const created =
        ownerType === 'person'
          ? await window.api.events.create(ownerId, input)
          : await window.api.events.createForFamily(ownerId, input)
      // Flush the participants buffered while creating.
      for (const pt of participants) {
        await window.api.eventParticipants.set(created.id, pt.personId, pt.role)
      }
    }
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{event ? t('events.edit') : t('events.addTitle')}</DialogTitle>
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

          {/* Participants with roles (Gramps-style shared event). */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t('participants.title')}</span>
              <button
                type="button"
                onClick={() => setAddingPart(true)}
                className="flex items-center gap-1 rounded-lg border border-border/40 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                <Plus className="h-3 w-3" /> {t('participants.add')}
              </button>
            </div>
            {participants.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('participants.none')}</p>
            )}
            {participants.map((pt) => {
              const person: Person | undefined = peopleById.get(pt.personId)
              if (!person) return null
              return (
                <div key={pt.personId} className="flex items-center gap-1.5">
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
                    <PersonAvatar
                      personId={person.id}
                      name={fullName(person)}
                      sex={person.sex}
                      className="h-5 w-5 shrink-0 text-[8px]"
                    />
                    <span className="truncate font-medium">{fullName(person)}</span>
                  </span>
                  <Input
                    key={`${pt.personId}-${event?.id ?? 'new'}`}
                    defaultValue={pt.role ?? ''}
                    list="tm-participant-roles"
                    placeholder={t('participants.role')}
                    onBlur={(e) => void setRole(pt.personId, e.target.value.trim())}
                    className="h-7 w-36 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void removeParticipant(pt.personId)}
                    className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                    title={t('common.delete')}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
            <datalist id="tm-participant-roles">
              {(['priest', 'midwife', 'officiant', 'donor', 'gravedigger'] as const).map((r) => (
                <option key={r} value={t(`participants.roles.${r}`)} />
              ))}
            </datalist>
          </div>
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          {event ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>
              {t('common.delete')}
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save}>{event ? t('common.save') : t('common.add')}</Button>
        </DialogFooter>
      </DialogContent>
      <RelativeDialog
        open={addingPart}
        onOpenChange={setAddingPart}
        title={t('participants.addTitle')}
        defaultMode="existing"
        excludeIds={new Set(participants.map((pt) => pt.personId))}
        onPickExisting={(id) => void addParticipant(id)}
        onSubmit={async (draft) => {
          const created = await window.api.people.create(draft)
          await addParticipant(created.id)
          await useAppStore.getState().refreshAll()
        }}
      />
    </Dialog>
  )
}

/**
 * Events / facts of an owner: a PERSON's life events (residences — several
 * allowed — plus military, nationality, etc.) or a FAMILY's union events
 * (engagement, civil/church wedding, divorce…). Add via the same modal that
 * edits a row (click to open), delete inline. Populated by the FS/GEDCOM
 * import but fully hand-maintainable.
 */
function EventsBlock({
  ownerType,
  ownerId,
  types,
  heading
}: {
  ownerType: 'person' | 'family'
  ownerId: string
  types: EventType[]
  heading: string
}): JSX.Element {
  const { t } = useTranslation()
  const fmtDate = useDateFormat()
  const [list, setList] = useState<EventRecord[]>([])
  const [editing, setEditing] = useState<EventRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setList(
      ownerType === 'person'
        ? await window.api.events.forPerson(ownerId)
        : await window.api.events.forFamily(ownerId)
    )
  }, [ownerType, ownerId])
  // Reload after a FamilySearch sync too (residence & other facts are merged
  // into the events table, but this panel fetches its own list).
  const syncNonce = useAppStore((s) => s.personSyncNonce)
  useEffect(() => {
    void load()
  }, [load, syncNonce])

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
        <CalendarClock className="h-3.5 w-3.5" /> {heading}
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

      <button
        onClick={() => setCreating(true)}
        className="flex items-center gap-1 rounded-lg border border-border/40 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <Plus className="h-3 w-3" /> {t('events.addTitle')}
      </button>

      <EventEditDialog
        open={!!editing || creating}
        event={editing}
        ownerType={ownerType}
        ownerId={ownerId}
        types={types}
        onClose={() => {
          setEditing(null)
          setCreating(false)
        }}
        onChanged={load}
      />
    </div>
  )
}

/** A person's life events / facts — the original public surface. */
export function PersonEvents({ personId }: { personId: string }): JSX.Element {
  const { t } = useTranslation()
  return <EventsBlock ownerType="person" ownerId={personId} types={PERSON_TYPES} heading={t('events.title')} />
}

/** A family's (union's) events: engagement, weddings, divorce, separation. */
export function FamilyEvents({ familyId }: { familyId: string }): JSX.Element {
  const { t } = useTranslation()
  return <EventsBlock ownerType="family" ownerId={familyId} types={FAMILY_TYPES} heading={t('events.familyTitle')} />
}
