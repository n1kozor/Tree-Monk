import { memo } from 'react'
import { useBoardStore } from '../useBoardStore'
import { jitterFor, pinColor, tiltFor } from '../nodeUtil'

/** Where each named handle sits on the card box, as a percentage. Mirrors the
 *  geometry in NodeHandles so a pin lands exactly where its thread is tied. */
const HANDLE_POS: Record<string, [number, number]> = {
  top: [50, 0],
  right: [100, 50],
  bottom: [50, 100],
  left: [0, 50],
  'top-left': [0, 0],
  'top-right': [100, 0],
  'bottom-left': [0, 100],
  'bottom-right': [100, 100]
}

/**
 * Real pushpins on the card edges. Every card gets one "anchor" pin holding it
 * to the board; every thread tied to the card adds a pin at the exact handle it
 * connects to — placed a touch off-centre and tilted, in assorted colours, so
 * the board reads like a hand-pinned corkboard rather than a tidy diagram.
 */
function ThreadPinsImpl({ nodeId, anchor = 'top' }: { nodeId: string; anchor?: string }): JSX.Element {
  // A primitive key of the occupied handles → this node only re-renders when its
  // own thread connections change, not on every edge edit elsewhere.
  const key = useBoardStore((s) => {
    let k = ''
    for (const e of s.edges) {
      if (e.source === nodeId) k += (e.sourceHandle || 'top') + '|'
      else if (e.target === nodeId) k += (e.targetHandle || 'top') + '|'
    }
    return k
  })

  const handles = new Set<string>([anchor])
  for (const h of key.split('|')) if (h && HANDLE_POS[h]) handles.add(h)

  return (
    <>
      {[...handles].map((h) => {
        const [x, y] = HANDLE_POS[h] ?? HANDLE_POS.top
        const seed = `${nodeId}:${h}`
        const { dx, dy } = jitterFor(seed)
        return (
          <span
            key={h}
            className="tm-pushpin"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              ['--pc' as string]: pinColor(seed),
              ['--tx' as string]: `${dx}px`,
              ['--ty' as string]: `${dy}px`,
              ['--rot' as string]: `${tiltFor(seed)}deg`
            }}
          />
        )
      })}
    </>
  )
}

export const ThreadPins = memo(ThreadPinsImpl)
