import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Archive,
  Download,
  Eraser,
  MapPin,
  MessageCircle,
  RotateCcw,
  Sparkles,
  Trash2,
  Type,
  Upload
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FeedbackDialog } from '@/components/common/FeedbackDialog'
import { ExportGedcomDialog } from '@/components/common/ExportGedcomDialog'
import { isDemo } from '@/lib/demo'
import { runPlaceStandardization } from '@/lib/standardizePlaces'
import { importGedcomWithToast } from '@/lib/importGedcom'
import { useAppStore } from '@/store/useAppStore'
import { useSettings, type DateFormat, type FontSize } from '@/store/useSettings'

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
    <div className="flex items-center gap-1 rounded-lg bg-secondary p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            value === o.value
              ? 'bg-background text-foreground shadow'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Row({
  icon: Icon,
  title,
  desc,
  children
}: {
  icon: typeof Type
  title: string
  desc: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

export function SettingsView(): JSX.Element {
  const { t } = useTranslation()
  const refreshAll = useAppStore((s) => s.refreshAll)
  const { fontSize, animations, dateFormat, setFontSize, setAnimations, setDateFormat } =
    useSettings()
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [interrupted, setInterrupted] = useState(false)
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
      // Standardize the freshly imported places (only the new ones → fast).
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

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('settings.appearance')}
          </h3>
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
            <Segmented<'on' | 'off'>
              value={animations ? 'on' : 'off'}
              onChange={(v) => setAnimations(v === 'on')}
              options={[
                { value: 'on', label: t('common.yes') },
                { value: 'off', label: t('common.no') }
              ]}
            />
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
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('settings.data')}
          </h3>
          {interrupted && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{t('fs.interrupted')}</span>
            </div>
          )}
          <Row icon={MapPin} title={t('places.standardizeTitle')} desc={t('places.standardizeDesc')}>
            <Button size="sm" variant="outline" className="gap-2" disabled={standardizing} onClick={standardize}>
              <MapPin className="h-4 w-4" />
              {t('places.standardizeBtn')}
            </Button>
          </Row>
          <Row icon={Eraser} title={t('fs.cleanup')} desc={t('fs.cleanupDesc')}>
            <Button
              size="sm"
              variant={interrupted ? 'default' : 'outline'}
              className="gap-2"
              onClick={cleanup}
            >
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
          <Row icon={Upload} title={t('settings.gedcomImport')} desc={t('settings.gedcomImportDesc')}>
            <Button size="sm" variant="outline" className="gap-2" onClick={importGed}>
              <Upload className="h-4 w-4" />
              {t('gedcom.import')}
            </Button>
          </Row>
          <Row icon={Trash2} title={t('settings.reset')} desc={t('settings.resetDesc')}>
            <Button size="sm" variant="destructive" className="gap-2" onClick={() => setResetOpen(true)}>
              <Trash2 className="h-4 w-4" />
              {t('settings.resetBtn')}
            </Button>
          </Row>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('feedback.section')}
          </h3>
          <Row icon={MessageCircle} title={t('feedback.title')} desc={t('feedback.desc')}>
            <Button size="sm" className="gap-2" onClick={() => setFeedbackOpen(true)}>
              <MessageCircle className="h-4 w-4" />
              {t('feedback.send')}
            </Button>
          </Row>
        </section>
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
