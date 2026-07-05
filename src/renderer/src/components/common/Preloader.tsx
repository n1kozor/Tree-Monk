import { useMemo } from 'react'
import { motion, type Transition } from 'framer-motion'

/**
 * The launch splash — a family tree drawing itself in, calm and flat.
 *
 * A single-stroke tree gently sketches itself onto a soft TreeMonk-teal wash:
 * the trunk rises and the branches draw outward, generation by generation, in
 * the brand colour. No nodes, no dots — just clean lines and the wordmark
 * fading up beneath. Shown until the first data refresh completes, then it
 * softly fades away.
 */

interface Seg {
  d: string
  depth: number
  sw: number
}

const MAX_DEPTH = 5
const VW = 1600
const VH = 900
const ROOT_X = VW / 2
const ROOT_Y = VH - 60

/** A symmetric, softly-arced tree growing upward — lines only. */
function buildTree(): Seg[] {
  const segs: Seg[] = []
  const spread = 0.42
  const grow = (x: number, y: number, angle: number, len: number, depth: number): void => {
    if (depth > MAX_DEPTH) return
    const x2 = x + Math.sin(angle) * len
    const y2 = y - Math.cos(angle) * len
    const mx = (x + x2) / 2
    const my = (y + y2) / 2
    const side = angle >= 0 ? 1 : -1
    const k = len * 0.16 * side
    const cx = mx + Math.cos(angle) * k
    const cy = my + Math.sin(angle) * k
    segs.push({ d: `M ${x} ${y} Q ${cx} ${cy} ${x2} ${y2}`, depth, sw: Math.max(1.5, 9 - depth * 1.4) })
    const nlen = len * 0.73
    grow(x2, y2, angle - spread, nlen, depth + 1)
    grow(x2, y2, angle + spread, nlen, depth + 1)
  }
  grow(ROOT_X, ROOT_Y, 0, 230, 1)
  return segs
}

const branchTransition = (depth: number): Transition => ({
  pathLength: { delay: (depth - 1) * 0.4, duration: 0.9, ease: 'easeInOut' },
  opacity: { delay: (depth - 1) * 0.4, duration: 0.5 }
})

export function Preloader(): JSX.Element {
  const segs = useMemo(buildTree, [])

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #f2fbf9 0%, #e3f5f0 55%, #d3ede6 100%)' }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
    >
      {/* Very soft brand-teal wash, slowly breathing. */}
      <motion.div
        className="absolute inset-0 -z-10"
        style={{ background: 'radial-gradient(55vw 45vw at 50% 30%, rgba(22,194,173,0.12), transparent 70%)' }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* The tree, lines only, in TreeMonk teal. */}
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMax slice" fill="none">
        <g stroke="#16c2ad" strokeLinecap="round" strokeOpacity={0.9}>
          {segs.map((s, i) => (
            <motion.path
              key={i}
              d={s.d}
              strokeWidth={s.sw}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={branchTransition(s.depth)}
            />
          ))}
        </g>
      </svg>

      {/* Wordmark, simply fading up. */}
      <motion.div
        className="relative flex flex-col items-center gap-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4, duration: 0.9, ease: 'easeOut' }}
      >
        <div className="flex items-baseline text-5xl font-extrabold tracking-tight">
          <span style={{ color: '#16c2ad' }}>Tree</span>
          <span style={{ color: '#0d7a6e' }}>Monk</span>
        </div>
        {/* A thin brand-teal progress line quietly sweeping. */}
        <div className="h-[3px] w-40 overflow-hidden rounded-full" style={{ background: 'rgba(22,194,173,0.18)' }}>
          <motion.div
            className="h-full w-1/3 rounded-full"
            style={{ background: 'linear-gradient(90deg, transparent, #16c2ad, transparent)' }}
            animate={{ x: ['-140%', '340%'] }}
            transition={{ delay: 1.6, duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </motion.div>
    </motion.div>
  )
}
