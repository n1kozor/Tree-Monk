import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, ChevronLeft, ChevronRight, Cake, Heart, Bird, Users, ChevronsRight } from 'lucide-react'
import type { Person } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { cn, formatName } from '@/lib/utils'
import { ancestorIds, buildMonthEvents, type CalEvent, type EventKind } from '@/lib/calendar'

const KIND_META: Record<EventKind, { Icon: typeof Cake; dot: string; chip: string; on: string }> = {
  birth: { Icon: Cake, dot: 'text-sky-600 dark:text-sky-400', chip: 'bg-sky-500/12 text-sky-700 dark:text-sky-300', on: 'bg-sky-500 text-white' },
  marriage: { Icon: Heart, dot: 'text-rose-600 dark:text-rose-400', chip: 'bg-rose-500/12 text-rose-700 dark:text-rose-300', on: 'bg-rose-500 text-white' },
  death: { Icon: Bird, dot: 'text-slate-500 dark:text-slate-400', chip: 'bg-slate-500/12 text-slate-600 dark:text-slate-300', on: 'bg-slate-600 text-white' }
}

// Locale-aware: Hungarian shows surname first, every other language given first.
function fullName(p: Person): string {
  return formatName(p.givenName, p.surname)
}

function Initial({ p, size }: { p: Person; size: number }): JSX.Element {
  const ch = (p.givenName?.[0] || p.surname?.[0] || '?').toUpperCase()
  const bg = p.sex === 'M' ? 'bg-sky-500' : p.sex === 'F' ? 'bg-rose-500' : 'bg-slate-400'
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold text-white', bg)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {ch}
    </span>
  )
}

export function CalendarView(): JSX.Element {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const people = useAppStore((s) => s.people)
  const families = useAppStore((s) => s.families)
  const peopleById = useAppStore((s) => s.peopleById)
  const defaultRootId = useAppStore((s) => s.defaultRootId)
  const openProfile = useAppStore((s) => s.openProfile)

  const now = useMemo(() => new Date(), [])
  const layoutYear = now.getFullYear()
  const [month, setMonth] = useState(now.getMonth()) // 0..11
  const [selected, setSelected] = useState(now.getDate())
  const [scope, setScope] = useState<'ancestors' | 'all'>(defaultRootId ? 'ancestors' : 'all')
  const [kinds, setKinds] = useState<Record<EventKind, boolean>>({ birth: true, death: true, marriage: true })

  const ancSet = useMemo(() => ancestorIds(defaultRootId, families), [defaultRootId, families])
  const scopeIds = scope === 'ancestors' && ancSet.size > 0 ? ancSet : null

  const { byDay, dayUnknown, total } = useMemo(
    () => buildMonthEvents({ month: month + 1, people, families, peopleById, scopeIds, kinds }),
    [month, people, families, peopleById, scopeIds, kinds]
  )

  const monthName = useMemo(() => new Date(layoutYear, month, 1).toLocaleString(lang, { month: 'long' }), [layoutYear, month, lang])
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleString(lang, { weekday: 'short' })), [lang])

  const daysInMonth = new Date(layoutYear, month + 1, 0).getDate()
  const firstDow = (new Date(layoutYear, month, 1).getDay() + 6) % 7 // Monday = 0
  const cells: (number | null)[] = [...Array<null>(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)
  const todayDay = month === now.getMonth() ? now.getDate() : -1

  const goMonth = (delta: number): void => {
    const m = (month + delta + 12) % 12
    setMonth(m)
    setSelected(m === now.getMonth() ? now.getDate() : 1)
  }
  const goToday = (): void => {
    setMonth(now.getMonth())
    setSelected(now.getDate())
  }

  const selectedEvents = byDay.get(selected) ?? []

  const toggleKind = (k: EventKind): void => setKinds((s) => ({ ...s, [k]: !s[k] }))

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/40 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Calendar className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">{t('calendar.title')}</h2>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">{t('calendar.subtitle')}</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* scope */}
          <div className="glass-subtle flex items-center rounded-xl p-0.5">
            {(['ancestors', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  scope === s
                    ? 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] ring-1 ring-primary/20'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s === 'ancestors' ? <ChevronsRight className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                {t(s === 'ancestors' ? 'calendar.ancestors' : 'calendar.everyone')}
              </button>
            ))}
          </div>
          {/* kind filters */}
          <div className="flex items-center gap-1">
            {(['birth', 'marriage', 'death'] as const).map((k) => {
              const M = KIND_META[k]
              return (
                <button
                  key={k}
                  onClick={() => toggleKind(k)}
                  title={t(`calendar.${k}`)}
                  className={cn(
                    'flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors',
                    kinds[k] ? M.on : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                  )}
                >
                  <M.Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t(`calendar.${k}`)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center gap-2 px-4 py-2.5 sm:px-6">
        <button onClick={() => goMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/40 hover:bg-accent" aria-label="prev">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="min-w-[7.5rem] text-center text-lg font-semibold capitalize">{monthName}</h3>
        <button onClick={() => goMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/40 hover:bg-accent" aria-label="next">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button onClick={goToday} className="rounded-xl border border-border/40 px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
          {t('calendar.today')}
        </button>
        <span className="ml-auto text-xs text-muted-foreground">{t('calendar.count', { count: total })}</span>
      </div>

      {/* Body: grid + detail */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pb-6 sm:px-6 lg:flex-row">
        {/* Calendar grid */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 grid grid-cols-7 gap-1.5">
            {weekdays.map((w, i) => (
              <div key={i} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((day, i) => {
              if (day == null) return <div key={i} className="min-h-[72px] rounded-2xl" />
              const evs = byDay.get(day) ?? []
              const isToday = day === todayDay
              const isSel = day === selected
              return (
                <button
                  key={i}
                  onClick={() => setSelected(day)}
                  className={cn(
                    'flex min-h-[72px] flex-col rounded-2xl p-1.5 text-left transition-colors',
                    evs.length ? 'glass glass-hover' : 'border border-border/40 bg-background/40 hover:border-primary/40 hover:bg-accent/40',
                    isSel && 'ring-2 ring-primary'
                  )}
                >
                  <span
                    className={cn(
                      'mb-0.5 flex h-5 w-5 items-center justify-center self-start rounded-full text-[11px] font-semibold',
                      isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {day}
                  </span>
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {evs.slice(0, 3).map((ev, j) => {
                      const M = KIND_META[ev.kind]
                      return (
                        <span key={j} className={cn('flex items-center gap-1 rounded px-1 py-0.5 text-[10.5px] leading-tight', M.chip)}>
                          <M.Icon className={cn('h-2.5 w-2.5 shrink-0', M.dot)} />
                          <span className="truncate">{fullName(ev.primary) || '?'}</span>
                        </span>
                      )
                    })}
                    {evs.length > 3 && <span className="px-1 text-[10px] font-medium text-muted-foreground">{t('calendar.more', { count: evs.length - 3 })}</span>}
                  </div>
                </button>
              )
            })}
          </div>
          {dayUnknown > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{t('calendar.dayUnknown', { count: dayUnknown })}</p>}
        </div>

        {/* Selected-day detail */}
        <div className="w-full shrink-0 lg:w-80">
          <div className="glass rounded-2xl p-3 text-card-foreground">
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold leading-none text-primary">{selected}</span>
              <span className="text-sm font-medium capitalize text-muted-foreground">{monthName}</span>
            </div>
            {selectedEvents.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('calendar.noEventsDay')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {selectedEvents.map((ev, i) => (
                  <EventRow key={i} ev={ev} t={t} onOpen={() => openProfile(ev.personId)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EventRow({ ev, t, onOpen }: { ev: CalEvent; t: (k: string, o?: Record<string, unknown>) => string; onOpen: () => void }): JSX.Element {
  const M = KIND_META[ev.kind]
  const label = t(`calendar.${ev.kind}Label`)
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-accent">
        <Initial p={ev.primary} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">
              {fullName(ev.primary)}
              {ev.partner ? <span className="font-normal text-muted-foreground"> &amp; {fullName(ev.partner)}</span> : null}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <M.Icon className={cn('h-3 w-3', M.dot)} />
            <span>{label}</span>
            {ev.year != null && <span className="tabular-nums">· {ev.year}</span>}
            {ev.kind === 'death' && ev.ageAtDeath != null && <span>· {t('calendar.aged', { n: ev.ageAtDeath })}</span>}
          </div>
        </div>
      </button>
    </li>
  )
}
