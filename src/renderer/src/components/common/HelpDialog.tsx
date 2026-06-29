import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  Compass,
  FileText,
  Filter,
  Images,
  LayoutDashboard,
  MapPin,
  Network,
  Route,
  Search,
  Settings,
  ShieldAlert,
  Users,
  UserRound,
  type LucideIcon
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { View } from '@/store/useAppStore'

/** Manual sections, in display order. Ids that match a `View` open automatically
 *  when the help is launched from that page. */
const SECTIONS: { id: string; icon: LucideIcon }[] = [
  { id: 'general', icon: Compass },
  { id: 'board', icon: Search },
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'tree', icon: Network },
  { id: 'map', icon: MapPin },
  { id: 'people', icon: Users },
  { id: 'documents', icon: Images },
  { id: 'person', icon: UserRound },
  { id: 'kinship', icon: Route },
  { id: 'issues', icon: ShieldAlert },
  { id: 'query', icon: Filter },
  { id: 'settings', icon: Settings }
]

interface Block {
  /** Optional sub-heading. */
  h?: string
  /** Paragraph text. */
  p: string
}

export function HelpDialog({
  open,
  onOpenChange,
  currentView
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  currentView: View
}): JSX.Element {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string>('general')

  // Jump to the section for the page the user opened help from.
  useEffect(() => {
    if (!open) return
    setSelected(SECTIONS.some((s) => s.id === currentView) ? currentView : 'general')
  }, [open, currentView])

  const raw = t(`help.sections.${selected}.blocks`, { returnObjects: true })
  const blocks: Block[] = Array.isArray(raw) ? (raw as Block[]) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        <div className="flex h-[74vh]">
          {/* ---- Section nav ---- */}
          <nav className="flex w-52 shrink-0 flex-col border-r border-border bg-secondary/30">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
              <BookOpen className="h-4 w-4 text-primary" />
              {t('help.title')}
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {SECTIONS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSelected(id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    selected === id
                      ? 'bg-primary/15 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{t(`help.sections.${id}.title`)}</span>
                </button>
              ))}
            </div>
            {/* Full PDF manual — opens in the OS viewer. */}
            <div className="border-t border-border p-2">
              <button
                onClick={() => void window.api.app.openManual()}
                className="flex w-full items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span>{t('help.openManual')}</span>
              </button>
            </div>
          </nav>

          {/* ---- Section content ---- */}
          <div className="flex-1 overflow-y-auto px-7 py-6">
            <div className="mx-auto max-w-prose">
              <h2 className="text-xl font-semibold tracking-tight">
                {t(`help.sections.${selected}.title`)}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {t(`help.sections.${selected}.intro`)}
              </p>

              <div className="mt-6 space-y-5">
                {blocks.map((b, i) => (
                  <section key={i}>
                    {b.h && (
                      <h3 className="mb-1 text-sm font-semibold text-foreground">{b.h}</h3>
                    )}
                    <p className="text-[13px] leading-relaxed text-foreground/80">{b.p}</p>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
