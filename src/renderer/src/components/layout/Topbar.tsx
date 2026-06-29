import { useState } from 'react'
import { ChevronDown, Database, Download, FileJson, FileText, Moon, Sun, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { LanguageSwitcher } from './LanguageSwitcher'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { RootSwitcher } from './RootSwitcher'
import { GlobalSearch } from './GlobalSearch'
import { ExportGedcomDialog } from '@/components/common/ExportGedcomDialog'
import { importGedcomWithToast } from '@/lib/importGedcom'
import { UpdateBadge } from '@/components/common/UpdateBadge'
import { useAppStore } from '@/store/useAppStore'
import { useTheme } from '@/store/useTheme'

export function Topbar(): JSX.Element {
  const { t } = useTranslation()
  const refreshAll = useAppStore((s) => s.refreshAll)
  const theme = useTheme((s) => s.theme)
  const toggleTheme = useTheme((s) => s.toggle)
  const [exportOpen, setExportOpen] = useState(false)

  const onImportGedcom = async (): Promise<void> => {
    const res = await importGedcomWithToast(t)
    if (res) {
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
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card/30 px-4">
      <div className="flex min-w-0 items-center">
        <WorkspaceSwitcher />
      </div>

      {/* Global search — between the family-tree picker and the starting person. */}
      <div className="flex min-w-0 flex-1 justify-center px-2">
        <GlobalSearch />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Global starting person ("me") — loudly flags when none is set. */}
        <RootSwitcher />
        <Separator orientation="vertical" className="h-6" />
        <UpdateBadge />
        <Separator orientation="vertical" className="h-6" />

        {/* Import a GEDCOM file. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Upload className="h-4 w-4" />
              <span className="hidden md:inline">{t('topbar.import')}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void onImportGedcom()} className="gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" /> GEDCOM
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Export: GEDCOM, a full JSON snapshot, or the raw database file. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Download className="h-4 w-4" />
              <span className="hidden md:inline">{t('topbar.export')}</span>
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

      <ExportGedcomDialog open={exportOpen} onOpenChange={setExportOpen} />
    </header>
  )
}
