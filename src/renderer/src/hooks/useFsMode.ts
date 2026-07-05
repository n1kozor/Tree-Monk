import { useEffect, useState } from 'react'
import { isFsMode } from '@/lib/fsMode'

/** Reactive FamilySearch-mode flag — updates live on mode changes. */
export function useFsMode(): boolean {
  const [on, setOn] = useState(isFsMode())
  useEffect(() => {
    const update = (): void => setOn(isFsMode())
    window.addEventListener('fs-mode-changed', update)
    return () => window.removeEventListener('fs-mode-changed', update)
  }, [])
  return on
}
