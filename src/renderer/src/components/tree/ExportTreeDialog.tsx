import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { FileText, ImageIcon, Loader2, Minus, Plus, Printer } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/useAppStore'
import { usePedigreeSettings } from '@/store/usePedigreeSettings'
import type {
  ExportPaper,
  PedigreeCouple,
  TreeExportPayload,
  TreeNodeDatum
} from '@shared/types'
import { PRINT, wrapPoster, type ExportContent } from './export/svgKit'
import { buildPedigreeTreeSvg } from './export/pedigree'
import { buildFanTreeSvg } from './export/fan'

type Mode = 'pedigree' | 'fan'
type Format = 'pdf' | 'svg'
type PdfLayout = 'single' | 'tiled'

const PAPERS: ExportPaper[] = ['A4', 'A3', 'A2', 'A1', 'A0']
const PAPER_MM: Record<ExportPaper, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189]
}
const PX_PER_MM = 96 / 25.4

/** True if a `#rrggbb` page background is dark (so on-page text should be light). */
function isDarkBg(hex: string): boolean {
  const m = hex.replace('#', '')
  if (m.length < 6) return false
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return false
  return 0.299 * r + 0.587 * g + 0.114 * b < 140
}

function tileCount(
  width: number,
  height: number,
  paper: ExportPaper,
  orientation: 'portrait' | 'landscape',
  overlapMm: number
): { cols: number; rows: number; pages: number } {
  let [pw, ph] = PAPER_MM[paper]
  if (orientation === 'landscape') [pw, ph] = [ph, pw]
  const tileW = pw * PX_PER_MM
  const tileH = ph * PX_PER_MM
  const ov = Math.max(0, overlapMm) * PX_PER_MM
  const sx = Math.max(1, tileW - ov)
  const sy = Math.max(1, tileH - ov)
  const cols = Math.max(1, Math.ceil((width - tileW) / sx) + 1)
  const rows = Math.max(1, Math.ceil((height - tileH) / sy) + 1)
  return { cols, rows, pages: cols * rows }
}

function collectPedigreeIds(root: PedigreeCouple): string[] {
  const ids = new Set<string>()
  const seen = new Set<PedigreeCouple>()
  const walk = (c: PedigreeCouple | null): void => {
    if (!c || seen.has(c)) return
    seen.add(c)
    if (c.primary) ids.add(c.primary.id)
    if (c.partner) ids.add(c.partner.id)
    walk(c.fatherParents)
    walk(c.motherParents)
    c.descendants.forEach(walk)
  }
  walk(root)
  return [...ids]
}

function collectFanIds(data: TreeNodeDatum, gens: number): string[] {
  const ids: string[] = []
  const walk = (n: TreeNodeDatum, gen: number): void => {
    if (n.personId) ids.push(n.personId)
    if (gen >= gens) return
    ;(n.children ?? []).forEach((c) => walk(c, gen + 1))
  }
  walk(data, 0)
  return ids
}

export function ExportTreeDialog({
  open,
  onOpenChange,
  view,
  rootId,
  rootFamilyId,
  fanGenerations
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  view: 'landscape' | 'fan' | 'hierarchy'
  rootId?: string
  rootFamilyId?: string
  fanGenerations: number
}): JSX.Element {
  const { t } = useTranslation()
  const ped = usePedigreeSettings()
  const peopleById = useAppStore((s) => s.peopleById)

  const [mode, setMode] = useState<Mode>(view === 'fan' ? 'fan' : 'pedigree')
  const [ancGenerations, setAncGenerations] = useState(6)
  const [descGenerations, setDescGenerations] = useState(2)
  const [fanGens, setFanGens] = useState(fanGenerations)
  const [photos, setPhotos] = useState(true)
  const [dates, setDates] = useState(true)
  const [places, setPlaces] = useState(true)
  const [docs, setDocs] = useState(true)
  const [hideLiving, setHideLiving] = useState(false)
  const [format, setFormat] = useState<Format>('pdf')
  const [pdfLayout, setPdfLayout] = useState<PdfLayout>('tiled')
  const [paper, setPaper] = useState<ExportPaper>('A3')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape')
  const [overlapMm, setOverlapMm] = useState(8)
  const [cropMarks, setCropMarks] = useState(true)
  const [title, setTitle] = useState(t('export.defaultTitle'))
  const [bgColor, setBgColor] = useState<string>(PRINT.bg)
  const [busy, setBusy] = useState(false)

  // Cache the raw projection so option tweaks recompute size synchronously.
  const [pedRoot, setPedRoot] = useState<PedigreeCouple | null>(null)
  const [fanData, setFanData] = useState<TreeNodeDatum | null>(null)
  const reqRef = useRef(0)

  useEffect(() => {
    if (!open) return
    setMode(view === 'fan' ? 'fan' : 'pedigree')
    setFanGens(fanGenerations)
    setTitle((cur) => cur || t('export.defaultTitle'))
  }, [open, view, fanGenerations, t])

  useEffect(() => {
    if (!open) return
    const id = ++reqRef.current
    void window.api.tree.pedigree(rootId, rootFamilyId).then((r) => {
      if (reqRef.current === id) setPedRoot(r)
    })
    void window.api.tree.build(rootId, 'ancestors').then((r) => {
      if (reqRef.current === id) setFanData(r[0] ?? null)
    })
  }, [open, rootId, rootFamilyId])

  // Build a content object; avatars only loaded at export time.
  const makeContent = (avatars: Map<string, string>, withPhotos: boolean): ExportContent => ({
    photos: withPhotos,
    dates,
    places,
    docs,
    hideLiving,
    livingLabel: t('export.living'),
    deceasedLabel: t('export.deceased'),
    childrenLabel: t('person.children'),
    avatars,
    title: title.trim(),
    subtitle: '',
    footerRight: `TreeMonk · ${new Date().toLocaleDateString()}`,
    legend: {
      male: t('export.male'),
      female: t('export.female'),
      unknown: t('export.unknown'),
      docs: t('export.docsLegend')
    },
    accent: ped.accent.startsWith('#') ? ped.accent : '#475569',
    // Title / legend / footer sit on the page background, so flip them to light
    // ink when the chosen background is dark (cards stay white-on-dark text).
    ink: isDarkBg(bgColor) ? '#f4f4f5' : PRINT.ink,
    muted: isDarkBg(bgColor) ? '#a1a1aa' : PRINT.muted,
    border: isDarkBg(bgColor) ? '#52525b' : PRINT.border
  })

  // Size estimate (no avatars — dimensions don't depend on photos).
  const dims = useMemo(() => {
    try {
      const content = makeContent(new Map(), false)
      if (mode === 'pedigree') {
        if (!pedRoot) return null
        const tree = buildPedigreeTreeSvg(
          pedRoot,
          { colGap: ped.colGap, rowGap: ped.rowGap, ancGenerations, descGenerations },
          content
        )
        const final = wrapPoster(content, tree)
        return { width: final.width, height: final.height }
      }
      if (!fanData) return null
      const tree = buildFanTreeSvg(fanData, fanGens, content)
      const final = wrapPoster(content, tree)
      return { width: final.width, height: final.height }
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    pedRoot,
    fanData,
    ancGenerations,
    descGenerations,
    fanGens,
    dates,
    places,
    docs,
    hideLiving,
    title,
    ped.colGap,
    ped.rowGap
  ])

  const tiles =
    dims && format === 'pdf' && pdfLayout === 'tiled'
      ? tileCount(dims.width, dims.height, paper, orientation, overlapMm)
      : null

  async function loadAvatars(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    const entries = await Promise.all(
      ids.map(async (id) => {
        const photoId = peopleById.get(id)?.profilePhotoId
        if (!photoId) return null
        const url = await window.api.documents.dataUrl(photoId)
        return url ? ([id, url] as const) : null
      })
    )
    for (const e of entries) if (e) map.set(e[0], e[1])
    return map
  }

  async function doExport(): Promise<void> {
    setBusy(true)
    try {
      let final: ReturnType<typeof wrapPoster>
      if (mode === 'pedigree') {
        const root = pedRoot ?? (await window.api.tree.pedigree(rootId, rootFamilyId))
        if (!root) {
          toast.error(t('export.emptyTree'))
          return
        }
        const avatars = photos ? await loadAvatars(collectPedigreeIds(root)) : new Map<string, string>()
        const content = makeContent(avatars, photos)
        const tree = buildPedigreeTreeSvg(
          root,
          { colGap: ped.colGap, rowGap: ped.rowGap, ancGenerations, descGenerations },
          content
        )
        final = wrapPoster(content, tree)
      } else {
        const data = fanData ?? (await window.api.tree.build(rootId, 'ancestors'))[0] ?? null
        if (!data) {
          toast.error(t('export.emptyTree'))
          return
        }
        const content = makeContent(new Map(), false)
        const tree = buildFanTreeSvg(data, fanGens, content)
        final = wrapPoster(content, tree)
      }

      const payload: TreeExportPayload = {
        defs: final.defs,
        pieces: final.pieces,
        width: final.width,
        height: final.height,
        background: bgColor,
        format,
        pdfLayout,
        paper,
        orientation,
        overlapMm,
        cropMarks,
        fileName: `treemonk-${mode}`
      }
      const res = await window.api.tree.exportImage(payload)
      if (res) {
        toast.success(t('export.done', { pages: res.pages, path: res.path }))
        onOpenChange(false)
      }
    } catch (err) {
      toast.error(t('export.failed', { error: String(err) }))
    } finally {
      setBusy(false)
    }
  }

  const mm = (px: number): number => Math.round(px / PX_PER_MM)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> {t('export.title')}
          </DialogTitle>
          <DialogDescription>{t('export.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {/* Mode */}
          <Field label={t('export.mode')}>
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={[
                { value: 'pedigree', label: t('tree.viewLandscape') },
                { value: 'fan', label: t('tree.viewFan') }
              ]}
            />
          </Field>

          {/* Generations */}
          {mode === 'pedigree' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('export.ancGenerations')}>
                <Stepper value={ancGenerations} min={1} max={20} onChange={setAncGenerations} />
              </Field>
              <Field label={t('export.descGenerations')}>
                <Stepper value={descGenerations} min={0} max={8} onChange={setDescGenerations} />
              </Field>
            </div>
          ) : (
            <Field label={t('tree.generations')}>
              <Stepper value={fanGens} min={2} max={9} onChange={setFanGens} />
            </Field>
          )}

          {/* Content toggles */}
          <Field label={t('export.include')}>
            <div className="flex flex-wrap gap-2">
              {mode === 'pedigree' && (
                <Toggle on={photos} onToggle={() => setPhotos((v) => !v)} label={t('export.photos')} />
              )}
              <Toggle on={dates} onToggle={() => setDates((v) => !v)} label={t('export.datesLabel')} />
              {mode === 'pedigree' && (
                <Toggle on={places} onToggle={() => setPlaces((v) => !v)} label={t('export.places')} />
              )}
              {mode === 'pedigree' && (
                <Toggle on={docs} onToggle={() => setDocs((v) => !v)} label={t('export.docsLabel')} />
              )}
              <Toggle
                on={hideLiving}
                onToggle={() => setHideLiving((v) => !v)}
                label={t('export.hideLiving')}
              />
            </div>
          </Field>

          {/* Title */}
          <Field label={t('export.titleField')}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('export.defaultTitle')} />
          </Field>

          {/* Background colour (any colour on paper) */}
          <Field label={t('export.background')}>
            <div className="flex flex-wrap items-center gap-1.5">
              {['#ffffff', '#faf7ef', '#f3efe4', '#eef2f6', '#efe7d6', '#1f2430', '#0f1118'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBgColor(c)}
                  title={c}
                  className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                    bgColor.toLowerCase() === c ? 'border-foreground' : 'border-transparent'
                  }`}
                  style={{ background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }}
                />
              ))}
              <label
                title={t('tree.customColor')}
                className={`relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border-2 ${
                  ['#ffffff', '#faf7ef', '#f3efe4', '#eef2f6', '#efe7d6', '#1f2430', '#0f1118'].includes(bgColor.toLowerCase())
                    ? 'border-dashed border-muted-foreground/50'
                    : 'border-foreground'
                }`}
                style={{ background: bgColor }}
              >
                <input
                  type="color"
                  value={bgColor.startsWith('#') ? bgColor : '#ffffff'}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            </div>
          </Field>

          {/* Format */}
          <Field label={t('export.format')}>
            <Segmented
              value={format}
              onChange={(v) => setFormat(v as Format)}
              options={[
                { value: 'pdf', label: 'PDF', icon: <FileText className="h-3.5 w-3.5" /> },
                { value: 'svg', label: 'SVG', icon: <ImageIcon className="h-3.5 w-3.5" /> }
              ]}
            />
          </Field>

          {/* PDF layout options */}
          {format === 'pdf' && (
            <>
              <Field label={t('export.pdfLayout')}>
                <Segmented
                  value={pdfLayout}
                  onChange={(v) => setPdfLayout(v as PdfLayout)}
                  options={[
                    { value: 'tiled', label: t('export.tiled') },
                    { value: 'single', label: t('export.singlePage') }
                  ]}
                />
              </Field>
              {pdfLayout === 'tiled' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('export.paper')}>
                    <Segmented
                      value={paper}
                      onChange={(v) => setPaper(v as ExportPaper)}
                      options={PAPERS.map((p) => ({ value: p, label: p }))}
                    />
                  </Field>
                  <Field label={t('export.orientation')}>
                    <Segmented
                      value={orientation}
                      onChange={(v) => setOrientation(v as 'portrait' | 'landscape')}
                      options={[
                        { value: 'landscape', label: t('export.landscape') },
                        { value: 'portrait', label: t('export.portrait') }
                      ]}
                    />
                  </Field>
                  <Field label={t('export.overlap')}>
                    <Stepper value={overlapMm} min={0} max={30} step={2} onChange={setOverlapMm} suffix="mm" />
                  </Field>
                  <Field label={t('export.cropMarks')}>
                    <Toggle on={cropMarks} onToggle={() => setCropMarks((v) => !v)} label={t('export.cropMarksOn')} />
                  </Field>
                </div>
              )}
            </>
          )}

          {/* Estimate */}
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            {dims ? (
              <>
                {t('export.estSize', { w: mm(dims.width), h: mm(dims.height) })}
                {tiles && (
                  <>
                    {' · '}
                    {t('export.estTiles', { pages: tiles.pages, cols: tiles.cols, rows: tiles.rows })}
                  </>
                )}
              </>
            ) : (
              t('export.computing')
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={doExport} disabled={busy || !dims} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {t('export.action')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Segmented({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; icon?: React.ReactNode }[]
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-secondary/40 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o.value
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Stepper({
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange
}: {
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[3rem] text-center text-xs tabular-nums text-foreground">
        {value}
        {suffix ? ` ${suffix}` : ''}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function Toggle({
  on,
  onToggle,
  label
}: {
  on: boolean
  onToggle: () => void
  label: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        on
          ? 'border-primary/40 bg-primary/20 text-primary'
          : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )
}
