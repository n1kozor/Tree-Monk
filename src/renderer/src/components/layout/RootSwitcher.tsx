import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, ChevronDown, Search, Star, X } from 'lucide-react'
import { cn, fullName, yearOf } from '@/lib/utils'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { useAppStore } from '@/store/useAppStore'

/**
 * Global "starting person" picker in the top bar. Shows who "me" is for the
 * relationship finder and the pedigree; when none is set it shows a loud amber
 * warning so it's obvious the app has no anchor person yet.
 */
export function RootSwitcher(): JSX.Element {
  const { t } = useTranslation()
  const people = useAppStore((s) => s.people)
  const defaultRootId = useAppStore((s) => s.defaultRootId)
  const peopleById = useAppStore((s) => s.peopleById)
  const setDefaultRoot = useAppStore((s) => s.setDefaultRoot)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const current = defaultRootId ? peopleById.get(defaultRootId) : undefined

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle ? people.filter((p) => fullName(p).toLowerCase().includes(needle)) : people
    return list.slice(0, 200)
  }, [people, q])

  // No people yet (fresh/empty workspace) → nothing to anchor on, so don't nag.
  if (people.length === 0) return <></>

  const toggle = (): void => {
    setOpen((v) => !v)
    setQ('')
    setTimeout(() => inputRef.current?.focus(), 10)
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        title={t('nav.startPersonHint')}
        className={cn(
          'flex h-9 max-w-[10rem] items-center gap-2 rounded-xl px-2.5 text-xs font-medium transition-colors lg:max-w-[13rem] xl:max-w-[240px]',
          current
            ? 'glass-subtle text-foreground hover:bg-accent'
            : 'animate-pulse border border-amber-500/70 bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300'
        )}
      >
        {current ? (
          <>
            <PersonAvatar
              personId={current.id}
              name={fullName(current)}
              sex={current.sex}
              className="h-6 w-6 text-[9px]"
            />
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('nav.startPerson')}
              </span>
              <span className="truncate font-semibold">{fullName(current)}</span>
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="truncate font-semibold">{t('nav.noStartPerson')}</span>
          </>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute right-0 top-11 z-50 w-72 overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <Star className="h-3.5 w-3.5 text-primary" />
                {t('nav.startPerson')}
              </span>
              {current && (
                <button
                  onClick={() => {
                    void setDefaultRoot(null)
                    setOpen(false)
                  }}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  {t('nav.clearStartPerson')}
                </button>
              )}
            </div>
            <div className="relative border-b border-border/40 p-2">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('common.search')}
                className="w-full rounded-xl bg-secondary/40 px-2 py-1.5 pl-8 text-sm outline-none backdrop-blur-sm"
              />
            </div>
            <div className="max-h-72 overflow-y-auto p-1">
              {filtered.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">—</p>
              )}
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    void setDefaultRoot(p.id)
                    setOpen(false)
                    setQ('')
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-accent',
                    p.id === defaultRootId && 'bg-accent'
                  )}
                >
                  <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-7 w-7 text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{fullName(p)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {yearOf(p.birthDate)}
                      {p.deathDate ? `–${yearOf(p.deathDate)}` : ''}
                    </p>
                  </div>
                  {p.id === defaultRootId && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
