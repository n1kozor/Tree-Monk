import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCw, ShieldCheck } from 'lucide-react'
import { PluginIcon } from '@/components/plugins/PluginIcon'
import { useAppStore } from '@/store/useAppStore'
import { useTheme } from '@/store/useTheme'
import type { InstalledPlugin, PluginPanelInfo } from '@shared/types'
import { localizedPluginText } from '@/lib/plugins'

/**
 * Hosts one plugin menu entry in a sandboxed iframe. The frame gets NO Node,
 * no Electron and (via the tmplugin:// CSP) no network beyond 127.0.0.1 — it
 * can only talk to the local API with the plugin's own scoped token, which is
 * handed over in the URL hash (never part of a request the page could leak).
 */
export function PluginHost(): JSX.Element {
  const { t, i18n } = useTranslation()
  const theme = useTheme((s) => s.theme)
  const active = useAppStore((s) => s.activePlugin)
  const [info, setInfo] = useState<PluginPanelInfo | null>(null)
  const [plugin, setPlugin] = useState<InstalledPlugin | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    setInfo(null)
    setFailed(false)
    if (!active) return
    let alive = true
    void (async () => {
      try {
        const [panel, plugins] = await Promise.all([
          window.api.plugins.panel(active.pluginId, active.menuId),
          window.api.plugins.list()
        ])
        if (!alive) return
        setInfo(panel)
        setPlugin(plugins.find((p) => p.id === active.pluginId) ?? null)
        if (!panel) setFailed(true)
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [active, reloadNonce])

  const src = useMemo(() => {
    if (!info) return null
    // The panel inherits the app's UI language AND its light/dark theme (the
    // iframe reloads when either changes — panels are stateless views).
    const params = new URLSearchParams({
      token: info.token,
      api: info.apiBase,
      lang: i18n.language.slice(0, 2),
      theme
    })
    return `${info.url}#${params.toString()}`
  }, [info, i18n.language, theme])

  const menuTitle = useMemo(() => {
    const entry = plugin?.menu.find((m) => m.id === active?.menuId)
    return entry ? localizedPluginText(entry.title, i18n.language) : ''
  }, [plugin, active, i18n.language])

  return (
    <div className="flex h-full flex-col" data-testid="plugin-host">
      <div className="glass-subtle flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        {plugin ? <PluginIcon pluginId={plugin.id} icon={plugin.icon} className="h-4 w-4" /> : null}
        <span className="truncate text-sm font-semibold">
          {plugin ? `${plugin.name} — ${menuTitle}` : t('plugins.title')}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('plugins.sandboxBadge')}
        </span>
        <button
          type="button"
          title={t('plugins.reload')}
          onClick={() => setReloadNonce((n) => n + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      </div>
      {src ? (
        <iframe
          key={`${src}|${reloadNonce}`}
          src={src}
          sandbox="allow-scripts allow-forms"
          className="h-full w-full flex-1 border-0 bg-transparent"
          data-testid="plugin-frame"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {failed ? t('plugins.panelUnavailable') : '…'}
        </div>
      )}
    </div>
  )
}
