import { useState } from 'react'
import {
  ChevronDown,
  Database,
  Download,
  FileJson,
  FileText,
  Moon,
  MoreHorizontal,
  Sun,
  Upload
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { LanguageSwitcher } from './LanguageSwitcher'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { RootSwitcher } from './RootSwitcher'
import { GlobalSearch } from './GlobalSearch'
import { ExportGedcomDialog } from '@/components/common/ExportGedcomDialog'
import { importGedcomWithToast } from '@/lib/importGedcom'
import { UpdateBadge } from '@/components/common/UpdateBadge'
import { FamilySearchStatusBadge } from './FamilySearchStatusBadge'
import { LANGUAGES, setLanguage } from '@/i18n'
import { useAppStore } from '@/store/useAppStore'
import { useTheme } from '@/store/useTheme'
import { useFsMode } from '@/hooks/useFsMode'
import type { AppLanguage } from '@shared/types'

export function Topbar(): JSX.Element {
  const { t, i18n } = useTranslation()
  const refreshAll = useAppStore((s) => s.refreshAll)
  const theme = useTheme((s) => s.theme)
  const toggleTheme = useTheme((s) => s.toggle)
  const [exportOpen, setExportOpen] = useState(false)
  const fsMode = useFsMode()

  const onImportGedcom = async (): Promise<void> => {
    const res = await importGedcomWithToast(t)
    if (res) {
      useAppStore.getState().setGedcomSummary(res)
      await refreshAll()
      // Pull any still-remote photos into local storage in the background.
      void window.api.media.downloadRemote()
    }
  }

  const onExportJson = async (): Promise<void> => {
    const r = await window.api.data.exportJson()
    if (r) toast.success(t('export.savedTo', { path: r.path }))
  }
  const onExportDb = async (): Promise<void> => {
    const r = await window.api.data.exportDatabase()
    if (r) toast.success(t('export.savedTo', { path: r.path }))
  }

  const themeTitle = theme === 'dark' ? t('theme.light') : t('theme.dark')

  return (
    <header className="glass-edge relative z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 lg:px-4">
      <div className="flex min-w-0 items-center">
        <WorkspaceSwitcher />
      </div>

      {/* Global search — between the family-tree picker and the starting person. */}
      <div className="flex min-w-0 flex-1 justify-center px-2">
        <GlobalSearch />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
        {/* Global starting person ("me") — loudly flags when none is set. */}
        <RootSwitcher />
        <Separator orientation="vertical" className="hidden h-6 md:block" />
        <UpdateBadge />
        <FamilySearchStatusBadge />

        {/* Roomy screens: the full control row. */}
        <div className="hidden items-center gap-2 lg:flex">
          <Separator orientation="vertical" className="h-6" />

          {/* Import a GEDCOM file — Manual mode only (FS mode is strictly FS-fed). */}
          {!fsMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <Upload className="h-4 w-4" />
                  <span className="hidden xl:inline">{t('topbar.import')}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void onImportGedcom()} className="gap-2">
                  <Upload className="h-4 w-4 text-muted-foreground" /> GEDCOM
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Export: GEDCOM, a full JSON snapshot, or the raw database file. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <Download className="h-4 w-4" />
                <span className="hidden xl:inline">{t('topbar.export')}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setExportOpen(true)} className="gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" /> GEDCOM
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void onExportJson()} className="gap-2">
                <FileJson className="h-4 w-4 text-muted-foreground" /> JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void onExportDb()} className="gap-2">
                <Database className="h-4 w-4 text-muted-foreground" /> {t('export.dbFile')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" onClick={toggleTheme} title={themeTitle}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <LanguageSwitcher />
        </div>

        {/* Tight screens: everything above folds into one ⋯ menu so the bar
            never collides with the search or the pickers. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              title={t('person.moreActions')}
              aria-label={t('person.moreActions')}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {!fsMode && (
              <>
                <DropdownMenuLabel>{t('topbar.import')}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => void onImportGedcom()} className="gap-2">
                  <Upload className="h-4 w-4 text-muted-foreground" /> GEDCOM
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuLabel>{t('topbar.export')}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setExportOpen(true)} className="gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" /> GEDCOM
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void onExportJson()} className="gap-2">
              <FileJson className="h-4 w-4 text-muted-foreground" /> JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void onExportDb()} className="gap-2">
              <Database className="h-4 w-4 text-muted-foreground" /> {t('export.dbFile')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTheme} className="gap-2">
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Moon className="h-4 w-4 text-muted-foreground" />
              )}
              {themeTitle}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('nav.language')}</DropdownMenuLabel>
            {LANGUAGES.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onSelect={() => setLanguage(lang.code as AppLanguage)}
                className={i18n.language === lang.code ? 'gap-2 bg-accent' : 'gap-2'}
              >
                <span className="text-base">{lang.flag}</span>
                <span>{lang.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ExportGedcomDialog open={exportOpen} onOpenChange={setExportOpen} />
    </header>
  )
}
