import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LogIn,
  Loader2,
  ShieldCheck,
  TreeDeciduous,
  UserRound,
  Users,
  XCircle,
  type LucideIcon
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useFsImport } from '@/store/useFsImport'
import { isDemo } from '@/lib/demo'
import type { FamilySearchPreview, FamilySearchStatus } from '@shared/types'
import { describe, mapError } from './fsStatus'

/** The three phases the preview goes through, shown as a live checklist. */
const PREVIEW_STEPS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'auth', label: 'fs.previewAuth', icon: LogIn },
  { key: 'root', label: 'fs.previewRoot', icon: UserRound },
  { key: 'ancestors', label: 'fs.previewAncestors', icon: Users }
]

/** Which checklist row the current status phase corresponds to. */
function previewPhaseIndex(phase?: string): number {
  if (phase === 'fetching_root') return 1
  if (phase === 'ancestors' || phase === 'ancestors_done') return 2
  if (phase === 'done') return 3
  return 0 // auth / unknown
}

type RiskLevel = 'safe' | 'moderate' | 'high' | 'danger'

/** Coarse risk estimate from the two crawl knobs. Depth dominates because each
 *  collateral level pulls whole new ancestor sub-trees (exponential growth). */
function riskOf(ascend: number, depth: number): RiskLevel {
  let s = 0
  if (depth >= 4) s += 3
  else if (depth === 3) s += 2
  else if (depth === 2) s += 1
  if (ascend >= 15) s += 2
  else if (ascend >= 10) s += 1
  return s >= 4 ? 'danger' : s >= 3 ? 'high' : s >= 1 ? 'moderate' : 'safe'
}

const RISK_STYLE: Record<RiskLevel, string> = {
  safe: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  moderate: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  high: 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  danger: 'border-destructive/50 bg-destructive/10 text-destructive'
}

export function FamilySearchImport({
  open,
  onOpenChange,
  presetRoot,
  presetName
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** When set, the starting person is fixed to this FID (deep import from a
   *  profile): the root is locked and the import is always a non-destructive merge. */
  presetRoot?: string
  presetName?: string
}): JSX.Element | null {
  // The read-only demo never imports — the modal must not even open. Safe to
  // return early: isDemo() is a build-time constant, so hook order is stable.
  if (isDemo()) return null
  const { t } = useTranslation()
  const startImport = useFsImport((s) => s.start)
  const [step, setStep] = useState(1)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [root, setRoot] = useState('')
  const [ascend, setAscend] = useState(6)
  const [depth, setDepth] = useState(2)
  const [maxPeople, setMaxPeople] = useState(5000)
  // Merge by default (non-destructive): only fill gaps, never wipe curated data.
  const [replace, setReplace] = useState(false)

  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<FamilySearchPreview | null>(null)
  const [status, setStatus] = useState<FamilySearchStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Legal consent gate — shown once before the first import. No data is fetched
  // from FamilySearch until the user has read and accepted the notice.
  const [consented, setConsented] = useState(() => localStorage.getItem('treemonk.fsLegalConsent') === '1')
  const [consentChecked, setConsentChecked] = useState(false)
  const acceptConsent = (): void => {
    localStorage.setItem('treemonk.fsLegalConsent', '1')
    setConsented(true)
  }

  // Browser sign-in: the user logs in on FamilySearch's OWN page (a separate
  // window) — TreeMonk never sees the password. On success an OAuth token is
  // cached in the main process and the import proceeds with it.
  const [loggedIn, setLoggedIn] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const signIn = async (): Promise<void> => {
    setLoggingIn(true)
    setError(null)
    try {
      const r = await window.api.familysearch.login()
      if (r.ok) setLoggedIn(true)
      else if (r.error === 'NO_CLIENT_ID') setError(t('fs.noClientId'))
      else if (r.error !== 'CANCELLED') setError(t('fs.loginFailed'))
    } finally {
      setLoggingIn(false)
    }
  }

  // While the preview is running, mirror the engine's live progress (auth →
  // fetching root → walking up the ancestors) so the dialog shows what's happening.
  useEffect(() => {
    if (!previewing) return
    const unsub = window.api.familysearch.onStatus((s) => setStatus(s))
    return () => unsub()
  }, [previewing])

  // Pre-fill from the last import (and the cached session login) for an easy
  // re-import — the user just confirms instead of re-typing everything.
  useEffect(() => {
    if (!open || typeof window.api.familysearch.getSettings !== 'function') return
    void window.api.familysearch.getSettings().then((s) => {
      if (!s) return
      if (s.username) setUsername(s.username)
      if (s.password) setPassword(s.password)
      if (s.root && !presetRoot) setRoot(s.root)
      if (s.ascend) setAscend(s.ascend)
      if (s.depth) setDepth(s.depth)
      if (typeof s.maxPeople === 'number') setMaxPeople(s.maxPeople)
      if (typeof s.replace === 'boolean' && !presetRoot) setReplace(s.replace)
    })
  }, [open, presetRoot])

  // Deep import: lock the starting person to the preset and force a merge.
  useEffect(() => {
    if (open && presetRoot) {
      setRoot(presetRoot)
      setReplace(false)
      setStep(1)
    }
  }, [open, presetRoot])

  const risk = riskOf(ascend, depth)
  const previewCur = previewPhaseIndex(status?.phase)
  const depthExplain = depth <= 1 ? t('fs.depth1') : depth === 2 ? t('fs.depth2') : t('fs.depth3', { count: depth })

  // Step 2 → 3: confirm the starting person + ancestor estimate before committing.
  const goReview = async (): Promise<void> => {
    setPreviewing(true)
    setStatus(null)
    setError(null)
    try {
      setPreview(await window.api.familysearch.preview({ username, password, root: root.trim(), ascend }))
      setStep(3)
    } catch (e) {
      setError(mapError(t, e))
    } finally {
      setPreviewing(false)
    }
  }

  const start = (): void => {
    void startImport({
      username,
      password,
      root: root.trim(),
      ascend,
      depth,
      childrenDepth: 1,
      maxPeople,
      replace,
      // Deep import (preset root) must NOT change the global starting person.
      keepRoot: !!presetRoot
    })
    onOpenChange(false)
  }

  const close = (v: boolean): void => {
    if (previewing) return
    onOpenChange(v)
  }

  const errorBox = error && (
    <div className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
    </div>
  )

  const stepTitles = [t('fs.stepConnect'), t('fs.stepScope'), t('fs.stepReview')]

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TreeDeciduous className="h-4 w-4 text-primary" />
            {presetRoot ? t('fs.deepTitle') : t('fs.title')}
          </DialogTitle>
        </DialogHeader>

        {!consented ? (
          /* ---- Legal consent gate (nothing is fetched until accepted) ---- */
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{t('fs.legal.intro')}</p>
            <ul className="space-y-1.5">
              {(['notAffiliated', 'ownData', 'password', 'scope'] as const).map((k) => (
                <li key={k} className="flex gap-2">
                  <span className="mt-0.5 text-primary">•</span>
                  <span>{t(`fs.legal.${k}`)}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => void window.api.app.openExternal('https://www.familysearch.org/legal/terms')}
              className="text-xs text-sky-600 hover:underline dark:text-sky-400"
            >
              {t('fs.legal.termsLink')}
            </button>
            <label className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 p-2.5">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="text-xs leading-relaxed">{t('fs.legal.agree')}</span>
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                {t('common.cancel')}
              </Button>
              <Button disabled={!consentChecked} onClick={acceptConsent}>
                {t('fs.legal.continue')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
        <>
        {/* Step indicator */}
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          {stepTitles.map((label, i) => (
            <div key={i} className="flex flex-1 items-center gap-1.5">
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]',
                  step === i + 1
                    ? 'bg-primary text-primary-foreground'
                    : step > i + 1
                      ? 'bg-primary/20 text-primary'
                      : 'bg-secondary text-muted-foreground'
                )}
              >
                {i + 1}
              </span>
              <span className={cn('truncate', step === i + 1 ? 'text-foreground' : 'text-muted-foreground')}>
                {label}
              </span>
              {i < 2 && <span className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        {/* Persistent legal reminder (visible on every step). */}
        <p className="text-center text-[10px] text-muted-foreground">{t('fs.legal.note')}</p>

        {/* ---- Step 1: connect ---- */}
        {step === 1 && (
          <div className="space-y-3">
            {loggedIn ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {t('fs.signedIn')}
              </div>
            ) : (
              <div className="space-y-2">
                <Button onClick={() => void signIn()} disabled={loggingIn} className="w-full gap-2">
                  {loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  {t('fs.signInBtn')}
                </Button>
                <p className="rounded-md border border-border bg-secondary/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  {t('fs.signInHelp')}
                </p>
              </div>
            )}
            <div className="space-y-1">
              <Label>{t('fs.rootId')}</Label>
              {presetRoot ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2.5 py-2 text-sm">
                  <UserRound className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate font-medium">{presetName || presetRoot}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{presetRoot}</span>
                </div>
              ) : (
                <Input value={root} onChange={(e) => setRoot(e.target.value)} placeholder={t('fs.rootIdPlaceholder')} />
              )}
              <p className="text-[11px] text-muted-foreground">
                {presetRoot ? t('fs.deepHint') : t('fs.rootIdHint')}
              </p>
            </div>
            {errorBox}
          </div>
        )}

        {/* ---- Step 2: scope (the danger zone) — live preview progress while fetching ---- */}
        {step === 2 && previewing && (
          <div className="space-y-3 py-1">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {t('fs.previewWorking')}
            </p>
            <div className="space-y-2.5 rounded-lg border border-border bg-card p-3.5">
              {PREVIEW_STEPS.map((ps, i) => {
                const done = previewCur > i
                const active = previewCur === i
                const Icon = ps.icon
                return (
                  <div
                    key={ps.key}
                    className={cn('flex items-start gap-2.5 text-sm transition-opacity', !done && !active && 'opacity-40')}
                  >
                    {done ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    ) : active ? (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                    ) : (
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className={cn('font-medium', done && 'text-muted-foreground')}>{t(ps.label)}</span>
                      {active && status && (
                        <p className="text-[11px] leading-relaxed text-muted-foreground">{describe(t, status)}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">{t('fs.previewHint')}</p>
          </div>
        )}

        {step === 2 && !previewing && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t('fs.scopeHint')}</p>

            {/* All crawl-scope controls grouped in one card. */}
            <div className="space-y-3 rounded-lg border border-border bg-card p-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('fs.generations')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={ascend}
                    onChange={(e) => setAscend(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  />
                  <p className="text-[11px] text-muted-foreground">{t('fs.ascendExplain')}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label>{t('fs.depth')}</Label>
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                      {t('fs.depthRecommended')}
                    </span>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={depth}
                    className={cn(depth === 2 && 'border-emerald-500/60 focus-visible:ring-emerald-500/40')}
                    onChange={(e) => setDepth(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  />
                  <p className="text-[11px] text-muted-foreground">{depthExplain}</p>
                  {depth === 2 ? (
                    <p className="flex items-start gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                      {t('fs.depthRecommendedNote')}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDepth(2)}
                      className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {t('fs.depthUseRecommended')}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1 border-t border-border pt-3">
                <Label>{t('fs.maxPeople')}</Label>
                <Input
                  type="number"
                  min={0}
                  step={500}
                  value={maxPeople}
                  onChange={(e) => setMaxPeople(Math.max(0, Number(e.target.value) || 0))}
                />
                <p className="text-[11px] text-muted-foreground">
                  {maxPeople > 0 ? t('fs.maxPeopleHint', { count: maxPeople }) : t('fs.maxPeopleUnlimited')}
                </p>
              </div>
            </div>

            {/* Live risk banner — tells the user what to expect for these settings. */}
            <div className={cn('flex items-start gap-2 rounded-md border p-2.5 text-xs', RISK_STYLE[risk])}>
              {risk === 'safe' ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                <p className="font-semibold">{t(`fs.risk_${risk}`)}</p>
                <p className="mt-0.5 leading-relaxed opacity-90">{t(`fs.risk_${risk}_desc`)}</p>
              </div>
            </div>
            {errorBox}
          </div>
        )}

        {/* ---- Step 3: review & confirm ---- */}
        {step === 3 && preview && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2.5">
                <UserRound className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold">{preview.root.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {preview.root.lifespan ?? ''} · {preview.root.id}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                {t('fs.confirmAncestors', { count: preview.ancestors, generations: ascend })}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t('fs.estimateNote')}</p>
            </div>

            <div className={cn('flex items-start gap-2 rounded-md border p-2.5 text-xs', RISK_STYLE[risk])}>
              {risk === 'safe' ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                <p className="font-semibold">{t(`fs.risk_${risk}`)}</p>
                <p className="mt-0.5 opacity-90">
                  {maxPeople > 0 ? t('fs.cappedAt', { count: maxPeople }) : t('fs.maxPeopleUnlimited')}
                </p>
              </div>
            </div>

            {!presetRoot && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                {t('fs.replace')}
              </label>
            )}
            <p className="text-xs font-medium text-amber-500">
              {replace ? t('fs.confirmReplace') : t('fs.confirmKeep')}
            </p>
            <p className="text-xs text-muted-foreground">{t('fs.background')}</p>
            {errorBox}
          </div>
        )}

        <DialogFooter>
          {step === 1 && (
            <>
              <Button variant="outline" size="sm" onClick={() => close(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setStep(2)}
                disabled={!loggedIn || !root.trim()}
              >
                {t('fs.next')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setStep(1)} disabled={previewing}>
                <ArrowLeft className="h-4 w-4" />
                {t('fs.back')}
              </Button>
              <Button size="sm" className="gap-2" onClick={goReview} disabled={previewing}>
                {previewing && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('fs.next')}
                {!previewing && <ArrowRight className="h-4 w-4" />}
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4" />
                {t('fs.back')}
              </Button>
              <Button size="sm" className="gap-2" onClick={start}>
                {t('fs.confirmStart')}
              </Button>
            </>
          )}
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  )
}
