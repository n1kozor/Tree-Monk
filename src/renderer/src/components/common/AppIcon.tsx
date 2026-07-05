/**
 * The TreeMonk app icon — the refined sprout mark (a stem with two pointed
 * leaves + veins) in white on a teal squircle. Same geometry as the launch
 * splash sprout. Inlined as SVG so it scales crisply and needs no asset import.
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
      {/* Stem */}
      <path d="M256 424 L256 300" stroke="#ffffff" strokeWidth="26" strokeLinecap="round" fill="none" />
      {/* Left leaf */}
      <path d="M256 320 C287.5 252.3 219 188.5 182.4 169 C175.2 209.9 183.2 303.1 256 320 Z" fill="#ffffff" />
      <line x1="256" y1="320" x2="210.3" y2="226.4" stroke="#0d7a6e" strokeOpacity="0.35" strokeWidth="10" strokeLinecap="round" />
      {/* Right leaf */}
      <path d="M256 320 C328.8 303.1 336.8 209.9 329.6 169 C293 188.5 224.5 252.3 256 320 Z" fill="#ffffff" fillOpacity="0.92" />
      <line x1="256" y1="320" x2="301.7" y2="226.4" stroke="#0d7a6e" strokeOpacity="0.3" strokeWidth="10" strokeLinecap="round" />
    </svg>
  )
}
