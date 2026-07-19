import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpCircle, Check, Download, ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { UpdateInfo } from '@shared/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { localizeReleaseNotes } from '@/lib/releaseNotes'
import { Markdown } from '@/components/common/Markdown'

/** Re-check GitHub for a newer release at most once every 6 hours per session. */
const RECHECK_MS = 6 * 60 * 60 * 1000
/** When refocusing the app, only re-check if the last check was over an hour ago. */
const FOCUS_RECHECK_MS = 60 * 60 * 1000
/** localStorage key holding the latest version we already auto-announced. */
const SEEN_KEY = 'treemonk.update.seen'

/**
 * Topbar widget: always shows the running version, and — when a newer GitHub
 * release exists — turns into a prominent "update available" button that opens
 * a dialog with the release notes and a one-click download.
 */
export function UpdateBadge(): JSX.Element {
  const { t, i18n } = useTranslation()
  const [version, setVersion] = useState<string>('')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  // Microsoft Store builds: the Store delivers updates, so the badge is a
  // plain version label — no check button, no download dialog.
  const [storeBuild, setStoreBuild] = useState(false)
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const lastCheck = useRef(0)

  const check = useCallback(async (announce = false): Promise<void> => {
    // Guard against a stale preload that predates the updates API.
    if (!window.api?.updates?.check) return
    lastCheck.current = Date.now()
    setChecking(true)
    try {
      const res = await window.api.updates.check()
      setInfo(res)
      if (res?.current) setVersion(res.current)
      if (res?.store) {
        setStoreBuild(true)
        return
      }
      if (res?.hasUpdate && res.latest) {
        // Auto-announce a freshly-detected version exactly once (per version):
        // pop the dialog open so the user sees the (localized) release notes.
        if (localStorage.getItem(SEEN_KEY) !== res.latest) {
          localStorage.setItem(SEEN_KEY, res.latest)
          setOpen(true)
        }
      } else if (announce) {
        toast.success(t('update.upToDate', { version: res.current }))
      }
    } catch {
      /* offline / rate-limited — keep showing the current version */
    } finally {
      setChecking(false)
    }
  }, [t])

  // Show the version instantly (no network), then check for updates in the
  // background, periodically, and whenever the app regains focus.
  useEffect(() => {
    window.api?.updates
      ?.version()
      .then(setVersion)
      .catch(() => undefined)
    void check()
    const id = setInterval(() => void check(), RECHECK_MS)
    const onFocus = (): void => {
      if (Date.now() - lastCheck.current > FOCUS_RECHECK_MS) void check()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [check])

  const onDownload = async (): Promise<void> => {
    if (!window.api?.updates?.download) return
    setDownloading(true)
    try {
      await window.api.updates.download()
      toast.success(t('update.downloadStarted'))
    } finally {
      setDownloading(false)
    }
  }

  const hasUpdate = !!info?.hasUpdate
  const notes = localizeReleaseNotes(info?.notes, i18n.language)

  if (storeBuild) {
    return (
      <span className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="tabular-nums">v{version || '…'}</span>
      </span>
    )
  }

  return (
    <>
      {hasUpdate ? (
        <button
          onClick={() => setOpen(true)}
          title={t('update.available', { version: info?.latest })}
          className="group flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-600 shadow-sm transition-colors hover:bg-amber-500/25 dark:text-amber-400"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <ArrowUpCircle className="h-4 w-4" />
          <span className="hidden md:inline">{t('update.newVersion')}</span>
          <span className="tabular-nums">v{info?.latest}</span>
        </button>
      ) : (
        <button
          onClick={() => void check(true)}
          title={t('update.checkNow')}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {checking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
          )}
          <span className="tabular-nums">v{version || '…'}</span>
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              {t('update.dialogTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 rounded-xl border border-border/40 bg-secondary/30 p-3 text-sm">
              <span className="rounded-md bg-background px-2.5 py-1 font-mono text-muted-foreground">
                v{info?.current}
              </span>
              <ArrowUpCircle className="h-4 w-4 text-amber-500" />
              <span className="rounded-md bg-amber-500/15 px-2.5 py-1 font-mono font-semibold text-amber-600 dark:text-amber-400">
                v{info?.latest}
              </span>
            </div>

            {info?.publishedAt && (
              <p className="text-center text-[11px] text-muted-foreground">
                {t('update.publishedOn', { date: new Date(info.publishedAt).toLocaleDateString() })}
              </p>
            )}

            {notes && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('update.notes')}
                </p>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-border/40 bg-background/50 p-3 text-foreground/80">
                  <Markdown>{notes}</Markdown>
                </div>
              </div>
            )}

            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              {t('update.installHint')}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {info?.url && (
              <Button
                variant="ghost"
                onClick={() => info.url && void window.api.app.openExternal(info.url)}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                {t('update.viewOnGithub')}
              </Button>
            )}
            <Button onClick={() => void onDownload()} disabled={downloading} className={cn('gap-2')}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t('update.download')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
