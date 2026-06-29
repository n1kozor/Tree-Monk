import { qualityTone, QUALITY_COLOR } from '@/lib/completeness'
import { cn } from '@/lib/utils'

/**
 * Circular data-quality gauge: a progress ring (coloured by tone) with the
 * percentage in the middle. Used both per-person (small) and on the dashboard
 * (large). Pure SVG so it scales crisply at any size.
 */
export function QualityRing({
  value,
  size = 72,
  strokeWidth,
  showLabel = true,
  className,
  title
}: {
  value: number
  size?: number
  strokeWidth?: number
  showLabel?: boolean
  className?: string
  title?: string
}): JSX.Element {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const sw = strokeWidth ?? Math.max(4, Math.round(size * 0.12))
  const r = (size - sw) / 2
  const c = 2 * Math.PI * r
  const dash = (v / 100) * c
  const color = QUALITY_COLOR[qualityTone(v)]

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      title={title}
      role="img"
      aria-label={`${v}%`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={sw} className="text-secondary" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-bold tabular-nums leading-none" style={{ fontSize: Math.max(11, size * 0.26), color }}>
            {v}
            <span style={{ fontSize: Math.max(8, size * 0.16) }}>%</span>
          </span>
        </div>
      )}
    </div>
  )
}
