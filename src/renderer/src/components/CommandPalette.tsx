import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isFsMode } from '@/lib/fsMode'
import {
  AlertTriangle,
  CornerDownLeft,
  Download,
  FileText,
  Filter,
  LayoutDashboard,
  type LucideIcon,
  Map as MapIcon,
  Network,
  Save,
  Search,
  Settings,
  Upload,
  UserPlus,
  Users
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, fullName, yearOf } from '@/lib/utils'
import { norm } from '@/lib/nameMatch'
import { aliasMap, personScore } from '@/lib/personSearch'
import { importGedcomWithToast } from '@/lib/importGedcom'
import { useAppStore, type View } from '@/store/useAppStore'
import { PersonAvatar } from '@/components/common/PersonAvatar'

interface CmdItem {
  id: string
  label: string
  hint?: string
  category: string
  icon: LucideIcon
  /** Avatar info for person items. */
  person?: { id: string; sex: 'M' | 'F' | 'U' }
  disabled?: boolean
  score: number
  run: () => void
}

/** Lightweight subsequence fuzzy score for command labels (0 = no match). */
function fuzzy(query: string, label: string): number {
  const q = norm(query)
  const l = norm(label)
  if (!q) return 1
  if (l.includes(q)) return l.startsWith(q) ? 3 : 2
  let i = 0
  for (let j = 0; j < l.length && i < q.length; j++) if (l[j] === q[i]) i++
  return i === q.length ? 1 : 0
}

export function CommandPalette(): JSX.Element | null {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const setView = useAppStore((s) => s.setView)
  const focusPersonTree = useAppStore((s) => s.focusPersonTree)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const refreshAll = useAppStore((s) => s.refreshAll)
  const people = useAppStore((s) => s.people)
  const aliases = useAppStore((s) => s.aliases)
  const families = useAppStore((s) => s.families)
  const selectedPersonId = useAppStore((s) => s.selectedPersonId)

  // ---- Global Cmd/Ctrl+K ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  const close = useCallback(() => setOpen(false), [])
  const go = useCallback(
    (fn: () => void) => {
      fn()
      close()
    },
    [close]
  )

  const activePerson = selectedPersonId ? people.find((p) => p.id === selectedPersonId) : undefined

  const addChildToActive = useCallback(async () => {
    if (!activePerson) return
    const fam = families.find((f) => f.husbandId === activePerson.id || f.wifeId === activePerson.id)
    const child = await window.api.people.create({ givenName: '', surname: activePerson.surname })
    if (fam) {
      await window.api.families.update(fam.id, { childIds: [...fam.childIds, child.id] })
    } else {
      const role = activePerson.sex === 'F' ? { wifeId: activePerson.id } : { husbandId: activePerson.id }
      await window.api.families.create({ ...role, childIds: [child.id] })
    }
    await refreshAll()
    selectPerson(child.id)
  }, [activePerson, families, refreshAll, selectPerson])

  // ---- Build the command list ----
  const items = useMemo<CmdItem[]>(() => {
    const q = query.trim()
    const out: CmdItem[] = []

    const NAV: { view: View; label: string; icon: LucideIcon }[] = [
      { view: 'board', label: t('nav.board'), icon: LayoutDashboard },
      { view: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
      { view: 'tree', label: t('nav.tree'), icon: Network },
      { view: 'map', label: t('nav.map'), icon: MapIcon },
      { view: 'people', label: t('nav.people'), icon: Users },
      { view: 'documents', label: t('nav.documents'), icon: FileText },
      { view: 'issues', label: t('nav.issues'), icon: AlertTriangle },
      { view: 'query', label: t('nav.query'), icon: Filter },
      { view: 'settings', label: t('nav.settings'), icon: Settings }
    ]
    for (const n of NAV) {
      const label = t('cmd.goTo', { name: n.label })
      const s = fuzzy(q, `${n.label} ${label}`)
      if (s) out.push({ id: `nav_${n.view}`, label, category: t('cmd.navigate'), icon: n.icon, score: s + 0.4, run: () => go(() => setView(n.view)) })
    }

    const ACTIONS: { id: string; label: string; icon: LucideIcon; disabled?: boolean; hidden?: boolean; run: () => void }[] = [
      {
        id: 'add_child',
        label: activePerson ? t('cmd.addChildTo', { name: fullName(activePerson) }) : t('cmd.addChild'),
        icon: UserPlus,
        disabled: !activePerson,
        run: () => go(() => void addChildToActive())
      },
      { id: 'export', label: t('cmd.exportGedcom'), icon: Download, run: () => go(() => void window.api.gedcom.export()) },
      {
        id: 'import',
        label: t('cmd.importGedcom'),
        hidden: isFsMode(),
        icon: Upload,
        run: () =>
          go(() =>
            void importGedcomWithToast(t).then((r) => {
              if (r) {
                void refreshAll()
                useAppStore.getState().setGedcomSummary(r)
              }
            })
          )
      },
      {
        id: 'backup',
        label: t('cmd.backup'),
        icon: Save,
        run: () =>
          go(() =>
            void window.api.backup.create().then((r) => r && toast.success(t('settings.backupDone', { path: r.path })))
          )
      }
    ]
    for (const a of ACTIONS) {
      const s = fuzzy(q, a.label)
      if (s && !a.hidden)
        out.push({ id: `act_${a.id}`, label: a.label, category: t('cmd.action'), icon: a.icon, disabled: a.disabled, score: s, run: a.run })
    }

    if (q) {
      const aMap = aliasMap(aliases)
      for (const p of people) {
        const s = personScore(p, aMap.get(p.id) ?? [], q)
        if (s <= 0) continue
        const span = `${yearOf(p.birthDate)}${p.deathDate ? '–' + yearOf(p.deathDate) : ''}`
        out.push({
          id: `p_${p.id}`,
          label: fullName(p),
          hint: span,
          category: t('cmd.people'),
          icon: Users,
          person: { id: p.id, sex: p.sex },
          score: s,
          run: () => go(() => focusPersonTree(p.id))
        })
      }
    }

    return out.sort((a, b) => b.score - a.score).slice(0, 50)
  }, [query, people, aliases, t, go, setView, addChildToActive, activePerson, refreshAll, focusPersonTree])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onInputKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const it = items[active]
      if (it && !it.disabled) it.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center pt-[12vh]" onMouseDown={close}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
      <div
        className="glass-strong relative w-full max-w-xl overflow-hidden rounded-3xl text-popover-foreground"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border/40 px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t('cmd.placeholder')}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('cmd.empty')}</p>
          )}
          {items.map((it, i) => (
            <button
              key={it.id}
              data-active={i === active}
              disabled={it.disabled}
              onMouseEnter={() => setActive(i)}
              onClick={() => !it.disabled && it.run()}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                i === active ? 'bg-accent' : 'hover:bg-accent/50',
                it.disabled && 'cursor-not-allowed opacity-40'
              )}
            >
              {it.person ? (
                <PersonAvatar personId={it.person.id} name={it.label} sex={it.person.sex} className="h-6 w-6 text-[9px]" />
              ) : (
                <it.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 truncate text-sm">{it.label}</span>
              {it.hint && <span className="text-xs text-muted-foreground">{it.hint}</span>}
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {it.category}
              </span>
              {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
