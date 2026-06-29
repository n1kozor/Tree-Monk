/**
 * The TreeMonk app icon (the same mark used for the build / window / taskbar):
 * a teal squircle with a minimalist white pedigree (1 root → 2 parents → 4
 * grandparents). Inlined as SVG so it scales crisply and needs no asset import.
 */
export function AppIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden role="img">
      <defs>
        <linearGradient id="tmAppIconGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#16c2ad" />
          <stop offset="1" stopColor="#0d7a6e" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="116" fill="url(#tmAppIconGrad)" />
      <g stroke="#ffffff" strokeWidth={18} strokeLinecap="round" fill="none" opacity={0.95}>
        <path d="M256 380 L170 264" />
        <path d="M256 380 L342 264" />
        <path d="M170 264 L120 158" />
        <path d="M170 264 L216 158" />
        <path d="M342 264 L296 158" />
        <path d="M342 264 L392 158" />
      </g>
      <g fill="#ffffff">
        <circle cx="256" cy="388" r="32" />
        <circle cx="170" cy="262" r="27" />
        <circle cx="342" cy="262" r="27" />
        <circle cx="120" cy="152" r="20" />
        <circle cx="216" cy="152" r="20" />
        <circle cx="296" cy="152" r="20" />
        <circle cx="392" cy="152" r="20" />
      </g>
    </svg>
  )
}
