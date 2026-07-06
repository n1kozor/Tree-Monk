import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Baby,
  Briefcase,
  CalendarClock,
  Droplet,
  Flower2,
  Globe2,
  Heart,
  Home,
  Maximize2,
  Shield,
  Bird,
  type LucideIcon
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/store/useAppStore'
import { ageAt } from '@/lib/dates'
import { cn, fullName } from '@/lib/utils'
import { worldEventsInRange, worldEventTitle, worldEventYears } from '@/lib/worldEvents'
import type { EventRecord, Occupation, Person } from '@shared/types'

/** First 4-digit year in a free-form date, as a number (or null). */
const parseYear = (date: string | null | undefined): number | null => {
  const m = (date ?? '').match(/\d{4}/)
  return m ? Number(m[0]) : null
}

type Tone =
  | 'birth'
  | 'christening'
  | 'residence'
  | 'occupation'
  | 'marriage'
  | 'child'
  | 'military'
  | 'death'
  | 'burial'
  | 'event'
  | 'world'

interface TItem {
  key: string
  year: number
  when: string
  label: string
  place?: string
  tone: Tone
}

const META: Record<Tone, { icon: LucideIcon; dot: string }> = {
  birth: { icon: Baby, dot: 'bg-emerald-500' },
  christening: { icon: Droplet, dot: 'bg-sky-500' },
  residence: { icon: Home, dot: 'bg-amber-500' },
  occupation: { icon: Briefcase, dot: 'bg-violet-500' },
  marriage: { icon: Heart, dot: 'bg-rose-500' },
  child: { icon: Baby, dot: 'bg-teal-500' },
  military: { icon: Shield, dot: 'bg-stone-500' },
  death: { icon: Bird, dot: 'bg-red-500' },
  burial: { icon: Flower2, dot: 'bg-slate-500' },
  event: { icon: CalendarClock, dot: 'bg-muted-foreground' },
  world: { icon: Globe2, dot: 'bg-blue-400' }
}

/** Order at the same year: personal events before world context. */
const TONE_ORDER: Tone[] = [
  'birth',
  'christening',
  'residence',
  'occupation',
  'marriage',
  'child',
  'military',
  'event',
  'death',
  'burial',
  'world'
]

/** The vertical timeline list itself, shared by the inline preview and the modal. */
function TimelineList({ items, birthDate }: { items: TItem[]; birthDate: string | null }): JSX.Element {
  const { t } = useTranslation()
  return (
    <ol className="relative ml-1 space-y-2 border-l border-border/40 pl-4">
      {items.map((it) => {
        const { icon: Icon, dot } = META[it.tone]
        // Use the full event date (it.when) so month/day refine the age — e.g. a
        // burial the January after a December death stays at the death-year age.
        const age = it.tone !== 'birth' ? ageAt(birthDate, it.when) : null
        return (
          <li key={it.key} className="relative">
            <span className={cn('absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-background', dot)} />
            <div className={cn('flex items-start gap-2 text-xs', it.tone === 'world' && 'opacity-90')}>
              <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', it.tone === 'world' ? 'text-blue-400' : 'text-muted-foreground')} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="shrink-0 font-semibold tabular-nums">{it.when}</span>
                  {age != null && age >= 0 && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">· {t('timeline.age', { n: age })}</span>
                  )}
                </div>
                <p className={cn('leading-snug', it.tone === 'world' ? 'italic text-muted-foreground' : 'text-foreground/90')}>
                  {it.label}
                  {it.place && <span className="text-muted-foreground"> · {it.place}</span>}
                </p>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** A person's life as a vertical timeline. The inline (base) view shows only the
 *  person's own life events; clicking it opens a modal where the major world
 *  events they lived through can be toggled on ("life in context"). */
export function PersonTimeline({ person }: { person: Person }): JSX.Element | null {
  const { t, i18n } = useTranslation()
  const families = useAppStore((s) => s.families)
  const peopleById = useAppStore((s) => s.peopleById)
  const [occupations, setOccupations] = useState<Occupation[]>([])
  const [events, setEvents] = useState<EventRecord[]>([])
  const [open, setOpen] = useState(false)
  const [showWorld, setShowWorld] = useState(false)

  useEffect(() => {
    void window.api.occupations.listForPerson(person.id).then(setOccupations)
    void window.api.events.forPerson(person.id).then(setEvents)
  }, [person.id])

  // Reset the world-events toggle to off whenever the modal is reopened.
  useEffect(() => {
    if (open) setShowWorld(false)
  }, [open])

  // The person's own life events — never includes world/historical context.
  const lifeItems = useMemo<TItem[]>(() => {
    const out: TItem[] = []
    const add = (date: string | null, label: string, tone: Tone, place?: string | null, key?: string): void => {
      const y = parseYear(date)
      if (y == null || !label) return
      out.push({ key: key ?? `${tone}-${out.length}`, year: y, when: date ?? '', label, place: place ?? undefined, tone })
    }

    add(person.birthDate, t('person.birth'), 'birth', person.birthPlace)
    add(person.christeningDate, t('person.christening'), 'christening', person.christeningPlace)
    occupations.forEach((o, i) => add(o.startDate, o.title, 'occupation', o.note, `occ-${i}`))
    events.forEach((e, i) => {
      // FS/GEDCOMX types arrive CamelCase ("Residence") — compare and translate
      // case-insensitively so imported facts get the localized label too.
      const lower = e.type.toLowerCase()
      const tone: Tone = lower === 'residence' ? 'residence' : lower === 'military' ? 'military' : 'event'
      const exact = t(`events.type.${e.type}`)
      const lowered = t(`events.type.${lower}`)
      const typeText =
        exact !== `events.type.${e.type}` ? exact : lowered !== `events.type.${lower}` ? lowered : e.type
      add(e.date, e.value || typeText, tone, e.place, `ev-${i}`)
    })
    for (const f of families) {
      if (f.husbandId === person.id || f.wifeId === person.id) {
        const spouseId = f.husbandId === person.id ? f.wifeId : f.husbandId
        const sp = spouseId ? peopleById.get(spouseId) : undefined
        add(f.marriageDate, sp ? t('timeline.marriedTo', { name: fullName(sp) }) : t('person.marriage'), 'marriage', f.marriagePlace, `marr-${f.id}`)
        for (const cid of f.childIds) {
          const ch = peopleById.get(cid)
          if (ch) add(ch.birthDate, t('timeline.childBorn', { name: fullName(ch) }), 'child', ch.birthPlace, `chi-${cid}`)
        }
      }
    }
    add(person.deathDate, t('person.death'), 'death', person.deathPlace)
    add(person.burialDate, t('person.burial'), 'burial', person.burialPlace)

    return out
  }, [person, occupations, events, families, peopleById, t])

  // World context across the lifespan (birth → death, or ~90 years if unknown).
  const worldItems = useMemo<TItem[]>(() => {
    const birthY = parseYear(person.birthDate)
    if (birthY == null) return []
    const deathY = parseYear(person.deathDate)
    return worldEventsInRange(birthY, deathY ?? birthY + 90).map((e) => ({
      key: `w-${e.from}-${e.en}`,
      year: e.from,
      when: worldEventYears(e),
      label: worldEventTitle(e, i18n.language),
      tone: 'world' as const
    }))
  }, [person.birthDate, person.deathDate, i18n.language])

  const sortItems = (arr: TItem[]): TItem[] =>
    [...arr].sort((a, b) => a.year - b.year || TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone))

  const baseItems = useMemo(() => sortItems(lifeItems), [lifeItems])
  const modalItems = useMemo(
    () => sortItems(showWorld ? [...lifeItems, ...worldItems] : lifeItems),
    [lifeItems, worldItems, showWorld]
  )

  if (baseItems.length === 0) return null
  const hasWorld = worldItems.length > 0
  // Keep the inline preview short; the rest is one click away in the modal.
  const INLINE_MAX = 15
  const previewItems = baseItems.slice(0, INLINE_MAX)
  const hiddenCount = baseItems.length - previewItems.length

  return (
    <>
      <div className="space-y-2">
        <h4 className="flex items-center justify-between gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" /> {t('timeline.title')}
          </span>
        </h4>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t('timeline.openHint')}
          className="group block w-full rounded-lg p-1 text-left transition-colors hover:bg-accent/60"
        >
          <TimelineList items={previewItems} birthDate={person.birthDate} />
          <span className="mt-2 flex items-center gap-1 pl-4 text-[10px] font-medium text-muted-foreground/80 group-hover:text-primary">
            <Maximize2 className="h-3 w-3" />
            {hiddenCount > 0 ? t('timeline.openMore', { count: hiddenCount }) : t('timeline.openHint')}
          </span>
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              {t('timeline.title')} · {fullName(person)}
            </DialogTitle>
          </DialogHeader>

          {hasWorld && (
            <button
              type="button"
              onClick={() => setShowWorld((v) => !v)}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                showWorld ? 'border-blue-400/50 bg-blue-400/10' : 'border-border/40 hover:bg-accent'
              )}
            >
              <Globe2 className={cn('h-4 w-4 shrink-0', showWorld ? 'text-blue-400' : 'text-muted-foreground')} />
              <span className="flex-1">
                <span className="font-medium">{t('timeline.worldEvents')}</span>
                <span className="block text-[11px] text-muted-foreground">{t('timeline.worldEventsHint')}</span>
              </span>
            </button>
          )}

          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <TimelineList items={modalItems} birthDate={person.birthDate} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
