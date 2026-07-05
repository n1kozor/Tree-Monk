import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TreeDeciduous } from 'lucide-react'
import { isFsMode } from '@/lib/fsMode'

/**
 * Top-bar indicator: when the user is signed in to FamilySearch, shows a small
 * "FamilySearch" badge so it's obvious the app is in FamilySearch mode. Hidden
 * entirely when no AppKey is configured (public builds) or when signed out, so
 * updating the app never surfaces FamilySearch UI to users without a key.
 *
 * Re-checks on the custom `fs-auth-changed` event (dispatched by the sign-in /
 * sign-out flow) so it updates live without polling.
 */
export function FamilySearchStatusBadge(): JSX.Element | null {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)

  useEffect(() => {
    let alive = true
    const check = async (): Promise<void> => {
      const [cfg, si] = await Promise.all([
        window.api.familysearch.configured(),
        window.api.familysearch.signedIn()
      ])
      if (alive) setShow(cfg && si && isFsMode())
    }
    void check()
    const onChange = (): void => void check()
    window.addEventListener('fs-auth-changed', onChange)
    window.addEventListener('fs-mode-changed', onChange)
    return () => {
      alive = false
      window.removeEventListener('fs-auth-changed', onChange)
      window.removeEventListener('fs-mode-changed', onChange)
    }
  }, [])

  if (!show) return null
  return (
    <span
      title={t('fs.connected')}
      className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
    >
      <TreeDeciduous className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">FamilySearch</span>
    </span>
  )
}
