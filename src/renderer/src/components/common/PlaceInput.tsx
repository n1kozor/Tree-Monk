import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, MapPin, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { GeoResult } from '@shared/types'

/**
 * A place text field backed by Nominatim — POLICY-CONFORM: typing never sends
 * a request (Nominatim's usage policy forbids as-you-type autocomplete). ONE
 * lookup runs when the user presses Enter or leaves the field after editing;
 * the suggestions then pop up and stay clickable even though the field lost
 * focus. Picking a suggestion stores the canonical name AND persists its
 * lat/lon into the gazetteer (for the map).
 */
export function PlaceInput({
  value,
  onChange,
  onCommit,
  placeholder,
  className
}: {
  value: string
  onChange: (value: string) => void
  onCommit?: () => void
  placeholder?: string
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const [results, setResults] = useState<GeoResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState(value)
  /** True once the user actually edited the text (external sync resets it) —
   *  tabbing through untouched fields must not fire lookups. */
  const dirtyRef = useRef(false)
  /** The last string we looked up — never repeat the identical request. */
  const lastSearchedRef = useRef('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
    dirtyRef.current = false
  }, [value])

  // The dropdown can outlive the input's focus (blur-triggered search), so
  // close it on any click outside the component.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const runSearch = async (q: string): Promise<void> => {
    const trimmed = q.trim()
    if (trimmed.length < 3 || trimmed === lastSearchedRef.current) return
    lastSearchedRef.current = trimmed
    setLoading(true)
    const r = await window.api.geo.search(trimmed).catch(() => [])
    setLoading(false)
    setResults(r)
    setOpen(r.length > 0)
  }

  const pick = (r: GeoResult): void => {
    setQuery(r.name)
    onChange(r.name)
    dirtyRef.current = false
    // Picking IS the resolution — leaving the field must not look it up again.
    lastSearchedRef.current = r.name.trim()
    setOpen(false)
    setResults([])
    window.api.geo.savePlace(r)
    onCommit?.()
  }

  return (
    <div className="relative" ref={rootRef}>
      <Input
        value={query}
        placeholder={placeholder}
        title={t('geo.searchHint')}
        className={cn('pr-9', className)}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange(e.target.value)
          dirtyRef.current = true
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void runSearch(query)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        onFocus={() => {
          if (results.length) setOpen(true)
        }}
        onBlur={() => {
          // Delay so a suggestion click registers first.
          setTimeout(() => {
            onCommit?.()
            // The policy-conform lookup: fires on LEAVING the field, and only
            // when the user actually changed the text.
            if (dirtyRef.current) void runSearch(query)
          }, 150)
        }}
      />
      {/* Clickable lookup trigger (besides Enter / leaving the field). */}
      <button
        type="button"
        title={t('geo.searchBtn')}
        aria-label={t('geo.searchBtn')}
        disabled={loading}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void runSearch(query)}
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      </button>
      {open && results.length > 0 && (
        <div className="glass-strong absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-2xl p-1">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
              className="flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left text-xs hover:bg-accent"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="line-clamp-2">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
