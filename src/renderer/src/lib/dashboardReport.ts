import type { Family, Person } from '@shared/types'
import type { DashboardStats } from './dashboard'
import i18n from '@/i18n'
import { fullName } from './utils'

/**
 * Builds a self-contained, multi-page A4 HTML report of EVERY dashboard
 * statistic plus a full people roster. The main process prints it to PDF.
 * All distributions here are computed over the full scoped set (not the
 * top-N the on-screen widgets show), so nothing is truncated.
 */

const t = (k: string, o?: Record<string, unknown>): string => i18n.t(k, o ?? {}) as string

const yearNum = (d: string | null): number | null => {
  const m = d?.match(/\b(\d{4})\b/)
  return m ? Number(m[1]) : null
}
const isDeceased = (p: Person): boolean => !!(p.deceased || p.deathDate)

const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

interface Row {
  label: string
  count: number
}

/** Full (untruncated) distribution of a person field, most common first. */
function dist(people: Person[], get: (p: Person) => string | null | undefined): Row[] {
  const m = new Map<string, number>()
  for (const p of people) {
    const v = (get(p) ?? '').trim()
    if (v) m.set(v, (m.get(v) ?? 0) + 1)
  }
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** A table where each row carries a proportional inline bar — print-friendly. */
function barTable(rows: Row[], headLabel: string, color: string): string {
  if (rows.length === 0) return `<p class="empty">${t('dashboard.noData')}</p>`
  const max = Math.max(...rows.map((r) => r.count), 1)
  const body = rows
    .map(
      (r) => `<tr>
        <td class="lbl">${esc(r.label)}</td>
        <td class="barcell"><span class="bar" style="width:${Math.max((r.count / max) * 100, 2)}%;background:${color}"></span></td>
        <td class="num">${r.count}</td>
      </tr>`
    )
    .join('')
  return `<table class="bars"><thead><tr><th>${esc(headLabel)}</th><th></th><th class="num">#</th></tr></thead><tbody>${body}</tbody></table>`
}

function kpiGrid(stats: DashboardStats): string {
  const span =
    stats.minYear !== null && stats.maxYear !== null ? `${stats.minYear}–${stats.maxYear}` : '—'
  const tiles: [string, string][] = [
    [t('dashboard.kpiPeople'), String(stats.total)],
    [t('dashboard.kpiFamilies'), `${stats.families} · ${t('dashboard.marriagesN', { count: stats.marriages })}`],
    [t('dashboard.kpiLiving'), `${stats.living} / ${stats.total}`],
    [t('dashboard.kpiTimeSpan'), span],
    [t('dashboard.avgLifespan'), stats.avgLifespan !== null ? t('dashboard.yearsN', { count: stats.avgLifespan }) : '—'],
    [t('dashboard.avgChildren'), stats.avgChildren !== null ? String(stats.avgChildren) : '—']
  ]
  return `<div class="kpis">${tiles
    .map(([l, v]) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`)
    .join('')}</div>`
}

function demographics(stats: DashboardStats): string {
  const pct = (n: number): string => (stats.total ? Math.round((n / stats.total) * 100) : 0) + '%'
  const rows: [string, number][] = [
    [t('dashboard.male'), stats.males],
    [t('dashboard.female'), stats.females],
    [t('dashboard.unknownSex'), stats.unknownSex],
    [t('dashboard.living'), stats.living],
    [t('dashboard.deceased'), stats.deceased]
  ]
  return `<table class="grid"><tbody>${rows
    .map(([l, n]) => `<tr><td class="lbl">${esc(l)}</td><td class="num">${n}</td><td class="num muted">${pct(n)}</td></tr>`)
    .join('')}</tbody></table>`
}

function completeness(stats: DashboardStats): string {
  const rows = stats.completeness
    .map((c) => {
      const p = c.total ? Math.round((c.have / c.total) * 100) : 0
      return `<tr><td class="lbl">${esc(t(`dashboard.field.${c.key}`))}</td>
        <td class="barcell"><span class="bar" style="width:${p}%;background:#10b981"></span></td>
        <td class="num">${c.have}/${c.total}</td><td class="num">${p}%</td></tr>`
    })
    .join('')
  return `<table class="bars"><tbody>${rows}</tbody></table>`
}

function records(stats: DashboardStats): string {
  if (stats.records.length === 0) return ''
  const rows = stats.records
    .map((r) => {
      const sub = r.sub ? (r.years ? `${r.sub} ${t('tree.insights.yearsUnit')}` : r.sub) : ''
      return `<tr><td class="lbl">${esc(t(`tree.insights.${r.key}`))}</td><td>${esc(r.value)}</td><td class="num muted">${esc(sub)}</td></tr>`
    })
    .join('')
  return `<table class="grid"><tbody>${rows}</tbody></table>`
}

function roster(people: Person[]): string {
  const sexSym = (s: string): string => (s === 'M' ? '♂' : s === 'F' ? '♀' : '–')
  const sorted = [...people].sort(
    (a, b) => a.surname.localeCompare(b.surname) || a.givenName.localeCompare(b.givenName)
  )
  const body = sorted
    .map(
      (p, i) => `<tr>
        <td class="num muted">${i + 1}</td>
        <td>${esc(fullName(p))}</td>
        <td class="ctr">${sexSym(p.sex)}</td>
        <td>${esc(p.birthDate)}</td>
        <td>${esc(p.birthPlace)}</td>
        <td>${esc(p.deathDate)}</td>
        <td>${esc(p.deathPlace)}</td>
      </tr>`
    )
    .join('')
  return `<table class="roster"><thead><tr>
      <th class="num">#</th><th>${esc(t('person.givenName'))} / ${esc(t('person.surname'))}</th>
      <th></th><th>${esc(t('dashboard.field.birthDate'))}</th><th>${esc(t('dashboard.field.birthPlace'))}</th>
      <th>${esc(t('person.death'))}</th><th>${esc(t('person.place'))}</th>
    </tr></thead><tbody>${body}</tbody></table>`
}

function section(title: string, inner: string): string {
  return `<section><h2>${esc(title)}</h2>${inner}</section>`
}

export function buildDashboardReportHtml(params: {
  title: string
  scopeLabel: string
  generatedAt: string
  people: Person[]
  families: Family[]
  stats: DashboardStats
}): string {
  const { people, stats } = params

  // Births / deaths by century + lifespan, as bar tables.
  const byCentury = (get: (p: Person) => string | null): Row[] => {
    const m = new Map<number, number>()
    for (const p of people) {
      const y = yearNum(get(p))
      if (y !== null) m.set(Math.floor(y / 100) * 100, (m.get(Math.floor(y / 100) * 100) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([c, count]) => ({ label: `${c}s`, count }))
  }

  const css = `
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { font: 11px/1.45 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1f2937; margin: 0; }
    h1 { font-size: 22px; margin: 0 0 2px; }
    h2 { font-size: 14px; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 2px solid #6366f1; color: #312e81; }
    section { margin-bottom: 18px; page-break-inside: avoid; }
    .cover { margin-bottom: 22px; }
    .cover .sub { color: #6b7280; font-size: 12px; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; }
    .kpi .v { font-size: 17px; font-weight: 700; }
    .kpi .l { font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; padding: 3px 6px; border-bottom: 1px solid #e5e7eb; }
    td { padding: 3px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    td.lbl { font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.ctr { text-align: center; }
    td.muted, .muted { color: #9ca3af; }
    .barcell { width: 45%; }
    .bar { display: inline-block; height: 9px; border-radius: 3px; vertical-align: middle; }
    .grid td { border-bottom: 1px solid #f1f5f9; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .roster { font-size: 10px; }
    .roster thead { display: table-header-group; }
    .roster tr { page-break-inside: avoid; }
    .empty { color: #9ca3af; font-style: italic; }
    .footer { margin-top: 6px; color: #9ca3af; font-size: 9px; }
  `

  const head = `<div class="cover">
    <h1>${esc(params.title)}</h1>
    <div class="sub">${esc(params.scopeLabel)} · ${esc(t('dashboard.peopleUnit'))}: ${stats.total} · ${esc(params.generatedAt)}</div>
  </div>`

  const body =
    head +
    section(t('dashboard.overview'), kpiGrid(stats)) +
    section(t('dashboard.demographics'), demographics(stats)) +
    section(t('dashboard.completeness'), completeness(stats)) +
    (stats.records.length ? section(t('dashboard.records'), records(stats)) : '') +
    `<div class="two">
      ${section(t('dashboard.timeline'), barTable(byCentury((p) => p.birthDate), t('dashboard.timeline'), '#6366f1'))}
      ${section(t('dashboard.deathsTimeline'), barTable(byCentury((p) => p.deathDate), t('dashboard.deathsTimeline'), '#64748b'))}
    </div>` +
    section(t('dashboard.lifespanDist'), barTable(stats.lifespanDist, t('dashboard.lifespanDist'), '#f59e0b')) +
    `<div class="two">
      ${section(t('dashboard.topSurnames'), barTable(dist(people, (p) => p.surname), t('dashboard.topSurnames'), '#0ea5e9'))}
      ${section(t('dashboard.topGivenNames'), barTable(dist(people, (p) => p.givenName), t('dashboard.topGivenNames'), '#6366f1'))}
    </div>` +
    `<div class="two">
      ${section(t('dashboard.topPlaces'), barTable(dist(people, (p) => p.birthPlace), t('dashboard.topPlaces'), '#10b981'))}
      ${section(t('dashboard.topDeathPlaces'), barTable(dist(people, (p) => p.deathPlace), t('dashboard.topDeathPlaces'), '#64748b'))}
    </div>` +
    `<div class="two">
      ${section(t('dashboard.topOccupations'), barTable(dist(people, (p) => p.occupation), t('dashboard.topOccupations'), '#8b5cf6'))}
      ${section(t('dashboard.religions'), barTable(dist(people, (p) => p.religion), t('dashboard.religions'), '#f59e0b'))}
    </div>` +
    `<section style="page-break-before:always">${`<h2>${esc(t('dashboard.report.roster'))}</h2>`}${roster(people)}</section>` +
    `<div class="footer">${esc(t('dashboard.report.generatedBy'))}</div>`

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`
}
