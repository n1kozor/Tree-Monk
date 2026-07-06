import { useEffect, useState } from 'react'
import {
  BookOpen,
  ClipboardList,
  Calendar,
  Filter,
  Heart,
  HelpCircle,
  History,
  Images,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Users
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAppStore, type View } from '@/store/useAppStore'
import { useSettings } from '@/store/useSettings'
import { isDemo } from '@/lib/demo'
import { AppIcon } from '@/components/common/AppIcon'
import { FeedbackDialog } from '@/components/common/FeedbackDialog'
import { SupportDialog } from '@/components/common/SupportDialog'
import { HelpDialog } from '@/components/common/HelpDialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'

const ITEMS: { view: View; icon: typeof Search; labelKey: string }[] = [
  { view: 'board', icon: Search, labelKey: 'nav.board' },
  { view: 'dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { view: 'tree', icon: Network, labelKey: 'nav.tree' },
  { view: 'map', icon: MapPin, labelKey: 'nav.map' },
  { view: 'people', icon: Users, labelKey: 'nav.people' },
  { view: 'documents', icon: Images, labelKey: 'nav.documents' },
  { view: 'issues', icon: ShieldAlert, labelKey: 'nav.issues' },
  { view: 'query', icon: Filter, labelKey: 'nav.query' },
  { view: 'kinship', icon: Route, labelKey: 'nav.kinship' },
  { view: 'research', icon: ClipboardList, labelKey: 'nav.research' },
  { view: 'calendar', icon: Calendar, labelKey: 'nav.calendar' },
  { view: 'changelog', icon: Sparkles, labelKey: 'nav.changelog' },
  { view: 'audit', icon: History, labelKey: 'nav.audit' }
]

export function Sidebar(): JSX.Element {
  const { t } = useTranslation()
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const setCollapsed = useSettings((s) => s.setSidebarCollapsed)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [issueCount, setIssueCount] = useState(0)
  // Recompute the Issues badge when the tree changes (debounced — the scans walk
  // every person). We only need the COUNT here, never the full lists. The famous
  // scan was dropped: its nav entry is hidden, so it was pure wasted work on
  // every data change (a big tree made adding/editing a person feel sluggish).
  const peopleLen = useAppStore((s) => s.people.length)
  const familiesLen = useAppStore((s) => s.families.length)
  const loading = useAppStore((s) => s.loading)
  useEffect(() => {
    // The scans run synchronously in the main process (blocking it for a moment
    // on a big tree). NEVER run them during the busy startup / data load — wait
    // until the renderer is idle (the app is interactive and the user isn't doing
    // anything), with a timeout cap so the badge still appears reasonably soon.
    if (loading) return
    let cancelled = false
    const run = (): void => {
      void Promise.all([
        window.api.sanity.check().catch(() => []),
        window.api.duplicates.scan().catch(() => [])
      ]).then(([issues, dups]) => {
        if (cancelled) return
        // The Issues view covers both data problems and possible duplicates.
        setIssueCount(issues.length + dups.length)
      })
    }
    const ric = window.requestIdleCallback
    let idleId: number | undefined
    let timerId: ReturnType<typeof setTimeout> | undefined
    if (ric) idleId = ric(run, { timeout: 5000 })
    else timerId = setTimeout(run, 2000)
    return () => {
      cancelled = true
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId)
      if (timerId) clearTimeout(timerId)
    }
  }, [peopleLen, familiesLen, loading])

  // F1 opens the manual anywhere in the app (the help now lives next to Settings).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F1') {
        e.preventDefault()
        setHelpOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Only show a hover tooltip when collapsed — expanded already shows the label.
  const withTip = (key: string, node: JSX.Element): JSX.Element =>
    collapsed ? (
      <Tooltip>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side="right">{t(key)}</TooltipContent>
      </Tooltip>
    ) : (
      node
    )

  const navBtn = (v: View, Icon: typeof Search, labelKey: string, badge?: number): JSX.Element => {
    const active = view === v
    // The family tree is the app's centrepiece — tint it green so it stands out.
    const tree = v === 'tree'
    return withTip(
      labelKey,
      <button
        onClick={() => setView(v)}
        data-testid={`nav-${v}`}
        className={cn(
          'relative flex h-10 items-center rounded-xl transition-all duration-200',
          collapsed ? 'w-10 justify-center' : 'w-full gap-3 px-3',
          active
            ? tree
              ? 'bg-emerald-500/20 text-emerald-600 shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] ring-1 ring-emerald-500/20 dark:text-emerald-400'
              : 'bg-primary/20 text-primary shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] ring-1 ring-primary/20'
            : tree
              ? 'text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="truncate text-sm font-medium">{t(labelKey)}</span>}
        {badge ? (
          <span
            className={cn(
              'flex items-center justify-center rounded-full text-[10px] font-bold leading-none',
              v === 'issues'
                ? 'bg-destructive/15 text-destructive'
                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
              collapsed
                ? 'absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1'
                : 'ml-auto h-5 min-w-5 px-1.5'
            )}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        data-testid="sidebar"
        className={cn(
          'glass-edge flex h-full shrink-0 flex-col gap-1 overflow-hidden border-r border-border/40 px-2 py-3 transition-[width] duration-200',
          collapsed ? 'w-16 items-center' : 'w-56'
        )}
      >
        {/* Brand + collapse toggle */}
        <div
          className={cn(
            'mb-2 flex shrink-0',
            collapsed ? 'flex-col items-center gap-1.5' : 'items-center gap-2 px-1'
          )}
        >
          <AppIcon className="h-10 w-10 shrink-0 rounded-xl" />
          {!collapsed && (
            <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
              {t('app.name')}
            </p>
          )}
          {withTip(
            collapsed ? 'nav.expand' : 'nav.collapse',
            <button
              onClick={() => setCollapsed(!collapsed)}
              data-testid="toggle-sidebar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Feedback — pinned to the top, above the navigation. */}
        {withTip(
          'feedback.report',
          <button
            onClick={() => setFeedbackOpen(true)}
            data-testid="open-feedback"
            className={cn(
              'mb-1 flex h-10 shrink-0 items-center rounded-xl border border-primary/30 bg-primary/5 font-medium text-primary transition-colors hover:bg-primary/10',
              collapsed ? 'w-10 justify-center' : 'w-full gap-2.5 px-3'
            )}
          >
            <MessageCircle className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate text-sm">{t('feedback.report')}</span>}
          </button>
        )}

        {/* Support — optional donation, right under feedback. */}
        {withTip(
          'support.button',
          <button
            onClick={() => setSupportOpen(true)}
            data-testid="open-support"
            className={cn(
              'mb-1 flex h-10 shrink-0 items-center rounded-xl border border-rose-500/50 bg-rose-500/15 font-medium text-rose-600 transition-colors hover:bg-rose-500/25 dark:text-rose-400',
              collapsed ? 'w-10 justify-center' : 'w-full gap-2.5 px-3'
            )}
          >
            <Heart className="h-[18px] w-[18px] shrink-0 fill-current" />
            {!collapsed && <span className="truncate text-sm">{t('support.button')}</span>}
          </button>
        )}

        {/* Navigation — scrolls on short screens so the bottom items never vanish */}
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-0.5',
            collapsed ? 'items-center' : 'w-full'
          )}
        >
          {ITEMS.map((it) => (
            <div key={it.view} className={cn('shrink-0', !collapsed && 'w-full')}>
              {navBtn(
                it.view,
                it.icon,
                it.labelKey,
                it.view === 'issues' ? issueCount : undefined
              )}
            </div>
          ))}
        </div>

        {/* Separator above the bottom utility block */}
        <div className={cn('my-1 h-px shrink-0 bg-border', collapsed ? 'w-8' : 'w-full')} />

        {/* Manual + Help + Settings pinned to the bottom */}
        <div className={cn('flex shrink-0 flex-col gap-1', collapsed ? 'items-center' : 'w-full')}>
          {withTip(
            'help.openManual',
            <button
              onClick={() => void window.api.app.openManual()}
              className={cn(
                'flex h-10 items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                collapsed ? 'w-10 justify-center' : 'w-full gap-3 px-3'
              )}
            >
              <BookOpen className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate text-sm font-medium">{t('help.openManual')}</span>}
            </button>
          )}
          {withTip(
            'nav.help',
            <button
              onClick={() => setHelpOpen(true)}
              data-testid="open-help"
              className={cn(
                'flex h-10 items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                collapsed ? 'w-10 justify-center' : 'w-full gap-3 px-3'
              )}
            >
              <HelpCircle className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate text-sm font-medium">{t('nav.help')}</span>}
            </button>
          )}
          {navBtn('settings', Settings, 'nav.settings')}
        </div>
      </aside>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} currentView={view} />
    </TooltipProvider>
  )
}
