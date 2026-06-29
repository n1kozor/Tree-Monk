import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Footprints, Sparkles, User, UserRound } from 'lucide-react'
import type { Person } from '@shared/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Tour setup: pick a predefined route + the start person, then launch. For now
 *  only the paternal-line tour exists — the grid notes that more are coming. */
export function TourSetupModal({
  open,
  onOpenChange,
  people,
  defaultRootId,
  onStart
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  people: Person[]
  defaultRootId?: string
  onStart: (startId: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [kind, setKind] = useState<'patriline'>('patriline')
  const [rootId, setRootId] = useState<string | undefined>(defaultRootId)
  const [query, setQuery] = useState('')

  const root = rootId ? people.find((p) => p.id === rootId) : null
  const rootLabel = root ? `${root.surname ?? ''} ${root.givenName ?? ''}`.trim() : t('tour.noPerson')

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return people.filter((p) => `${p.givenName ?? ''} ${p.surname ?? ''}`.toLowerCase().includes(q)).slice(0, 6)
  }, [people, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Footprints className="h-5 w-5 text-primary" />
            {t('tour.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('tour.intro')}</p>

          {/* Predefined routes */}
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => setKind('patriline')}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                kind === 'patriline' ? 'border-primary/60 bg-primary/10' : 'border-border hover:bg-accent'
              )}
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-500">
                <User className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t('tour.patriline.title')}</span>
                <span className="block text-xs text-muted-foreground">{t('tour.patriline.desc')}</span>
              </span>
            </button>

            {/* More tours coming */}
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
              {t('tour.moreSoon')}
            </div>
          </div>

          {/* Start person */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('tour.startPerson')}
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm">
              <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{rootLabel}</span>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tour.searchPerson')}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
            {suggestions.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                {suggestions.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setRootId(p.id)
                      setQuery('')
                    }}
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-accent"
                  >
                    <span>{`${p.surname ?? ''} ${p.givenName ?? ''}`.trim()}</span>
                    <span className="text-xs text-muted-foreground">{(p.birthDate ?? '').slice(0, 4)}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">{t('tour.patriline.hint')}</p>
          </div>

          <Button className="w-full gap-2" disabled={!rootId} onClick={() => rootId && onStart(rootId)}>
            <Footprints className="h-4 w-4" />
            {t('tour.start')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
