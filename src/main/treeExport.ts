import { BrowserWindow, dialog } from 'electron'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  ExportPaper,
  TreeExportPayload,
  TreeExportPiece,
  TreeExportResult
} from '@shared/types'

const FONT = "'Inter','Helvetica Neue',Arial,sans-serif"

/** ISO paper sizes, portrait, in millimetres. */
const PAPER_MM: Record<ExportPaper, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189]
}

// CSS reference pixel: 96px = 1in = 25.4mm. The renderer lays the tree out in
// these units, so the whole pipeline is resolution-independent.
const PX_PER_MM = 96 / 25.4
const mmToPx = (mm: number): number => mm * PX_PER_MM
const pxToMm = (px: number): number => px / PX_PER_MM
// Chromium clamps a single PDF page well under 200 inches; stay safely below so
// a down-scaled giant page never spills onto a second sheet.
const MAX_PAGE_MM = 4800

const SVG_NS = 'http://www.w3.org/2000/svg'

/** All pieces concatenated (whole-canvas SVG / single page). */
function allPieces(p: TreeExportPayload): string {
  return p.pieces.map((pc) => pc.svg).join('')
}

/** Pieces whose bounding box intersects the [ox,oy] × (w,h) tile rectangle. */
function piecesIn(
  pieces: TreeExportPiece[],
  ox: number,
  oy: number,
  w: number,
  h: number
): string {
  let out = ''
  for (const pc of pieces) {
    if (pc.x < ox + w && pc.x + pc.w > ox && pc.y < oy + h && pc.y + pc.h > oy) out += pc.svg
  }
  return out
}

/** A standalone, self-contained vector file — what the .svg export writes. */
function masterSvg(p: TreeExportPayload): string {
  return (
    `<svg xmlns="${SVG_NS}" width="${p.width}" height="${p.height}" ` +
    `viewBox="0 0 ${p.width} ${p.height}">` +
    `<rect x="0" y="0" width="${p.width}" height="${p.height}" fill="${p.background}"/>` +
    `<defs>${p.defs}</defs><g font-family="${FONT}">${allPieces(p)}</g></svg>`
  )
}

/** One giant page sized exactly to the content (down-scaled only if it would
 *  exceed Chromium's page limit). */
function singlePageHtml(p: TreeExportPayload): { html: string; pages: number } {
  let wmm = pxToMm(p.width)
  let hmm = pxToMm(p.height)
  const maxDim = Math.max(wmm, hmm)
  if (maxDim > MAX_PAGE_MM) {
    const s = MAX_PAGE_MM / maxDim
    wmm *= s
    hmm *= s
  }
  // Draw the SVG a hair smaller than the sheet so sub-pixel rounding never
  // spills a near-blank second page.
  const svgW = wmm - 1
  const svgH = hmm - 1
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `@page{size:${wmm}mm ${hmm}mm;margin:0}html,body{margin:0;padding:0}svg{display:block}` +
    `</style></head><body>` +
    `<svg xmlns="${SVG_NS}" width="${svgW}mm" height="${svgH}mm" ` +
    `viewBox="0 0 ${p.width} ${p.height}" preserveAspectRatio="xMidYMid meet">` +
    `<rect x="0" y="0" width="${p.width}" height="${p.height}" fill="${p.background}"/>` +
    `<defs>${p.defs}</defs><g font-family="${FONT}">${allPieces(p)}</g></svg></body></html>`
  return { html, pages: 1 }
}

/** Crop marks + a "row·col" label for one tile, in millimetre overlay space. */
function tileMarks(p: TreeExportPayload, r: number, c: number, rows: number, cols: number): string {
  if (!p.cropMarks) return ''
  const L = 5 // mark arm length, mm
  const corner = (pos: string): string =>
    `<div class="cm cm-${pos}" style="--l:${L}mm"></div>`
  return (
    corner('tl') +
    corner('tr') +
    corner('bl') +
    corner('br') +
    `<div class="lbl">${r + 1}·${c + 1} / ${rows}×${cols}</div>`
  )
}

/** Many same-sized sheets that together reconstruct the whole tree. */
function tiledHtml(p: TreeExportPayload): { html: string; pages: number } {
  let [pwmm, phmm] = PAPER_MM[p.paper]
  if (p.orientation === 'landscape') [pwmm, phmm] = [phmm, pwmm]
  const tileW = mmToPx(pwmm)
  const tileH = mmToPx(phmm)
  const ov = mmToPx(Math.max(0, p.overlapMm))
  const strideX = Math.max(1, tileW - ov)
  const strideY = Math.max(1, tileH - ov)
  const cols = Math.max(1, Math.ceil((p.width - tileW) / strideX) + 1)
  const rows = Math.max(1, Math.ceil((p.height - tileH) / strideY) + 1)

  let pagesHtml = ''
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ox = c * strideX
      const oy = r * strideY
      // Only the pieces overlapping THIS sheet are inlined — so a 300-tile poster
      // never instantiates the whole tree per page (which would exhaust memory).
      const body = piecesIn(p.pieces, ox, oy, tileW, tileH)
      pagesHtml +=
        `<div class="page">` +
        `<svg xmlns="${SVG_NS}" viewBox="${ox} ${oy} ${tileW} ${tileH}" ` +
        `preserveAspectRatio="xMinYMin meet"><defs>${p.defs}</defs>` +
        `<g font-family="${FONT}">${body}</g></svg>` +
        tileMarks(p, r, c, rows, cols) +
        `</div>`
    }
  }

  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `@page{size:${pwmm}mm ${phmm}mm;margin:0}` +
    `html,body{margin:0;padding:0}` +
    `.page{position:relative;width:${pwmm}mm;height:${phmm}mm;overflow:hidden;` +
    `background:${p.background};page-break-after:always}` +
    `.page:last-child{page-break-after:auto}` +
    `.page>svg{position:absolute;inset:0;width:100%;height:100%}` +
    `.cm{position:absolute;width:var(--l);height:var(--l);pointer-events:none}` +
    `.cm-tl{top:0;left:0;border-top:0.2mm solid #111;border-left:0.2mm solid #111}` +
    `.cm-tr{top:0;right:0;border-top:0.2mm solid #111;border-right:0.2mm solid #111}` +
    `.cm-bl{bottom:0;left:0;border-bottom:0.2mm solid #111;border-left:0.2mm solid #111}` +
    `.cm-br{bottom:0;right:0;border-bottom:0.2mm solid #111;border-right:0.2mm solid #111}` +
    `.lbl{position:absolute;bottom:1mm;left:0;right:0;text-align:center;` +
    `font:3mm/1 Arial,sans-serif;color:#888}` +
    `</style></head><body>` +
    pagesHtml +
    `</body></html>`
  return { html, pages: rows * cols }
}

// A single, lazily-created offscreen window is REUSED across every export.
// Spawning a fresh BrowserWindow per call proved unreliable (the 2nd window's
// loadFile fails with ERR_FAILED on some Linux/GPU setups), whereas re-loading
// one persistent window is rock-solid. It is torn down with the app.
let exportWin: BrowserWindow | null = null
// Serialise renders so two exports never share the one window mid-print.
let renderChain: Promise<unknown> = Promise.resolve()

function getExportWindow(): BrowserWindow {
  if (exportWin && !exportWin.isDestroyed()) return exportWin
  exportWin = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: { offscreen: false, sandbox: false }
  })
  return exportWin
}

/** Releases the hidden export window so it never blocks app shutdown. */
export function destroyExportWindow(): void {
  if (exportWin && !exportWin.isDestroyed()) exportWin.destroy()
  exportWin = null
}

/** Renders an HTML document to a PDF buffer in the shared offscreen window. */
function htmlToPdf(html: string): Promise<Buffer> {
  const run = renderChain.then(async () => {
    const win = getExportWindow()
    const dir = mkdtempSync(join(tmpdir(), 'treemonk-export-'))
    const htmlPath = join(dir, 'tree.html')
    writeFileSync(htmlPath, html, 'utf-8')
    try {
      await win.loadFile(htmlPath)
      // Let embedded avatar data-URLs decode and lay out before snapshotting.
      await new Promise((resolve) => setTimeout(resolve, 350))
      return await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { marginType: 'none' }
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  // Keep the chain alive even if this render rejects.
  renderChain = run.catch(() => undefined)
  return run
}

/** Save-dialog + format dispatch for a printable family-tree export. */
export async function exportTreeImage(
  win: BrowserWindow | null,
  payload: TreeExportPayload
): Promise<TreeExportResult | null> {
  const ext = payload.format === 'svg' ? 'svg' : 'pdf'
  const res = await dialog.showSaveDialog(win ?? undefined!, {
    title: 'Export tree',
    defaultPath: `${payload.fileName}.${ext}`,
    filters: [
      payload.format === 'svg'
        ? { name: 'SVG vector', extensions: ['svg'] }
        : { name: 'PDF document', extensions: ['pdf'] }
    ],
    // Linux/GTK does not confirm overwrites unless asked explicitly.
    properties: ['showOverwriteConfirmation', 'createDirectory']
  })
  if (res.canceled || !res.filePath) return null

  if (payload.format === 'svg') {
    writeFileSync(res.filePath, masterSvg(payload), 'utf-8')
    return { path: res.filePath, pages: 1 }
  }

  const { html, pages } =
    payload.pdfLayout === 'tiled' ? tiledHtml(payload) : singlePageHtml(payload)
  const pdf = await htmlToPdf(html)
  writeFileSync(res.filePath, pdf)
  return { path: res.filePath, pages }
}

/**
 * Renders a fully-formed HTML document (with its own @page CSS) to a multi-page
 * PDF and saves it where the user chooses. Used by the Dashboard's detailed
 * statistics export — the renderer composes the HTML, this just prints + saves.
 */
export async function exportHtmlPdf(
  win: BrowserWindow | null,
  html: string,
  defaultName: string
): Promise<{ path: string } | null> {
  const base =
    (defaultName || '').replace(/[\\/]+/g, '').replace(/\.pdf$/i, '').trim() || 'treemonk-report'
  const res = await dialog.showSaveDialog(win ?? undefined!, {
    title: 'Export report',
    defaultPath: `${base}.pdf`,
    filters: [{ name: 'PDF document', extensions: ['pdf'] }],
    properties: ['showOverwriteConfirmation', 'createDirectory']
  })
  if (res.canceled || !res.filePath) return null
  const pdf = await htmlToPdf(html)
  writeFileSync(res.filePath, pdf)
  return { path: res.filePath }
}
