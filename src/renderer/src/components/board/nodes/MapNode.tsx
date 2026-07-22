import { memo, useMemo } from 'react'
import { type NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBoardStore, type BoardNodeData } from '../useBoardStore'
import { rotationFor } from '../nodeUtil'
import { NodeHandles } from './NodeHandles'
import { ThreadPins } from './ThreadPins'

const SPRING = { type: 'spring', stiffness: 520, damping: 32 } as const
const ZOOM = 13
const TILE = 256

/** Web-Mercator tile coords for a lat/lng at a zoom level (fractional). */
function project(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const latRad = (lat * Math.PI) / 180
  return {
    x: ((lng + 180) / 360) * n * TILE,
    y: ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n * TILE
  }
}

/** A static raster map centred on (lat,lng), filling w×h. No interactivity —
 *  it's a torn map fragment for the corkboard. Tiles come from Carto (NOT from
 *  tile.openstreetmap.org: the OSMF tile policy forbids distributed apps using
 *  the community tile server). © OpenStreetMap © CARTO (required). */
function MapTiles({ lat, lng, w, h }: { lat: number; lng: number; w: number; h: number }): JSX.Element {
  const tiles = useMemo(() => {
    const n = 2 ** ZOOM
    const c = project(lat, lng, ZOOM)
    const left = c.x - w / 2
    const top = c.y - h / 2
    const out: { src: string; left: number; top: number }[] = []
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + h) / TILE); ty++) {
        if (ty < 0 || ty >= n) continue
        const wx = ((tx % n) + n) % n
        out.push({
          src: `https://${'abcd'[(wx + ty) % 4]}.basemaps.cartocdn.com/rastertiles/voyager/${ZOOM}/${wx}/${ty}.png`,
          left: tx * TILE - left,
          top: ty * TILE - top
        })
      }
    }
    return out
  }, [lat, lng, w, h])

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ filter: 'sepia(0.45) contrast(0.92) brightness(1.05) saturate(0.8)' }}>
      {tiles.map((t, i) => (
        <img
          key={i}
          src={t.src}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute select-none"
          style={{ left: t.left, top: t.top, width: TILE, height: TILE }}
        />
      ))}
    </div>
  )
}

/** A paper-style map snippet pinned to a place. */
function MapNodeImpl({ id, data, selected, dragging }: NodeProps): JSX.Element {
  const d = data as BoardNodeData
  const cork = useBoardStore((s) => s.boardMode === 'corkboard')
  const rotate = cork ? rotationFor(id) : 0

  const w = d.width ?? 260
  const h = d.height ?? 200
  const [lat, lng] = (d.content ?? '').split(',').map(Number)
  const valid = Number.isFinite(lat) && Number.isFinite(lng)

  return (
    <div className="relative" style={{ width: w, transform: rotate ? `rotate(${rotate}deg)` : undefined }}>
      <NodeHandles />
      {cork && <ThreadPins nodeId={id} />}
      <motion.div
        animate={{ scale: dragging ? 1.04 : 1 }}
        transition={SPRING}
        className={cn(
          'relative w-full overflow-hidden',
          cork
            ? 'rounded-[2px] shadow-[0_10px_22px_-10px_rgba(0,0,0,0.55)] ring-1 ring-black/10'
            : 'rounded-xl border border-border shadow-sm',
          selected && 'ring-2 ring-primary'
        )}
        // A warm "old map paper" mount around the tiles.
        style={{ background: '#efe3c8', padding: 6 }}
      >
        <div className="relative overflow-hidden rounded-[2px]" style={{ height: h }}>
          {valid ? (
            <MapTiles lat={lat} lng={lng} w={w - 12} h={h} />
          ) : (
            <div className="flex h-full items-center justify-center bg-amber-100 text-amber-700">
              <MapPin className="h-6 w-6" />
            </div>
          )}

          {/* Centre marker. */}
          {valid && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full drop-shadow">
              <MapPin className="h-7 w-7 fill-red-500/90 text-red-700" strokeWidth={1.5} />
            </div>
          )}

          {/* Vintage vignette + inner edge. */}
          <div className="pointer-events-none absolute inset-0 rounded-[2px] shadow-[inset_0_0_36px_rgba(80,60,20,0.45)]" />

          {/* Required OSM attribution. */}
          <span className="absolute bottom-0 right-0 z-10 bg-white/55 px-1 text-[8px] leading-tight text-zinc-700">
            © OpenStreetMap © CARTO
          </span>
        </div>

        {/* Place-name paper strip. */}
        {d.label && (
          <div className="mt-1 truncate px-1 text-center text-[12px] font-semibold text-zinc-800" title={d.label}>
            {d.label}
          </div>
        )}
      </motion.div>
    </div>
  )
}

export const MapNode = memo(MapNodeImpl)
