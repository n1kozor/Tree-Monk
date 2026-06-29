import { motion, type MotionProps, type Transition } from 'framer-motion'

/**
 * The launch splash: the TreeMonk mark drawing itself in. The squircle fades in,
 * the root node pops, the pedigree branches "draw" outward (animated stroke), and
 * the parent/grandparent nodes pop in staggered — with a gentle breathing pulse
 * and a shimmer bar while the database loads. Shown until the first data refresh
 * completes, then fades out.
 */
const branch = (delay: number): MotionProps => ({
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: 1, opacity: 0.95 },
  transition: {
    pathLength: { delay, duration: 0.5, ease: 'easeInOut' },
    opacity: { delay, duration: 0.2 }
  } as Transition
})

const node = (delay: number): MotionProps => ({
  initial: { scale: 0, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: { delay, type: 'spring', stiffness: 380, damping: 18 } as Transition
})

export function Preloader(): JSX.Element {
  return (
    <motion.div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-7 bg-background"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <motion.div
        className="relative"
        animate={{ scale: [1, 1.045, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* soft teal glow behind the mark */}
        <div
          className="absolute inset-0 -z-10 blur-2xl"
          style={{ background: 'radial-gradient(circle, rgba(22,194,173,0.40), transparent 65%)' }}
        />
        <motion.svg
          viewBox="0 0 512 512"
          className="h-28 w-28 drop-shadow-2xl"
          initial={{ scale: 0.82, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <defs>
            <linearGradient id="tmPreGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#16c2ad" />
              <stop offset="1" stopColor="#0d7a6e" />
            </linearGradient>
          </defs>
          <motion.rect
            x="16"
            y="16"
            width="480"
            height="480"
            rx="116"
            fill="url(#tmPreGrad)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          />
          <g stroke="#ffffff" strokeWidth={18} strokeLinecap="round" fill="none">
            <motion.path d="M256 380 L170 264" {...branch(0.35)} />
            <motion.path d="M256 380 L342 264" {...branch(0.35)} />
            <motion.path d="M170 264 L120 158" {...branch(0.72)} />
            <motion.path d="M170 264 L216 158" {...branch(0.8)} />
            <motion.path d="M342 264 L296 158" {...branch(0.72)} />
            <motion.path d="M342 264 L392 158" {...branch(0.8)} />
          </g>
          <g fill="#ffffff">
            <motion.circle cx="256" cy="388" r="32" {...node(0.18)} />
            <motion.circle cx="170" cy="262" r="27" {...node(0.85)} />
            <motion.circle cx="342" cy="262" r="27" {...node(0.85)} />
            <motion.circle cx="120" cy="152" r="20" {...node(1.15)} />
            <motion.circle cx="216" cy="152" r="20" {...node(1.22)} />
            <motion.circle cx="296" cy="152" r="20" {...node(1.15)} />
            <motion.circle cx="392" cy="152" r="20" {...node(1.22)} />
          </g>
        </motion.svg>
      </motion.div>

      <motion.div
        className="flex flex-col items-center gap-2.5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.5, ease: 'easeOut' }}
      >
        <span className="text-xl font-extrabold tracking-tight text-foreground">TreeMonk</span>
        <div className="h-1 w-28 overflow-hidden rounded-full bg-secondary">
          <motion.div
            className="h-full w-1/2 rounded-full bg-primary"
            animate={{ x: ['-60%', '160%'] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </motion.div>
    </motion.div>
  )
}
