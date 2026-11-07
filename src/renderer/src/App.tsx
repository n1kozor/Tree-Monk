import { useEffect, useRef, useState } from 'react'
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
import { AtlasView } from '@/components/map/AtlasView'
import { PeopleView } from '@/components/people/PeopleView'
import { FamiliesView } from '@/components/families/FamiliesView'
import { DocumentsView } from '@/components/documents/DocumentsView'
import { IssuesView } from '@/components/issues/IssuesView'
import { QueryView } from '@/components/query/QueryView'
import { RelationshipView } from '@/components/kinship/RelationshipView'
import { CollapseView } from '@/components/collapse/CollapseView'
import { AuditView } from '@/components/audit/AuditView'
import { ResearchView } from '@/components/research/ResearchView'
import { TodosView } from '@/components/todos/TodosView'
import { CalendarView } from '@/components/calendar/CalendarView'
import { ChangelogView } from '@/components/changelog/ChangelogView'
import { ProfileView } from '@/components/profile/ProfileView'
import { SettingsView } from '@/components/settings/SettingsView'
import { PluginHost } from '@/components/plugins/PluginHost'
import { PluginsView } from '@/components/plugins/PluginsView'
import { PluginDevGuideView } from '@/components/plugins/PluginDevGuideView'
import { PluginInstallDialog } from '@/components/plugins/PluginInstallDialog'
import { MediaDownloadProgress } from '@/components/common/MediaDownloadProgress'
import { GedcomSummaryDialog } from '@/components/common/GedcomSummaryDialog'
import { CommandPalette } from '@/components/CommandPalette'
import { SupportInviteDialog } from '@/components/common/SupportInviteDialog'
import { StartModeDialog } from '@/components/common/StartModeDialog'
import { FamilySearchDialog } from '@/components/settings/FamilySearchDialog'
import { clearStartChoice, fsArrivedNoticeSeen, isFsMode, markReimportNoticeSeen, markStartChoiceSeen, setFsMode, startChoiceSeen } from '@/lib/fsMode'
import { isFamilySearchId } from '@/lib/familySearchSearch'
import { ReimportNoticeDialog } from '@/components/common/ReimportNoticeDialog'
import { FsSessionDialog } from '@/components/common/FsSessionDialog'
import { useFsSession } from '@/hooks/useFsSession'
import { FS_SESSION_REQUIRED_EVENT } from '@/lib/fsSession'
import { isDemo } from '@/lib/demo'
import { PersonPanel } from '@/components/person/PersonPanel'
import { Preloader } from '@/components/common/Preloader'
import { FsImportPill } from '@/components/common/FsImportPill'

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
      {view === 'map' && <AtlasView />}
      {view === 'people' && <PeopleView />}
      {view === 'families' && <FamiliesView />}
      {view === 'documents' && <DocumentsView />}
      {view === 'issues' && <IssuesView />}
      {view === 'query' && <QueryView />}
      {view === 'kinship' && <RelationshipView />}
      {view === 'collapse' && <CollapseView />}
      {view === 'research' && <ResearchView />}
      {view === 'todos' && <TodosView />}
      {view === 'audit' && <AuditView />}
      {view === 'calendar' && <CalendarView />}
      {view === 'changelog' && <ChangelogView />}
      {view === 'settings' && <SettingsView />}
      {view === 'plugin' && <PluginHost />}
      {view === 'plugins' && <PluginsView />}
      {view === 'pluginGuide' && <PluginDevGuideView />}
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
  const [startOpen, setStartOpen] = useState(false)
  const [reimportOpen, setReimportOpen] = useState(false)
  const [fsHubOpen, setFsHubOpen] = useState(false)
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
      // Keep the splash up long enough for its full draw-in animation to play
      // out AND let the TreeMonk wordmark linger (tree grows ~1.8s, the wordmark
      // writes + fills by ~3.3s, then it holds on screen for a beat).
      const wait = Math.max(0, 5500 - (performance.now() - started))
      setTimeout(() => setReady(true), wait)
    })
    return () => clearTimeout(watchdog)
  }, [refreshAll])

  // Empty database (first launch, after a wipe, or a brand-new tree) → offer
  // the mode choice (FamilySearch is greyed out / coming soon). An EXISTING
  // database (users updating the app) is NEVER touched or nagged: it just keeps
  // working in Manual mode — no dialog, no wipe.
  useEffect(() => {
    if (!ready || isDemo()) return
    void (async () => {
      // A profile bootstrapped from NOTHING in this very run (fresh install, or
      // the data folder was wiped/moved) resets the first-launch choices —
      // otherwise a stale localStorage flag suppressed the start chooser on a
      // completely empty profile.
      const fresh = await window.api.workspaces.freshBootstrap?.().catch(() => false)
      if (fresh) clearStartChoice()

      // Self-heal: the mode is DERIVED FROM THE DATA, not trusted to a fragile
      // flag — a tree containing FamilySearch-linked people IS a FamilySearch
      // tree, and a live FS session also implies FS mode. This restores everyone
      // whose flag was zeroed by the old every-start reset bug. Manual/GEDCOM
      // trees have neither FS-linked people nor a session, so they're safe.
      const empty = useAppStore.getState().peopleById.size === 0
      if (!isFsMode() && !empty) {
        const anyFsPerson = [...useAppStore.getState().peopleById.values()].some((p) =>
          isFamilySearchId(p.fsId)
        )
        if (anyFsPerson) {
          markStartChoiceSeen()
          setFsMode(true)
        } else {
          void window.api.familysearch.signedIn?.().then((si) => {
            if (si && !isFsMode()) {
              markStartChoiceSeen()
              setFsMode(true)
            }
          })
        }
      }
      if (empty && !startChoiceSeen()) {
        setStartOpen(true)
      } else if (!empty && !startChoiceSeen()) {
        // Existing users updating from a pre-chooser version (data present but
        // the choice never made): default them to Manual ONCE and never nag. It
        // must NOT run when a choice exists — it used to reset a chosen FS mode
        // on every restart, making all FamilySearch features vanish.
        markStartChoiceSeen()
        markReimportNoticeSeen()
        setFsMode(false)
      }
    })()
  }, [ready])

  // The 1.8.17 "FamilySearch needs a NEW family tree" notice. Deliberately
  // UNCONDITIONAL: shown exactly once per installation on the next start, no
  // matter which tree is open, which mode it is in, or whether the build has an
  // AppKey. Its earlier data-dependent gating meant an empty tree never saw it.
  useEffect(() => {
    if (!ready || isDemo()) return
    if (fsArrivedNoticeSeen()) return
    setReimportOpen(true)
  }, [ready])

  // Expired FamilySearch session (FS-mode tree, 24h token lapsed): pop the
  // sign-in modal ONCE per app run — afterwards the amber topbar badge keeps
  // reminding until they sign in.
  const { status: fsSession, recheck: recheckFsSession } = useFsSession()
  const [fsSessionOpen, setFsSessionOpen] = useState(false)
  const fsSessionPrompted = useRef(false)
  useEffect(() => {
    if (!ready || fsSession !== 'expired' || fsSessionPrompted.current) return
    fsSessionPrompted.current = true
    setFsSessionOpen(true)
  }, [ready, fsSession])
  // A user-initiated FS action (sync, expand, scan…) hit the expired session:
  // always pop the dialog, even if the startup prompt was already shown.
  useEffect(() => {
    const openIt = (): void => setFsSessionOpen(true)
    window.addEventListener(FS_SESSION_REQUIRED_EVENT, openIt)
    return () => window.removeEventListener(FS_SESSION_REQUIRED_EVENT, openIt)
  }, [])

  // The "FamilySearch connection is in development" notice is GONE: the
  // integration shipped, so announcing it as upcoming would be wrong. The
  // fsAnnounce IPC + seen-flag stay in place so existing installs (which may
  // have the flag set) keep working and the support invitation still sequences
  // correctly below.

  // One-time, no-pressure support invitation — shown shortly after launch.
  // Once seen (closed any way), NEVER again (flag stored in the DB).
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    if (isDemo()) return
    // No longer gated on the (removed) FamilySearch announcement having been
    // seen — that flag is never set on new installs now, which would have
    // suppressed this invitation forever.
    void window.api.supportInvite
      ?.status()
      .then((seen) => {
        if (cancelled || seen) return
        timer = setTimeout(() => !cancelled && setSupportInviteOpen(true), 1500)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  // External API writes → refresh the stores (debounced; scripts can burst).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = window.api.apiServer?.onExternalChange?.(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void useAppStore.getState().refreshAll(), 400)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsub?.()
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
  // Fires ONCE per app run: the deps re-run this effect on a language switch,
  // and the pending flag is legitimately set while an import is RUNNING — both
  // used to pop a bogus "import was interrupted" toast mid-import.
  const pendingChecked = useRef(false)
  useEffect(() => {
    if (pendingChecked.current) return
    pendingChecked.current = true
    void window.api.familysearch.pending?.().then((pending) => {
      if (!pending) return
      if (useAppStore.getState().fsImport?.running) return
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
      <FsImportPill />
      <div className="flex h-screen w-screen overflow-hidden bg-transparent text-foreground">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <TabBar />
          <main className="relative min-h-0 flex-1">
            <ActiveView />
          </main>
        </div>
        <PersonPanel />
        <MediaDownloadProgress />
        <GedcomSummaryDialog />
        <PluginInstallDialog />
        <CommandPalette />
        <SupportInviteDialog open={supportInviteOpen} onOpenChange={setSupportInviteOpen} />
          {/* The notice always wins the first slot — the chooser follows once it is
          dismissed, so a fresh install never gets two stacked modals. */}
      <StartModeDialog open={startOpen && !reimportOpen} onOpenChange={setStartOpen} onChooseFs={() => setFsHubOpen(true)} />
        <ReimportNoticeDialog open={reimportOpen} onOpenChange={setReimportOpen} />
        <FsSessionDialog open={fsSessionOpen} onOpenChange={setFsSessionOpen} onSignedIn={() => void recheckFsSession()} />
        <FamilySearchDialog open={fsHubOpen} onOpenChange={setFsHubOpen} mandatory />
        <Toaster theme={theme} position="bottom-right" richColors />
      </div>
    </MotionConfig>
  )
}
