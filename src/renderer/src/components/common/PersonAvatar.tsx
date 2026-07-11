import { memo, useEffect, useState } from 'react'
import { User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mediaThumb } from '@/lib/mediaUrl'
import { frameStyle, parseFrame } from '@/lib/photoFrame'
import { useAppStore } from '@/store/useAppStore'
import { useSettings } from '@/store/useSettings'
import type { Sex } from '@shared/types'

function tint(sex?: Sex): string {
  if (sex === 'F') return 'bg-pink-500/20 text-pink-600 dark:text-pink-300'
  if (sex === 'M') return 'bg-teal-500/20 text-teal-700 dark:text-teal-300'
  return 'bg-zinc-500/20 text-zinc-600 dark:text-zinc-300'
}

/** Shows the person's profile photo when available, otherwise a tinted
 *  silhouette (never initials). When the verification setting is on, the whole
 *  avatar gets a coloured frame: green (verified) / amber (not verified). */
function PersonAvatarImpl({
  personId,
  name,
  sex,
  className,
  noPhoto
}: {
  personId?: string
  name: string
  sex?: Sex
  className?: string
  /** Force the silhouette and skip the image entirely — used by the tree's
   *  level-of-detail to avoid decoding dozens of portraits when zoomed out. */
  noPhoto?: boolean
}): JSX.Element {
  // O(1) lookup; the selector returns a primitive (photo id or null) so the
  // avatar only re-renders when ITS person's photo actually changes.
  const photoId = useAppStore((s) =>
    personId ? s.peopleById.get(personId)?.profilePhotoId ?? null : null
  )
  // Stored framing (pan/zoom) as a primitive string so the selector stays cheap.
  const cropJson = useAppStore((s) =>
    personId ? s.peopleById.get(personId)?.profilePhotoCrop ?? null : null
  )
  // Verification frame — only when the setting is on. Primitive selectors keep it cheap.
  const showMarks = useSettings((s) => s.verificationMarks)
  const verified = useAppStore((s) =>
    personId ? s.peopleById.get(personId)?.verified ?? false : false
  )
  // Coloured ring class (empty when the setting is off). Placed LAST in cn() so
  // twMerge lets it win over any ring a caller passed.
  const ring =
    !showMarks || !personId
      ? ''
      : verified
        ? 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-background'
        : 'ring-2 ring-amber-500 ring-offset-1 ring-offset-background'

  // The photo loads natively via the tmedia:// protocol — no IPC/base64. On a
  // broken/missing file we fall back to the silhouette.
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [photoId])
  // A small thumbnail — avatars render at ~12–64px, so a 128px JPEG covers retina
  // while sparing the UI from decoding multi-megapixel originals en masse (the
  // family tree shows dozens at once). The disk thumbnail cache makes repeats free.
  const url = !noPhoto && photoId && !broken ? mediaThumb(photoId, 128) : null

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        !url && tint(sex),
        className,
        ring
      )}
    >
      {url ? (
        cropJson ? (
          // Framed: absolutely positioned, sized/placed by the stored crop.
          <img
            src={url}
            alt={name}
            style={frameStyle(parseFrame(cropJson))}
            draggable={false}
            onError={() => setBroken(true)}
          />
        ) : (
          <img
            src={url}
            alt={name}
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setBroken(true)}
          />
        )
      ) : (
        <User className="h-[58%] w-[58%]" strokeWidth={2} />
      )}
    </div>
  )
}

export const PersonAvatar = memo(PersonAvatarImpl)
