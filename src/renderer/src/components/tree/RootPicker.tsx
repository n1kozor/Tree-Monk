import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Search, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { useAppStore } from '@/store/useAppStore'
import { fullName, yearOf } from '@/lib/utils'

/** Searchable picker to choose the tree's starting (root) person. */
export function RootPicker({
  rootId,
  onPick,
  flat
}: {
  rootId?: string
  onPick: (id: string) => void
  /** Drop the heavy floating shadow/blur — for use inside cards and dialogs. */
  flat?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const people = useAppStore((s) => s.people)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const current = rootId ? people.find((p) => p.id === rootId) : undefined

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle
      ? people.filter((p) => fullName(p).toLowerCase().includes(needle))
      : people
    return list.slice(0, 200)
  }, [people, q])

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v)
          setTimeout(() => inputRef.current?.focus(), 10)
        }}
        className={cn(
          'flex h-8 max-w-[220px] items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:bg-accent',
          flat ? 'bg-background' : 'bg-card/90 shadow-xl backdrop-blur'
        )}
        title={t('tree.chooseRoot')}
      >
        <UserRound className="h-3.5 w-3.5 text-primary" />
        <span className="truncate">{current ? fullName(current) : t('tree.chooseRoot')}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute left-0 top-9 z-50 w-72 overflow-hidden rounded-lg border border-border bg-popover',
              flat ? 'shadow-lg' : 'shadow-2xl'
            )}
          >
            <div className="relative border-b border-border p-2">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('common.search')}
                className="w-full rounded-md bg-secondary px-2 py-1.5 pl-8 text-sm outline-none"
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
                    onPick(p.id)
                    setOpen(false)
                    setQ('')
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent',
                    p.id === rootId && 'bg-accent'
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
                  {p.id === rootId && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
