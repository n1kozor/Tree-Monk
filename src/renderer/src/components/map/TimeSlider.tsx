import { useCallback } from 'react'

/** A dual-handle year range slider (Time Machine). */
export function TimeSlider({
  min,
  max,
  lo,
  hi,
  onChange
}: {
  min: number
  max: number
  lo: number
  hi: number
  onChange: (lo: number, hi: number) => void
}): JSX.Element {
  const span = Math.max(1, max - min)
  const pct = (v: number): number => ((v - min) / span) * 100

  const setLo = useCallback(
    (v: number) => onChange(Math.min(v, hi), hi),
    [hi, onChange]
  )
  const setHi = useCallback(
    (v: number) => onChange(lo, Math.max(v, lo)),
    [lo, onChange]
  )

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-medium tabular-nums text-foreground">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
      <div className="relative h-5">
        {/* track */}
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-border" />
        {/* active range */}
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={lo}
          onChange={(e) => setLo(Number(e.target.value))}
          className="tm-range pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={hi}
          onChange={(e) => setHi(Number(e.target.value))}
          className="tm-range pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent"
        />
      </div>
    </div>
  )
}
