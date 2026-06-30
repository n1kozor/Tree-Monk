import { useMemo } from 'react'
import { motion, type Transition } from 'framer-motion'

/**
 * The launch splash — a full-screen, cinematic "tree of life" growing itself in.
 *
 * A symmetric pedigree tree grows from the bottom of the screen, generation by
 * generation: every branch "draws" outward (animated stroke), each junction pops
 * a glowing node, and once the canopy is up the TreeMonk wordmark writes itself
 * onto a frosted-glass plate over a softly drifting teal aurora. Shown until the
 * first data refresh completes, then it fades + scales away.
 */

interface Seg {
  d: string
  depth: number
  sw: number
}
interface Nd {
  x: number
  y: number
  depth: number
  r: number
}

const MAX_DEPTH = 5
const VW = 1600
const VH = 900

/** Build a symmetric, gently-arced binary pedigree tree growing upward. */
function buildTree(): { segs: Seg[]; nodes: Nd[] } {
  const segs: Seg[] = []
  const nodes: Nd[] = [{ x: VW / 2, y: VH - 40, depth: 0, r: 17 }]
  const spread = 0.42

  const grow = (x: number, y: number, angle: number, len: number, depth: number): void => {
    if (depth > MAX_DEPTH) return
    const x2 = x + Math.sin(angle) * len
    const y2 = y - Math.cos(angle) * len
    // Gentle outward bow via a quadratic control point on the branch's perpendicular.
    const mx = (x + x2) / 2
    const my = (y + y2) / 2
    const side = angle >= 0 ? 1 : -1
    const k = len * 0.16 * side
    const cx = mx + Math.cos(angle) * k
    const cy = my + Math.sin(angle) * k
    segs.push({
      d: `M ${x} ${y} Q ${cx} ${cy} ${x2} ${y2}`,
      depth,
      sw: Math.max(2.2, 11 - depth * 1.5)
    })
    nodes.push({ x: x2, y: y2, depth, r: Math.max(3.5, 16 - depth * 2.3) })
    const nlen = len * 0.74
    grow(x2, y2, angle - spread, nlen, depth + 1)
    grow(x2, y2, angle + spread, nlen, depth + 1)
  }

  grow(VW / 2, VH - 40, 0, 250, 1)
  return { segs, nodes }
}

const branchTransition = (depth: number): Transition => ({
  pathLength: { delay: (depth - 1) * 0.3, duration: 0.62, ease: 'easeInOut' },
  opacity: { delay: (depth - 1) * 0.3, duration: 0.25 }
})

const nodeTransition = (depth: number): Transition => ({
  delay: depth * 0.3 + 0.12,
  type: 'spring',
  stiffness: 360,
  damping: 17
})

export function Preloader(): JSX.Element {
  const { segs, nodes } = useMemo(buildTree, [])

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-background"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.06 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    >
      {/* Drifting teal aurora behind everything. */}
      <motion.div
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60vw 60vw at 50% 110%, rgba(22,194,173,0.34), transparent 60%),' +
            'radial-gradient(45vw 45vw at 18% 12%, rgba(13,122,110,0.28), transparent 62%),' +
            'radial-gradient(45vw 45vw at 85% 18%, rgba(56,120,220,0.22), transparent 64%)'
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Full-screen growing tree. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMax slice"
        fill="none"
      >
        <defs>
          <linearGradient id="tmTreeStroke" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#0d7a6e" />
            <stop offset="0.55" stopColor="#16c2ad" />
            <stop offset="1" stopColor="#7af0e0" />
          </linearGradient>
          <radialGradient id="tmNode" cx="0.5" cy="0.42" r="0.6">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#7af0e0" />
            <stop offset="1" stopColor="#16c2ad" />
          </radialGradient>
        </defs>

        {/* Branches drawing themselves outward. */}
        <g stroke="url(#tmTreeStroke)" strokeLinecap="round">
          {segs.map((s, i) => (
            <motion.path
              key={i}
              d={s.d}
              strokeWidth={s.sw}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.96 }}
              transition={branchTransition(s.depth)}
            />
          ))}
        </g>

        {/* Junction + leaf nodes popping in. */}
        <g>
          {nodes.map((n, i) => (
            <motion.circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill="url(#tmNode)"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{ transformOrigin: `${n.x}px ${n.y}px` }}
              transition={nodeTransition(n.depth)}
            />
          ))}
        </g>
      </svg>

      {/* Frosted-glass plate: the wordmark writes itself in, then a shimmer bar. */}
      <motion.div
        className="glass-strong relative flex flex-col items-center gap-4 rounded-3xl px-12 py-8"
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.5, duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      >
        <svg viewBox="0 0 320 70" className="h-14 w-auto overflow-visible">
          <defs>
            <linearGradient id="tmWordFill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#16c2ad" />
              <stop offset="1" stopColor="#7af0e0" />
            </linearGradient>
          </defs>
          {/* Stroke layer "writes" the letters on. */}
          <motion.text
            x="160"
            y="50"
            textAnchor="middle"
            fontSize="54"
            fontWeight={800}
            letterSpacing="-1"
            fill="none"
            stroke="url(#tmWordFill)"
            strokeWidth={1.4}
            style={{
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              strokeDasharray: 1200
            }}
            initial={{ strokeDashoffset: 1200, opacity: 0 }}
            animate={{ strokeDashoffset: 0, opacity: 1 }}
            transition={{
              strokeDashoffset: { delay: 1.7, duration: 1.4, ease: 'easeInOut' },
              opacity: { delay: 1.7, duration: 0.3 }
            }}
          >
            TreeMonk
          </motion.text>
          {/* Fill fades in once the outline is drawn. */}
          <motion.text
            x="160"
            y="50"
            textAnchor="middle"
            fontSize="54"
            fontWeight={800}
            letterSpacing="-1"
            fill="url(#tmWordFill)"
            style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.7, duration: 0.6 }}
          >
            TreeMonk
          </motion.text>
        </svg>

        {/* A small spinner lingers under the wordmark while the DB finishes. */}
        <motion.div
          className="h-6 w-6 rounded-full border-[3px] border-primary/20 border-t-primary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, rotate: 360 }}
          transition={{
            opacity: { delay: 3, duration: 0.5 },
            rotate: { delay: 3, duration: 0.8, repeat: Infinity, ease: 'linear' }
          }}
        />
      </motion.div>
    </motion.div>
  )
}
