import { useMemo } from 'react'
import { motion, type Transition } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { BRAND, BRAND_GRADIENT } from '@/lib/brand'

/**
 * The launch splash — calm, premium, and it opens.
 *
 * A soft cream backdrop with a barely-there teal glow. A refined sprout unfurls
 * and gently pulses (a short "waiting" beat), then leaf by leaf it opens into a
 * full crown that quietly breathes. The TreeMonk wordmark rises with a clip-
 * reveal, a tagline fades up, and a slim teal bar shimmers. Flat, gentle, on
 * brand. Shown until the first data refresh completes, then it fades + lifts.
 */

const BASE_X = 60
const BASE_Y = 60 // the stem tip — every leaf grows from here
const BLOOM_AT = 1.55 // s: sprout waits & pulses, then the crown opens

type Leaf = {
  fill: string
  veinX: number
  veinY: number
  color: string
  origin: string
  delay: number
  kind: 'sprout' | 'crown'
}

/** Build one symmetric, pointed leaf that grows from (BASE_X, BASE_Y) at a
 *  given angle (0 = straight up), plus its central vein endpoint. */
function makeLeaf(angleDeg: number, len: number, w: number): { fill: string; veinX: number; veinY: number } {
  const rad = (angleDeg * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad) // leaf axis (up at 0°)
  const px = Math.cos(rad)
  const py = Math.sin(rad) // perpendicular
  const n = (v: number): number => Math.round(v * 10) / 10
  const at = (t: number, off: number): [number, number] => [
    n(BASE_X + dx * len * t + px * off),
    n(BASE_Y + dy * len * t + py * off)
  ]
  const tip = at(1, 0)
  const c1 = at(0.28, w)
  const c2 = at(0.8, w * 0.42)
  const c3 = at(0.8, -w * 0.42)
  const c4 = at(0.28, -w)
  const vein = at(0.62, 0)
  return {
    fill: `M ${BASE_X} ${BASE_Y} C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${tip[0]} ${tip[1]} C ${c3[0]} ${c3[1]} ${c4[0]} ${c4[1]} ${BASE_X} ${BASE_Y} Z`,
    veinX: vein[0],
    veinY: vein[1]
  }
}

export function Preloader(): JSX.Element {
  const { t } = useTranslation()

  const { sprout, crown } = useMemo(() => {
    const T = BRAND.teal
    const L = BRAND.tealLight
    const D = BRAND.deep
    // angle, length, width, colour, bloom-order (crown only)
    const spec: [number, number, number, string, 'sprout' | 'crown', number][] = [
      [-22, 40, 14, T, 'sprout', 0],
      [22, 40, 14, D, 'sprout', 0],
      [0, 45, 15, L, 'crown', 0],
      [-42, 35, 13, L, 'crown', 1],
      [42, 35, 13, T, 'crown', 1],
      [-62, 28, 11, D, 'crown', 2],
      [62, 28, 11, D, 'crown', 2],
      [-82, 21, 10, T, 'crown', 3],
      [82, 21, 10, L, 'crown', 3],
      [-101, 16, 8, D, 'crown', 4],
      [101, 16, 8, T, 'crown', 4]
    ]
    const leaves: Leaf[] = spec.map(([a, len, w, color, kind, order]) => {
      const geo = makeLeaf(a, len, w)
      return {
        ...geo,
        color,
        origin: `${BASE_X}px ${BASE_Y}px`,
        kind,
        delay: kind === 'sprout' ? (a < 0 ? 0.5 : 0.62) : BLOOM_AT + order * 0.11
      }
    })
    return { sprout: leaves.filter((l) => l.kind === 'sprout'), crown: leaves.filter((l) => l.kind === 'crown') }
  }, [])

  const grow: Transition = { type: 'spring', stiffness: 240, damping: 18 }
  const renderLeaf = (l: Leaf, key: number): JSX.Element => (
    <motion.g
      key={key}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      style={{ transformOrigin: l.origin }}
      transition={{ ...grow, delay: l.delay }}
    >
      <path d={l.fill} fill={l.color} fillOpacity={0.96} />
      <line x1={BASE_X} y1={BASE_Y} x2={l.veinX} y2={l.veinY} stroke="#ffffff" strokeOpacity={0.22} strokeWidth={1.4} strokeLinecap="round" />
    </motion.g>
  )

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #fbfaf6 0%, #f2f7f4 100%)' }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Barely-there teal glow, slowly breathing. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(42vw 42vw at 50% 42%, rgba(22,194,173,0.10), transparent 70%)' }}
        animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.06, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative flex flex-col items-center">
        <svg width="150" height="150" viewBox="0 0 120 120" fill="none" className="mb-2">
          {/* Stem */}
          <motion.path
            d="M60 112 L60 60"
            stroke={BRAND.deep}
            strokeWidth="4"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.55, ease: 'easeOut' }}
          />

          {/* Whole crown — slow breathe + a whisper of sway once open. */}
          <motion.g
            initial={{ scale: 1, rotate: 0 }}
            animate={{ scale: [1, 1.03, 1], rotate: [0, 1.2, 0, -1.2, 0] }}
            transition={{
              scale: { delay: BLOOM_AT + 0.4, duration: 4.5, repeat: Infinity, ease: 'easeInOut' },
              rotate: { delay: BLOOM_AT + 0.4, duration: 9, repeat: Infinity, ease: 'easeInOut' }
            }}
            style={{ transformOrigin: `${BASE_X}px ${BASE_Y}px` }}
          >
            {/* Sprout leaves appear first, then pulse gently during the wait. */}
            <motion.g
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.07, 1, 1.05, 1] }}
              transition={{ delay: 0.72, duration: BLOOM_AT - 0.72, times: [0, 0.28, 0.5, 0.76, 1], ease: 'easeInOut' }}
              style={{ transformOrigin: `${BASE_X}px ${BASE_Y}px` }}
            >
              {sprout.map(renderLeaf)}
            </motion.g>
            {crown.map((l, i) => renderLeaf(l, 100 + i))}
          </motion.g>
        </svg>

        {/* Wordmark — clip-reveal (rises from a mask). */}
        <div className="overflow-hidden">
          <motion.div
            className="flex items-baseline text-[44px] font-extrabold leading-none tracking-tight"
            initial={{ y: '110%' }}
            animate={{ y: '0%' }}
            transition={{ delay: 0.4, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <span style={{ background: BRAND_GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              Tree
            </span>
            <span style={{ color: BRAND.ink }}>Monk</span>
          </motion.div>
        </div>

        {/* Tagline. */}
        <motion.p
          className="mt-2 text-[13px] font-medium tracking-wide text-[#6b7a75]"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.6 }}
        >
          {t('preloader.tagline')}
        </motion.p>

        {/* Slim shimmer progress bar. */}
        <motion.div
          className="mt-7 h-[3px] w-44 overflow-hidden rounded-full"
          style={{ background: 'rgba(22,194,173,0.15)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.15, duration: 0.4 }}
        >
          <motion.div
            className="h-full w-1/2 rounded-full"
            style={{ background: `linear-gradient(90deg, transparent, ${BRAND.teal}, transparent)` }}
            animate={{ x: ['-120%', '340%'] }}
            transition={{ delay: 1.25, duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      </div>
    </motion.div>
  )
}
