import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  BookOpen,
  Database,
  Download,
  FileUp,
  Globe,
  Info,
  ListOrdered,
  LifeBuoy,
  Plug,
  Table,
  Eraser,
  MapPin,
  MessageCircle,
  Palette,
  Gauge,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  TreeDeciduous,
  Type,
  Upload,
  LogIn,
  LogOut,
  type LucideIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ExportSiteDialog } from '@/components/common/ExportSiteDialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { FsSolutionBadge, FsTrademarkNotice } from '@/components/common/FsBrand'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ExportGedcomDialog } from '@/components/common/ExportGedcomDialog'
import { useFsMode } from '@/hooks/useFsMode'
import { setFsMode } from '@/lib/fsMode'
import { runPlaceStandardization } from '@/lib/standardizePlaces'
import { importGedcomWithToast } from '@/lib/importGedcom'
import { useAppStore } from '@/store/useAppStore'
import { useSettings, type DateFormat, type FontSize } from '@/store/useSettings'
import { ApiServerSettings } from './ApiServerSettings'
import { ChangelogView } from '@/components/changelog/ChangelogView'

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-secondary/50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-3 py-1 text-xs font-medium transition-colors',
            value === o.value
              ? 'bg-background text-foreground shadow-sm ring-1 ring-primary/20'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A titled category card holding a list of divided setting rows. */
function Category({
  icon: Icon,
  title,
  tone = 'default',
  className,
  children
}: {
  icon: LucideIcon
  title: string
  tone?: 'default' | 'danger'
  className?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-border bg-card', className)}>
      <div className="flex items-center gap-2.5 border-b border-border/60 bg-muted/30 px-4 py-3">
        <div
          className={cn(
            'grid h-7 w-7 place-items-center rounded-lg',
            tone === 'danger' ? 'bg-destructive/10' : 'bg-primary/10'
          )}
        >
          <Icon className={cn('h-4 w-4', tone === 'danger' ? 'text-destructive' : 'text-primary')} />
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="divide-y divide-border/50">{children}</div>
    </section>
  )
}

/**
 * About / credits. This is the app's credit-notice section, which is where the
 * FamilySearch Solutions Program brand guide requires the trademark ownership
 * notice to live — and the guide-appropriate home for our Solutions Program
 * tier logo. The FamilySearch part renders only when an AppKey is actually
 * configured, so a keyless build shows no FamilySearch branding at all. Our own
 * product name stays the more prominent mark, as the guide requires.
 */
function AboutBlock(): JSX.Element {
  const { t } = useTranslation()
  const [version, setVersion] = useState('')
  const [fsOn, setFsOn] = useState(false)

  useEffect(() => {
    let alive = true
    void window.api.updates
      .version()
      .then((v) => {
        if (alive) setVersion(v)
      })
      .catch(() => undefined)
    void window.api.familysearch
      .configured()
      .then((ok) => {
        if (alive) setFsOn(ok)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  return (
    <Category icon={BadgeCheck} title={t('about.title')}>
      <Row icon={Info} title="TreeMonk" desc={t('about.copyright')}>
        <span className="text-xs tabular-nums text-muted-foreground">{version}</span>
      </Row>
      {fsOn && (
        <div className="space-y-3 px-4 py-4">
          <p className="text-xs leading-relaxed text-muted-foreground">{t('about.fsCredit')}</p>
          <FsSolutionBadge height={44} />
          <FsTrademarkNotice />
        </div>
      )}
    </Category>
  )
}

/** One setting row: icon + title + description on the left, control on the right. */
function Row({
  icon: Icon,
  title,
  desc,
  children
}: {
  icon: LucideIcon
  title: string
  desc: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/40">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** Settings sections, in tab order. Ids drive the left-rail selection. */
type SectionId = 'appearance' | 'data' | 'io' | 'api' | 'news' | 'help' | 'danger'

export function SettingsView(): JSX.Element {
  // Which of the two website exports is open (null = neither).
  const [siteExport, setSiteExport] = useState<'site' | 'index' | null>(null)
  const { t, i18n } = useTranslation()
  const refreshAll = useAppStore((s) => s.refreshAll)
  const {
    fontSize,
    animations,
    reduceEffects,
    dateFormat,
    verificationMarks,
    setFontSize,
    setAnimations,
    setReduceEffects,
    setDateFormat,
    setVerificationMarks
  } = useSettings()
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [interrupted, setInterrupted] = useState(false)
  const fsMode = useFsMode()
  const [standardizing, setStandardizing] = useState(false)
  // FamilySearch account state — the sign-in/out row in the Data section.
  const [fsSignedIn, setFsSignedIn] = useState<boolean | null>(null)
  const [fsBusy, setFsBusy] = useState(false)
  useEffect(() => {
    void window.api.familysearch
      .signedIn()
      .then(setFsSignedIn)
      .catch(() => setFsSignedIn(false))
  }, [])
  const fsLogin = async (): Promise<void> => {
    setFsBusy(true)
    try {
      const r = await window.api.familysearch.login(i18n.language)
      if (r.ok) {
        setFsSignedIn(true)
        setFsMode(true)
        toast.success(t('fs.loginOk'))
      } else {
        toast.error(t('fs.loginFailed'))
      }
    } finally {
      setFsBusy(false)
    }
  }
  const fsLogout = async (): Promise<void> => {
    await window.api.familysearch.signOut()
    setFsSignedIn(false)
    toast.success(t('fs.signedOutToast'))
  }
  const [section, setSection] = useState<SectionId>('appearance')

  // Surface an import that was interrupted (app killed mid-run) so the user can
  // run the cleanup of empty entities it left behind.
  useEffect(() => {
    void window.api.familysearch.pending?.().then(setInterrupted).catch(() => undefined)
  }, [])

  const cleanup = async (): Promise<void> => {
    const removed = await window.api.db.removeEmpty()
    await refreshAll()
    setInterrupted(false)
    toast.success(removed > 0 ? t('fs.cleanupDone', { count: removed }) : t('fs.cleanupNone'))
  }
  const backup = async (): Promise<void> => {
    const res = await window.api.backup.create()
    if (res) toast.success(t('settings.backupDone', { path: res.path }))
  }
  const importGed = async (): Promise<void> => {
    const res = await importGedcomWithToast(t)
    if (res) {
      await refreshAll()
      void runPlaceStandardization(t, refreshAll, true)
    }
  }
  const standardize = async (): Promise<void> => {
    if (standardizing) return
    setStandardizing(true)
    try {
      await runPlaceStandardization(t, refreshAll)
    } finally {
      setStandardizing(false)
    }
  }

  const yesNo = [
    { value: 'on' as const, label: t('common.yes') },
    { value: 'off' as const, label: t('common.no') }
  ]

  const SECTIONS: { id: SectionId; icon: LucideIcon; label: string; tone?: 'danger' }[] = [
    { id: 'appearance', icon: Palette, label: t('settings.sectionAppearance') },
    { id: 'data', icon: Database, label: t('settings.sectionData') },
    { id: 'io', icon: FileUp, label: t('settings.sectionImportExport') },
    { id: 'api', icon: Plug, label: t('settings.sectionApi') },
    { id: 'news', icon: Sparkles, label: t('nav.changelog') },
    { id: 'help', icon: LifeBuoy, label: t('settings.sectionHelp') },
    { id: 'danger', icon: AlertTriangle, label: t('settings.sectionDanger'), tone: 'danger' }
  ]

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-5xl p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">{t('settings.sectionTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>
          </div>
        </div>

        {interrupted && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{t('fs.interrupted')}</span>
          </div>
        )}

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* ---- Tab rail: horizontal-scroll on mobile, vertical on lg+ ---- */}
          <nav
            aria-label={t('settings.sectionTitle')}
            className="flex shrink-0 gap-1 overflow-x-auto pb-1 lg:w-56 lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {SECTIONS.map(({ id, icon: Icon, label, tone }) => {
              const active = section === id
              return (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors',
                    active
                      ? tone === 'danger'
                        ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/25'
                        : 'bg-primary/15 text-primary ring-1 ring-primary/25'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{label}</span>
                </button>
              )
            })}
          </nav>

          {/* ---- Active section content ---- */}
          <div className="min-w-0 flex-1 space-y-5">
            {section === 'appearance' && (
              <Category icon={Palette} title={t('settings.sectionAppearance')}>
                <Row icon={Type} title={t('settings.fontSize')} desc={t('settings.fontSizeDesc')}>
                  <Segmented<FontSize>
                    value={fontSize}
                    onChange={setFontSize}
                    options={[
                      { value: 'small', label: t('settings.small') },
                      { value: 'medium', label: t('settings.medium') },
                      { value: 'large', label: t('settings.large') }
                    ]}
                  />
                </Row>
                <Row icon={Sparkles} title={t('settings.animations')} desc={t('settings.animationsDesc')}>
                  <Segmented value={animations ? 'on' : 'off'} onChange={(v) => setAnimations(v === 'on')} options={yesNo} />
                </Row>
                <Row icon={Gauge} title={t('settings.reduceEffects')} desc={t('settings.reduceEffectsDesc')}>
                  <Segmented value={reduceEffects ? 'on' : 'off'} onChange={(v) => setReduceEffects(v === 'on')} options={yesNo} />
                </Row>
                <Row icon={Type} title={t('settings.dateFormat')} desc={t('settings.dateFormatDesc')}>
                  <Segmented<DateFormat>
                    value={dateFormat}
                    onChange={setDateFormat}
                    options={[
                      { value: 'iso', label: 'YYYY-MM-DD' },
                      { value: 'eu', label: 'DD.MM.YYYY' },
                      { value: 'us', label: 'MM/DD/YYYY' }
                    ]}
                  />
                </Row>
                <Row icon={BadgeCheck} title={t('settings.verification')} desc={t('settings.verificationDesc')}>
                  <Segmented value={verificationMarks ? 'on' : 'off'} onChange={(v) => setVerificationMarks(v === 'on')} options={yesNo} />
                </Row>
              </Category>
            )}

            {section === 'data' && (
              <Category icon={Database} title={t('settings.sectionData')}>
                <Row
                  icon={TreeDeciduous}
                  title="FamilySearch"
                  desc={
                    fsSignedIn === null
                      ? '…'
                      : fsSignedIn
                        ? t('settings.fsSignedInDesc')
                        : t('settings.fsSignedOutDesc')
                  }
                >
                  {fsSignedIn ? (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => void fsLogout()}>
                      <LogOut className="h-4 w-4" />
                      {t('fs.signOut')}
                    </Button>
                  ) : (
                    <Button size="sm" className="gap-2" disabled={fsBusy} onClick={() => void fsLogin()}>
                      <LogIn className="h-4 w-4" />
                      {fsBusy ? t('fs.signingIn') : t('fs.signInNow')}
                    </Button>
                  )}
                </Row>
                <Row icon={MapPin} title={t('places.standardizeTitle')} desc={t('places.standardizeDesc')}>
                  <Button size="sm" variant="outline" className="gap-2" disabled={standardizing} onClick={standardize}>
                    <MapPin className="h-4 w-4" />
                    {t('places.standardizeBtn')}
                  </Button>
                </Row>
                <Row icon={Eraser} title={t('fs.cleanup')} desc={t('fs.cleanupDesc')}>
                  <Button size="sm" variant={interrupted ? 'default' : 'outline'} className="gap-2" onClick={cleanup}>
                    <Eraser className="h-4 w-4" />
                    {t('fs.cleanup')}
                  </Button>
                </Row>
                <Row icon={Archive} title={t('settings.backup')} desc={t('settings.backupDesc')}>
                  <Button size="sm" className="gap-2" onClick={backup}>
                    <Archive className="h-4 w-4" />
                    {t('settings.backupBtn')}
                  </Button>
                </Row>
                <Row icon={RotateCcw} title={t('settings.restore')} desc={t('settings.restoreDesc')}>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => setRestoreOpen(true)}>
                    <RotateCcw className="h-4 w-4" />
                    {t('settings.restoreBtn')}
                  </Button>
                </Row>
              </Category>
            )}

            {section === 'io' && (
              <Category icon={FileUp} title={t('settings.sectionImportExport')}>
                <Row icon={Download} title={t('settings.gedcomExport')} desc={t('settings.gedcomExportDesc')}>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => setExportOpen(true)}>
                    <Download className="h-4 w-4" />
                    {t('gedcom.export')}
                  </Button>
                </Row>
                {!fsMode && (
                  <Row icon={Upload} title={t('settings.gedcomImport')} desc={t('settings.gedcomImportDesc')}>
                    <Button size="sm" variant="outline" className="gap-2" onClick={importGed}>
                      <Upload className="h-4 w-4" />
                      {t('gedcom.import')}
                    </Button>
                  </Row>
                )}
                {!fsMode && (
                  <Row icon={Table} title={t('settings.csvImport')} desc={t('settings.csvImportDesc')}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={async () => {
                        const res = await window.api.csv.import()
                        if (res) {
                          toast.success(t('settings.csvImported', { count: res.created }))
                          await useAppStore.getState().refreshAll()
                        }
                      }}
                    >
                      <Table className="h-4 w-4" />
                      {t('settings.csvImportBtn')}
                    </Button>
                  </Row>
                )}
                <Row icon={Globe} title={t('settings.siteExport')} desc={t('settings.siteExportDesc')}>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => setSiteExport('site')}>
                    <Globe className="h-4 w-4" />
                    {t('settings.siteExportBtn')}
                  </Button>
                </Row>
                <Row icon={ListOrdered} title={t('settings.indexExport')} desc={t('settings.indexExportDesc')}>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => setSiteExport('index')}>
                    <ListOrdered className="h-4 w-4" />
                    {t('settings.indexExportBtn')}
                  </Button>
                </Row>
              </Category>
            )}

            {section === 'api' && <ApiServerSettings />}

            {section === 'news' && (
              <div className="h-[calc(100vh-11rem)] overflow-hidden rounded-2xl border border-border bg-card">
                <ChangelogView />
              </div>
            )}

            {section === 'help' && (
              <>
              <Category icon={LifeBuoy} title={t('settings.sectionHelp')}>
                <Row icon={BookOpen} title={t('help.openManual')} desc={t('settings.manualDesc')}>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => void window.api.app.openManual(i18n.language)}>
                    <BookOpen className="h-4 w-4" />
                    {t('help.openManual')}
                  </Button>
                </Row>
                <Row icon={MessageCircle} title={t('feedback.title')} desc={t('feedback.desc')}>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => void window.api.app.openExternal('mailto:barkattila@gmail.com?subject=TreeMonk')}
                  >
                    <MessageCircle className="h-4 w-4" />
                    {t('feedback.send')}
                  </Button>
                </Row>
              </Category>
              <AboutBlock />
              </>
            )}

            {section === 'danger' && (
              <Category icon={AlertTriangle} title={t('settings.sectionDanger')} tone="danger">
                <Row icon={Trash2} title={t('settings.reset')} desc={t('settings.resetDesc')}>
                  <Button size="sm" variant="destructive" className="gap-2" onClick={() => setResetOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                    {t('settings.resetBtn')}
                  </Button>
                </Row>
              </Category>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title={t('settings.restore')}
        confirmLabel={t('settings.restoreBtn')}
        onConfirm={() => window.api.backup.restore()}
      >
        <p>{t('settings.restoreWarning')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t('settings.reset')}
        confirmLabel={t('settings.resetBtn')}
        onConfirm={async () => {
          // An empty database → offer the FS / Manual start choice again.
          const { clearStartChoice } = await import('@/lib/fsMode')
          clearStartChoice()
          await window.api.db.wipe()
        }}
      >
        <p>{t('settings.resetWarning')}</p>
      </ConfirmDialog>

      <ExportGedcomDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ExportSiteDialog
        open={siteExport !== null}
        onOpenChange={(v) => !v && setSiteExport(null)}
        mode={siteExport ?? 'site'}
      />
    </ScrollArea>
  )
}
