import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import type { ReleaseEntry } from '@shared/types'
import { cn } from '@/lib/utils'
import { localizeReleaseNotes } from '@/lib/releaseNotes'
import { Markdown } from '@/components/common/Markdown'

/** Compare two semver-ish strings → negative if a<b, positive if a>b. */
function cmpVersion(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x - y
  }
  return 0
}

export function ChangelogView(): JSX.Element {
  const { t, i18n } = useTranslation()
  const [releases, setReleases] = useState<ReleaseEntry[] | null>(null)
  const [current, setCurrent] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setFailed(false)
    try {
      const [list, ver] = await Promise.all([
        window.api.updates?.history?.() ?? Promise.resolve([]),
        window.api.updates?.version?.() ?? Promise.resolve('')
      ])
      setReleases(list)
      setCurrent(ver)
      if (!list || list.length === 0) setFailed(true)
    } catch {
      setFailed(true)
      setReleases([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const newerCount = useMemo(
    () => (releases && current ? releases.filter((r) => cmpVersion(r.version, current) > 0).length : 0),
    [releases, current]
  )

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-tight">{t('changelog.title')}</h1>
          <p className="truncate text-xs text-muted-foreground">{t('changelog.subtitle')}</p>
        </div>
        {current && (
          <span className="rounded-xl border border-border/40 bg-secondary/40 px-2.5 py-1 font-mono text-xs text-muted-foreground">
            {t('changelog.current', { version: current })}
          </span>
        )}
        <button
          onClick={() => void load()}
          disabled={loading}
          title={t('changelog.refresh')}
          className="flex items-center gap-1.5 rounded-xl border border-border/40 px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-accent disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t('changelog.refresh')}
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && !releases ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('changelog.loading')}
          </div>
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
            <p>{t('changelog.loadFailed')}</p>
            <button onClick={() => void load()} className="rounded-xl border border-border/40 px-3 py-1.5 text-xs hover:bg-accent">
              {t('changelog.refresh')}
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            {newerCount > 0 && (
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                <Sparkles className="h-4 w-4 shrink-0" />
                {t('changelog.newSince', { count: newerCount, version: current })}
              </div>
            )}

            <ol className="relative space-y-5 border-l border-border/40 pl-6">
              {releases?.map((r) => {
                const rel = current ? cmpVersion(r.version, current) : 0
                const isNew = rel > 0
                const isCurrent = rel === 0 && r.version.replace(/^v/i, '') === current.replace(/^v/i, '')
                const notes = localizeReleaseNotes(r.body, i18n.language)
                return (
                  <li key={r.version} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-background',
                        isNew ? 'bg-amber-500' : isCurrent ? 'bg-primary' : 'bg-muted-foreground/40'
                      )}
                    />
                    <div
                      className={cn(
                        'glass glass-hover rounded-2xl p-4 text-card-foreground',
                        isNew ? 'border-amber-500/40' : isCurrent ? 'border-primary/40' : ''
                      )}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">v{r.version}</span>
                        {isNew && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            {t('changelog.badgeNew')}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                            {t('changelog.badgeCurrent')}
                          </span>
                        )}
                        {r.prerelease && (
                          <span className="rounded-full bg-secondary/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {t('changelog.badgePre')}
                          </span>
                        )}
                        {r.publishedAt && (
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(r.publishedAt).toLocaleDateString(i18n.language, {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </span>
                        )}
                        {r.url && (
                          <button
                            onClick={() => r.url && void window.api.app.openExternal(r.url)}
                            className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t('changelog.viewOnGithub')}
                          </button>
                        )}
                      </div>
                      {notes ? (
                        <div className="text-sm text-foreground/80">
                          <Markdown>{notes}</Markdown>
                        </div>
                      ) : (
                        <p className="text-sm italic text-muted-foreground">{r.name ?? '—'}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
