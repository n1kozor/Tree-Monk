import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MotionConfig, AnimatePresence } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { TabBar } from '@/components/layout/TabBar'
import { useAppStore } from '@/store/useAppStore'
import { useTheme } from '@/store/useTheme'
import { useSettings } from '@/store/useSettings'
import { InvestigationBoard } from '@/components/board/InvestigationBoard'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { FamilyTree } from '@/components/tree/FamilyTree'
import { GenealogyMap } from '@/components/map/GenealogyMap'
import { PeopleView } from '@/components/people/PeopleView'
import { DocumentsView } from '@/components/documents/DocumentsView'
import { IssuesView } from '@/components/issues/IssuesView'
import { QueryView } from '@/components/query/QueryView'
import { RelationshipView } from '@/components/kinship/RelationshipView'
import { AuditView } from '@/components/audit/AuditView'
import { CalendarView } from '@/components/calendar/CalendarView'
import { ChangelogView } from '@/components/changelog/ChangelogView'
import { ProfileView } from '@/components/profile/ProfileView'
import { SettingsView } from '@/components/settings/SettingsView'
import { FamilySearchProgress } from '@/components/settings/FamilySearchProgress'
import { MediaDownloadProgress } from '@/components/common/MediaDownloadProgress'
import { CommandPalette } from '@/components/CommandPalette'
import { SupportInviteDialog } from '@/components/common/SupportInviteDialog'
import { FsAnnounceDialog } from '@/components/common/FsAnnounceDialog'
import { isDemo } from '@/lib/demo'
import { PersonPanel } from '@/components/person/PersonPanel'
import { Preloader } from '@/components/common/Preloader'

/** The current sidebar view (a single slot — views are NOT tabs). Tree and board
 *  stay mounted after the first visit so their state survives navigation. */
function ViewRenderer(): JSX.Element {
  const view = useAppStore((s) => s.view)
  const [treeEver, setTreeEver] = useState(view === 'tree')
  const [boardEver, setBoardEver] = useState(view === 'board')
  useEffect(() => {
    if (view === 'tree') setTreeEver(true)
    if (view === 'board') setBoardEver(true)
  }, [view])
  return (
    <div className="h-full w-full" data-testid="view-root" data-view={view}>
      {treeEver && (
        <div className={view === 'tree' ? 'h-full w-full' : 'hidden'}>
          <FamilyTree />
        </div>
      )}
      {boardEver && (
        <div className={view === 'board' ? 'h-full w-full' : 'hidden'}>
          <InvestigationBoard />
        </div>
      )}
      {view === 'dashboard' && <DashboardView />}
      {view === 'map' && <GenealogyMap />}
      {view === 'people' && <PeopleView />}
      {view === 'documents' && <DocumentsView />}
      {view === 'issues' && <IssuesView />}
      {view === 'query' && <QueryView />}
      {view === 'kinship' && <RelationshipView />}
      {view === 'audit' && <AuditView />}
      {view === 'calendar' && <CalendarView />}
      {view === 'changelog' && <ChangelogView />}
      {view === 'settings' && <SettingsView />}
    </div>
  )
}

/**
 * The plain view plus every open profile tab, all kept mounted and shown/hidden
 * via CSS — so each profile (and the tree/board viewport) survives switching away
 * and back. `activeTabId === null` shows the view; otherwise that profile tab.
 */
function ActiveView(): JSX.Element {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)

  // A profile is mounted only once its tab has been active at least once (a tab
  // mounted while hidden would get 0×0 dimensions).
  const [seen, setSeen] = useState<Set<string>>(() => new Set(activeTabId ? [activeTabId] : []))
  useEffect(() => {
    if (activeTabId) setSeen((prev) => (prev.has(activeTabId) ? prev : new Set(prev).add(activeTabId)))
  }, [activeTabId])

  return (
    <>
      <div className={activeTabId === null ? 'h-full w-full' : 'hidden'}>
        <ViewRenderer />
      </div>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        if ((!isActive && !seen.has(tab.id)) || !tab.ref) return null
        return (
          <div key={tab.id} className={isActive ? 'h-full w-full' : 'hidden'}>
            <ProfileView personId={tab.ref} />
          </div>
        )
      })}
    </>
  )
}

export default function App(): JSX.Element {
  const refreshAll = useAppStore((s) => s.refreshAll)
  const theme = useTheme((s) => s.theme)
  const animations = useSettings((s) => s.animations)
  const { t } = useTranslation() // re-render on language change
  const [supportInviteOpen, setSupportInviteOpen] = useState(false)
  const [fsAnnounceOpen, setFsAnnounceOpen] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const started = performance.now()
    // Watchdog: never leave the user stranded on the splash. If the first data
    // load hasn't finished in 20s (e.g. a contended/locked database on a rare
    // machine), drop the splash anyway so the app — and any error — is visible
    // instead of an eternal preloader.
    const watchdog = setTimeout(() => setReady(true), 20000)
    void refreshAll().finally(() => {
      clearTimeout(watchdog)
      // Keep the splash up long enough for its draw-in animation to play out.
      const wait = Math.max(0, 1200 - (performance.now() - started))
      setTimeout(() => setReady(true), wait)
    })
    return () => clearTimeout(watchdog)
  }, [refreshAll])

  // One-time notice that the new FamilySearch API connection is in development —
  // shown once shortly after launch, BEFORE the support invitation.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    if (isDemo()) return
    void window.api.fsAnnounce
      ?.status()
      .then((seen) => {
        if (cancelled || seen) return
        timer = setTimeout(() => !cancelled && setFsAnnounceOpen(true), 900)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  // One-time, no-pressure support invitation — shown shortly after launch, but
  // only once the FamilySearch notice above has been seen (so it comes second).
  // Once seen (closed any way), NEVER again (flag stored in the DB).
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    if (isDemo()) return
    void Promise.all([window.api.supportInvite?.status(), window.api.fsAnnounce?.status()])
      .then(([seen, fsSeen]) => {
        if (cancelled || seen || !fsSeen) return
        timer = setTimeout(() => !cancelled && setSupportInviteOpen(true), 1500)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  // Browser-style Ctrl/⌘+Tab cycling between open tabs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || !(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const s = useAppStore.getState()
      const n = s.tabs.length
      if (n < 2) return
      const i = s.tabs.findIndex((t) => t.id === s.activeTabId)
      const next = e.shiftKey ? (i - 1 + n) % n : (i + 1) % n
      s.activateTab(s.tabs[next].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // During the main FamilySearch import, the moment the chosen starting person
  // streams in, select them as the app's root so the top bar updates live. Pull
  // the people first so the selector can render their name straight away.
  useEffect(() => {
    const unsub = window.api.familysearch.onRootSet?.((personId) => {
      const store = useAppStore.getState()
      void store.refreshPeople().then(() => store.setDefaultRoot(personId))
    })
    return () => unsub?.()
  }, [])

  // If a FamilySearch import was interrupted (app killed mid-run), tell the user
  // on launch and offer a one-click cleanup of the empty entities it left.
  useEffect(() => {
    void window.api.familysearch.pending?.().then((pending) => {
      if (!pending) return
      toast.warning(t('fs.interrupted'), {
        duration: 12000,
        action: {
          label: t('fs.cleanup'),
          onClick: () =>
            void window.api.db.cleanup().then((n) => {
              void refreshAll()
              toast.success(n > 0 ? t('fs.cleanupDone', { count: n }) : t('fs.cleanupNone'))
            })
        }
      })
    })
  }, [t, refreshAll])

  return (
    <MotionConfig reducedMotion={animations ? 'never' : 'always'}>
      <AnimatePresence>{!ready && <Preloader key="preloader" />}</AnimatePresence>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <TabBar />
          <main className="relative min-h-0 flex-1">
            <ActiveView />
          </main>
        </div>
        <PersonPanel />
        <FamilySearchProgress />
        <MediaDownloadProgress />
        <CommandPalette />
        <SupportInviteDialog open={supportInviteOpen} onOpenChange={setSupportInviteOpen} />
        <FsAnnounceDialog open={fsAnnounceOpen} onOpenChange={setFsAnnounceOpen} />
        <Toaster theme={theme} position="bottom-right" richColors />
      </div>
    </MotionConfig>
  )
}
