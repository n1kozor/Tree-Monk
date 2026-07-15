import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  BookOpen,
  Database,
  Download,
  Eraser,
  MapPin,
  MessageCircle,
  Palette,
  Gauge,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Type,
  Upload,
  type LucideIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FeedbackDialog } from '@/components/common/FeedbackDialog'
import { ExportGedcomDialog } from '@/components/common/ExportGedcomDialog'
import { useFsMode } from '@/hooks/useFsMode'
import { runPlaceStandardization } from '@/lib/standardizePlaces'
import { importGedcomWithToast } from '@/lib/importGedcom'
import { useAppStore } from '@/store/useAppStore'
import { useSettings, type DateFormat, type FontSize } from '@/store/useSettings'
import { ApiServerSettings } from './ApiServerSettings'

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

export function SettingsView(): JSX.Element {
  const { t } = useTranslation()
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
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [interrupted, setInterrupted] = useState(false)
  const fsMode = useFsMode()
  const [standardizing, setStandardizing] = useState(false)

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

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">{t('settings.sectionTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>
          </div>
        </div>

        {interrupted && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{t('fs.interrupted')}</span>
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-2">
          {/* Appearance */}
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

          {/* Data & backup */}
          <Category icon={Database} title={t('settings.sectionData')} className="lg:row-span-2">
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
          </Category>

          {/* Feedback */}
          <ApiServerSettings />

          <Category icon={MessageCircle} title={t('feedback.section')}>
            <Row icon={MessageCircle} title={t('feedback.title')} desc={t('feedback.desc')}>
              <Button size="sm" className="gap-2" onClick={() => setFeedbackOpen(true)}>
                <MessageCircle className="h-4 w-4" />
                {t('feedback.send')}
              </Button>
            </Row>
            {/* The user manual moved here from the sidebar. */}
            <Row icon={BookOpen} title={t('help.openManual')} desc={t('settings.manualDesc')}>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => void window.api.app.openManual()}>
                <BookOpen className="h-4 w-4" />
                {t('help.openManual')}
              </Button>
            </Row>
          </Category>

          {/* Danger zone */}
          <Category icon={AlertTriangle} title={t('settings.sectionDanger')} tone="danger">
            <Row icon={Trash2} title={t('settings.reset')} desc={t('settings.resetDesc')}>
              <Button size="sm" variant="destructive" className="gap-2" onClick={() => setResetOpen(true)}>
                <Trash2 className="h-4 w-4" />
                {t('settings.resetBtn')}
              </Button>
            </Row>
          </Category>
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

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <ExportGedcomDialog open={exportOpen} onOpenChange={setExportOpen} />
    </ScrollArea>
  )
}
