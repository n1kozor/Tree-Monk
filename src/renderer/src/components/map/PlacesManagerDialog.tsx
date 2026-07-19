import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Landmark, MapPin, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { norm } from '@/lib/nameMatch'
import type { PlaceInfo } from '@shared/types'

/** Free-form but suggested place types (Ahnenblatt/GOV-style levels). */
const PLACE_TYPES = ['village', 'town', 'city', 'district', 'county', 'region', 'country', 'other'] as const

/**
 * Gazetteer manager: every known place with its hierarchy (parent chain up to
 * the country) and GOV id (gov.genealogy.net). The flat place strings on
 * people/events stay untouched — this is metadata ON TOP of them.
 */
export function PlacesManagerDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [places, setPlaces] = useState<PlaceInfo[]>([])
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const reload = async (): Promise<void> => {
    const list = await window.api.geo.listPlaces()
    setPlaces([...list].sort((a, b) => a.name.localeCompare(b.name)))
  }
  useEffect(() => {
    if (open) void reload()
  }, [open])

  const byName = useMemo(() => new Map(places.map((p) => [p.name, p])), [places])
  const filtered = useMemo(() => {
    const nq = norm(q)
    return nq ? places.filter((p) => norm(p.name).includes(nq)) : places
  }, [places, q])
  const sel = selected ? byName.get(selected) : undefined

  /** Parent chain upward from a place (cycle-guarded). */
  const chain = (name: string): PlaceInfo[] => {
    const out: PlaceInfo[] = []
    const seen = new Set<string>()
    let cur = byName.get(name)
    while (cur && !seen.has(cur.name) && out.length < 12) {
      out.push(cur)
      seen.add(cur.name)
      cur = cur.parentName ? byName.get(cur.parentName) : undefined
    }
    return out
  }

  const saveMeta = async (name: string, patch: Partial<PlaceInfo>): Promise<void> => {
    const p = byName.get(name)
    if (!p) return
    const next = { ...p, ...patch }
    setPlaces((xs) => xs.map((x) => (x.name === name ? next : x)))
    await window.api.geo.setPlaceMeta(name, {
      placeType: next.placeType,
      parentName: next.parentName,
      govId: next.govId
    })
  }

  const typeLabel = (ty: string | null): string => {
    if (!ty) return ''
    const key = `places.type.${ty}`
    const label = t(key)
    return label === key ? ty : label
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4" /> {t('places.title')}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{t('places.hint')}</p>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} className="h-9 pl-8" />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_280px]">
          {/* Place list */}
          <div className="min-h-0 overflow-y-auto rounded-xl border border-border/40">
            {filtered.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">{t('places.none')}</p>
            )}
            {filtered.map((p) => (
              <button
                key={p.name}
                onClick={() => setSelected(p.name)}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-border/30 px-2.5 py-1.5 text-left text-sm last:border-b-0 hover:bg-accent',
                  selected === p.name && 'bg-primary/10'
                )}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.placeType && (
                  <span className="shrink-0 rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {typeLabel(p.placeType)}
                  </span>
                )}
                {p.govId && (
                  <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    GOV
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="min-h-0 space-y-3 overflow-y-auto rounded-xl border border-border/40 p-3">
            {!sel ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{t('places.select')}</p>
            ) : (
              <>
                <p className="break-words text-sm font-semibold">{sel.name}</p>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{t('places.typeLabel')}</span>
                  <select
                    value={sel.placeType ?? ''}
                    onChange={(e) => void saveMeta(sel.name, { placeType: e.target.value || null })}
                    className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="">—</option>
                    {PLACE_TYPES.map((ty) => (
                      <option key={ty} value={ty}>
                        {typeLabel(ty)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{t('places.parent')}</span>
                  <Input
                    list="tm-place-parents"
                    value={sel.parentName ?? ''}
                    onChange={(e) =>
                      setPlaces((xs) =>
                        xs.map((x) => (x.name === sel.name ? { ...x, parentName: e.target.value || null } : x))
                      )
                    }
                    onBlur={(e) => void saveMeta(sel.name, { parentName: e.target.value || null })}
                    placeholder={t('places.parentHint')}
                    className="h-9 text-sm"
                  />
                  <datalist id="tm-place-parents">
                    {places
                      .filter((p) => p.name !== sel.name)
                      .map((p) => (
                        <option key={p.name} value={p.name} />
                      ))}
                  </datalist>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">GOV ID</span>
                  <div className="flex gap-1.5">
                    <Input
                      value={sel.govId ?? ''}
                      onChange={(e) =>
                        setPlaces((xs) =>
                          xs.map((x) => (x.name === sel.name ? { ...x, govId: e.target.value || null } : x))
                        )
                      }
                      onBlur={(e) => void saveMeta(sel.name, { govId: e.target.value || null })}
                      placeholder="pl. UJKIGYJN96DL"
                      className="h-9 flex-1 font-mono text-xs"
                    />
                    {sel.govId && (
                      <button
                        onClick={() => void window.api.app.openExternal(`https://gov.genealogy.net/item/show/${sel.govId}`)}
                        title="gov.genealogy.net"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/40 text-muted-foreground transition-colors hover:text-primary"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </label>

                {/* Hierarchy chain preview */}
                {chain(sel.name).length > 1 && (
                  <div className="space-y-1 rounded-lg bg-secondary/40 p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('places.hierarchy')}
                    </p>
                    <p className="text-xs leading-relaxed">
                      {chain(sel.name)
                        .map((p) => p.name.split(',')[0].trim())
                        .join(' → ')}
                    </p>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">
                  {sel.lat.toFixed(4)}, {sel.lon.toFixed(4)}
                </p>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
