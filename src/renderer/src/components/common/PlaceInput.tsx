import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { GeoResult } from '@shared/types'

/**
 * A place text field with Nominatim autocomplete. Picking a suggestion stores
 * the canonical name AND persists its lat/lon into the gazetteer (for the map).
 */
export function PlaceInput({
  value,
  onChange,
  onCommit
}: {
  value: string
  onChange: (value: string) => void
  onCommit?: () => void
}): JSX.Element {
  const [results, setResults] = useState<GeoResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState(value)
  const skipRef = useRef(false)

  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false
      return
    }
    // Only autocomplete while the field is actually focused — never auto-open
    // just because the panel mounted with an existing place value.
    if (!focused) return
    if (query.trim().length < 3) {
      setResults([])
      return
    }
    setLoading(true)
    const id = setTimeout(async () => {
      const r = await window.api.geo.search(query).catch(() => [])
      setResults(r)
      setOpen(r.length > 0)
      setLoading(false)
    }, 400)
    return () => clearTimeout(id)
  }, [query, focused])

  const pick = (r: GeoResult): void => {
    skipRef.current = true
    setQuery(r.name)
    onChange(r.name)
    setOpen(false)
    setResults([])
    window.api.geo.savePlace(r)
    onCommit?.()
  }

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange(e.target.value)
        }}
        onFocus={() => {
          setFocused(true)
          if (results.length) setOpen(true)
        }}
        onBlur={() => {
          // Delay so a suggestion click registers first.
          setTimeout(() => {
            setFocused(false)
            setOpen(false)
            onCommit?.()
          }, 150)
        }}
      />
      {loading && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
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
