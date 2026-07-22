import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FileImage,
  Globe,
  Group,
  HelpCircle,
  LayoutDashboard,
  MapPin,
  Pin,
  Search,
  Sparkles,
  StickyNote,
  UserPlus,
  Wand2
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn, fullName, yearOf } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { useAppStore } from '@/store/useAppStore'
import { useBoardStore } from './useBoardStore'

interface Props {
  spawnAt: () => { x: number; y: number }
  onWizard: () => void
}

const MAX_RESULTS = 40

export function BoardToolbar({ spawnAt, onWizard }: Props): JSX.Element {
  const { t } = useTranslation()
  const people = useAppStore((s) => s.people)
  const addNote = useBoardStore((s) => s.addNote)
  const addPerson = useBoardStore((s) => s.addPerson)
  const addDocuments = useBoardStore((s) => s.addDocuments)
  const addMystery = useBoardStore((s) => s.addMystery)
  const addZone = useBoardStore((s) => s.addZone)
  const addLink = useBoardStore((s) => s.addLink)
  const addMap = useBoardStore((s) => s.addMap)
  const boardMode = useBoardStore((s) => s.boardMode)
  const setBoardMode = useBoardStore((s) => s.setBoardMode)
  const magicOrganize = useBoardStore((s) => s.magicOrganize)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Only ever build (at most) MAX_RESULTS rows — never the whole list.
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out: typeof people = []
    for (const p of people) {
      if (!needle || fullName(p).toLowerCase().includes(needle)) {
        out.push(p)
        if (out.length >= MAX_RESULTS) break
      }
    }
    return out
  }, [people, q])

  const openPicker = (): void => {
    setPickerOpen(true)
    setQ('')
    setTimeout(() => inputRef.current?.focus(), 10)
  }

  // ---- Map snippet: geocode an address, then drop a paper map piece. ----
  const [mapOpen, setMapOpen] = useState(false)
  const [mapQ, setMapQ] = useState('')
  const [mapBusy, setMapBusy] = useState(false)
  const [mapSearched, setMapSearched] = useState(false)
  const [mapResults, setMapResults] = useState<{ name: string; lat: number; lon: number }[]>([])
  const mapInputRef = useRef<HTMLInputElement>(null)
  const openMap = (): void => {
    setMapOpen(true)
    setMapQ('')
    setMapResults([])
    setMapSearched(false)
    setTimeout(() => mapInputRef.current?.focus(), 10)
  }
  // Explicit search on Enter — Nominatim's usage policy forbids as-you-type
  // autocomplete, so nothing is requested while typing (same as PlaceInput).
  const runMapSearch = async (): Promise<void> => {
    const q = mapQ.trim()
    if (q.length < 3) return
    setMapBusy(true)
    const r = await window.api.geo.search(q).catch(() => [])
    setMapResults(r.slice(0, 20))
    setMapSearched(true)
    setMapBusy(false)
  }
  const pickMap = (r: { name: string; lat: number; lon: number }): void => {
    addMap(spawnAt(), { label: r.name.split(',').slice(0, 2).join(',').trim(), lat: r.lat, lng: r.lon })
    setMapOpen(false)
  }

  return (
    <div className="glass-strong pointer-events-auto absolute left-1/2 top-4 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl p-1.5">
      <div className="flex items-center gap-1 rounded-xl bg-secondary/40 p-0.5">
        <button
          onClick={() => setBoardMode('flat')}
          title={t('board.modeFlat')}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-medium transition-colors',
            boardMode === 'flat'
              ? 'bg-background text-foreground shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] ring-1 ring-primary/20'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">{t('board.modeFlat')}</span>
        </button>
        <button
          onClick={() => setBoardMode('corkboard')}
          title={t('board.modeCork')}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-medium transition-colors',
            boardMode === 'corkboard'
              ? 'bg-background text-foreground shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] ring-1 ring-primary/20'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Pin className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">{t('board.modeCork')}</span>
        </button>
      </div>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* The headline action: a guided "what are you investigating?" wizard. */}
      <Button size="sm" className="gap-2 shadow-sm" onClick={onWizard} data-testid="board-wizard">
        <Wand2 className="h-4 w-4" />
        <span className="hidden sm:inline">{t('board.wizard.button')}</span>
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Button variant="ghost" size="sm" className="gap-2" onClick={() => addNote(spawnAt())}>
        <StickyNote className="h-4 w-4 text-amber-400" />
        <span className="hidden md:inline">{t('board.addNote')}</span>
      </Button>

      {/* Searchable person picker (replaces the thousands-of-items dropdown). */}
      <div className="relative">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}>
          <UserPlus className="h-4 w-4 text-primary" />
          <span className="hidden md:inline">{t('board.addPerson')}</span>
        </Button>
        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
            <div className="glass-strong absolute left-0 top-10 z-50 w-80 overflow-hidden rounded-2xl">
              <div className="relative border-b border-border/40 p-2">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('common.search')}
                  className="w-full rounded-xl bg-secondary/40 px-2 py-1.5 pl-8 text-sm outline-none"
                />
              </div>
              <div className="max-h-72 overflow-y-auto p-1">
                <button
                  onClick={() => {
                    addPerson(spawnAt())
                    setPickerOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <UserPlus className="h-4 w-4 text-primary" />
                  {t('board.newPerson')}
                </button>
                {matches.length > 0 && <div className="my-1 h-px bg-border" />}
                {matches.map((p) => {
                  const yrs = [yearOf(p.birthDate), yearOf(p.deathDate)].join('–').replace(/^–$/, '')
                  const place = (p.birthPlace ?? '').split(',')[0].trim()
                  const sub = [yrs, place, p.occupation?.trim()].filter(Boolean).join(' · ')
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        addPerson(spawnAt(), { id: p.id, label: fullName(p) })
                        setPickerOpen(false)
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-8 w-8 text-[10px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{fullName(p)}</span>
                        {sub && (
                          <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
                {q.trim() && matches.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">—</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <Button variant="ghost" size="sm" className="gap-2" onClick={() => addMystery(spawnAt())}>
        <HelpCircle className="h-4 w-4 text-slate-400" />
        <span className="hidden md:inline">{t('board.addMystery')}</span>
      </Button>

      <Button variant="ghost" size="sm" className="gap-2" onClick={() => addDocuments(spawnAt())}>
        <FileImage className="h-4 w-4 text-sky-400" />
        <span className="hidden md:inline">{t('board.addEvidence')}</span>
      </Button>

      <Button variant="ghost" size="sm" className="gap-2" onClick={() => addLink(spawnAt())}>
        <Globe className="h-4 w-4 text-sky-500" />
        <span className="hidden md:inline">{t('board.addLink')}</span>
      </Button>

      {/* Map snippet: type an address, pick a result → a paper map piece. */}
      <div className="relative">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => (mapOpen ? setMapOpen(false) : openMap())}>
          <MapPin className="h-4 w-4 text-emerald-600" />
          <span className="hidden md:inline">{t('board.addMap')}</span>
        </Button>
        {mapOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMapOpen(false)} />
            <div className="glass-strong absolute left-0 top-10 z-50 w-80 overflow-hidden rounded-2xl">
              <div className="relative border-b border-border/40 p-2">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  ref={mapInputRef}
                  value={mapQ}
                  onChange={(e) => {
                    setMapQ(e.target.value)
                    setMapSearched(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runMapSearch()
                  }}
                  placeholder={t('board.mapSearchPlaceholder')}
                  className="w-full rounded-xl bg-secondary/40 px-2 py-1.5 pl-8 pr-9 text-sm outline-none"
                />
                {/* Clickable lookup trigger (besides Enter). */}
                <button
                  type="button"
                  title={t('geo.searchBtn')}
                  aria-label={t('geo.searchBtn')}
                  disabled={mapBusy}
                  onClick={() => void runMapSearch()}
                  className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto p-1">
                {mapBusy && <p className="px-2 py-3 text-center text-xs text-muted-foreground">…</p>}
                {!mapBusy &&
                  mapResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => pickMap(r)}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                    </button>
                  ))}
                {!mapBusy && !mapSearched && mapQ.trim().length >= 3 && mapResults.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t('geo.pressEnter')}</p>
                )}
                {!mapBusy && mapSearched && mapResults.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">—</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <Button variant="ghost" size="sm" className="gap-2" onClick={() => addZone(spawnAt())}>
        <Group className="h-4 w-4 text-indigo-400" />
        <span className="hidden md:inline">{t('board.addZone')}</span>
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Button variant="ghost" size="sm" className="gap-2" onClick={magicOrganize} title={t('boards.organize')}>
        <Sparkles className="h-4 w-4 text-amber-400" />
        <span className="hidden lg:inline">{t('boards.organize')}</span>
      </Button>
    </div>
  )
}
