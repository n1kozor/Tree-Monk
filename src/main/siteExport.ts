import { writeFileSync } from 'fs'
import { Attributes, Events, Families, Godparents, Occupations, People, Witnesses } from './db/repo'
import type { Family, Person } from '@shared/types'

/**
 * Static-website export: ONE self-contained HTML file with a searchable person
 * index and a linked page section per person (parents / spouses / children /
 * godparents / witnesses all clickable) — openable from any browser, no server,
 * shareable with relatives. Confidential (`isPrivate`) people appear as a
 * placeholder with no data. Photos are intentionally not embedded (file size).
 */

type Lang = 'hu' | 'en' | 'de'

const L: Record<Lang, Record<string, string>> = {
  hu: {
    title: 'Családfa',
    generated: 'Készült',
    people: 'személy',
    families: 'család',
    search: 'Keresés név szerint…',
    index: 'Névmutató',
    birth: 'Született',
    christening: 'Keresztelés',
    death: 'Elhunyt',
    burial: 'Temetés',
    stillborn: 'halva született',
    religion: 'Vallás',
    occupations: 'Foglalkozás',
    events: 'Életesemények',
    attributes: 'Egyéb adatok',
    parents: 'Szülők',
    unions: 'Házasságok / kapcsolatok',
    spouse: 'Házastárs',
    marriage: 'Házasságkötés',
    children: 'Gyermekek',
    godparents: 'Keresztszülők',
    witnesses: 'Tanúk (keresztelési)',
    marriageWitnesses: 'Tanúk',
    notes: 'Megjegyzés',
    confidential: 'Bizalmas személy',
    confidentialNote: 'Ez a személy bizalmasként van jelölve — adatai nem kerültek exportálásra.',
    footer: 'TreeMonk családfa-export',
    indexTitle: 'Név- és helymutató',
    nameIndex: 'Névmutató',
    placeIndex: 'Helymutató',
    legend: 'Jelmagyarázat: * születés · ~ keresztelés · ⚭ házasság · † halál · ▭ temetés · ⌂ lakhely',
    abt: 'kb.',
    bef: 'előtt',
    aft: 'után',
    illegitimate: 'törvénytelen gyermek'
  },
  en: {
    title: 'Family tree',
    generated: 'Generated',
    people: 'people',
    families: 'families',
    search: 'Search by name…',
    index: 'Name index',
    birth: 'Born',
    christening: 'Christened',
    death: 'Died',
    burial: 'Buried',
    stillborn: 'stillborn',
    religion: 'Religion',
    occupations: 'Occupation',
    events: 'Life events',
    attributes: 'Other facts',
    parents: 'Parents',
    unions: 'Marriages / unions',
    spouse: 'Spouse',
    marriage: 'Marriage',
    children: 'Children',
    godparents: 'Godparents',
    witnesses: 'Witnesses (christening)',
    marriageWitnesses: 'Witnesses',
    notes: 'Notes',
    confidential: 'Confidential person',
    confidentialNote: 'This person is marked confidential — their data was not exported.',
    footer: 'TreeMonk family-tree export',
    indexTitle: 'Name and place index',
    nameIndex: 'Name index',
    placeIndex: 'Place index',
    legend: 'Legend: * birth · ~ christening · ⚭ marriage · † death · ▭ burial · ⌂ residence',
    abt: 'abt.',
    bef: 'before',
    aft: 'after',
    illegitimate: 'illegitimate child'
  },
  de: {
    title: 'Stammbaum',
    generated: 'Erstellt',
    people: 'Personen',
    families: 'Familien',
    search: 'Nach Namen suchen…',
    index: 'Namensverzeichnis',
    birth: 'Geboren',
    christening: 'Getauft',
    death: 'Gestorben',
    burial: 'Begraben',
    stillborn: 'totgeboren',
    religion: 'Religion',
    occupations: 'Beruf',
    events: 'Lebensereignisse',
    attributes: 'Weitere Fakten',
    parents: 'Eltern',
    unions: 'Ehen / Verbindungen',
    spouse: 'Ehepartner',
    marriage: 'Eheschließung',
    children: 'Kinder',
    godparents: 'Taufpaten',
    witnesses: 'Zeugen (Taufe)',
    marriageWitnesses: 'Zeugen',
    notes: 'Notizen',
    confidential: 'Vertrauliche Person',
    confidentialNote: 'Diese Person ist als vertraulich markiert — ihre Daten wurden nicht exportiert.',
    footer: 'TreeMonk-Stammbaum-Export',
    indexTitle: 'Namens- und Ortsverzeichnis',
    nameIndex: 'Namensverzeichnis',
    placeIndex: 'Ortsverzeichnis',
    legend: 'Legende: * Geburt · ~ Taufe · ⚭ Ehe · † Tod · ▭ Bestattung · ⌂ Wohnort',
    abt: 'um',
    bef: 'vor',
    aft: 'nach',
    illegitimate: 'uneheliches Kind'
  }
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Localized display for stored dates, incl. ABT/BEF/AFT/BET qualifiers. */
function fmtDate(raw: string | null | undefined, l: Record<string, string>, lang: Lang): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  const bet = /^BET\.?\s+(.+?)\s+AND\s+(.+)$/i.exec(s)
  if (bet) {
    const [a, b] = [bet[1].trim(), bet[2].trim()]
    if (lang === 'hu') return `${a} és ${b} között`
    if (lang === 'de') return `zwischen ${a} und ${b}`
    return `between ${a} and ${b}`
  }
  const q = /^(ABT|BEF|AFT)\.?\s+(.+)$/i.exec(s)
  if (!q) return s
  const core = q[2].trim()
  const tag = q[1].toUpperCase()
  if (tag === 'ABT') return `${l.abt} ${core}`
  if (tag === 'BEF') return lang === 'hu' ? `${core} ${l.bef}` : `${l.bef} ${core}`
  return lang === 'hu' ? `${core} ${l.aft}` : `${l.aft} ${core}`
}

function fullName(p: Person, lang: Lang): string {
  const name =
    lang === 'hu'
      ? `${p.surname} ${p.givenName}`.trim()
      : `${p.givenName} ${p.surname}`.trim()
  return [p.namePrefix, name, p.nameSuffix].filter(Boolean).join(' ') || '—'
}

const yearOf = (d: string | null): string => {
  const m = /(\d{4})/.exec(d ?? '')
  return m ? m[1] : ''
}

export function exportSite(filePath: string, langRaw: string): string {
  const lang: Lang = langRaw === 'hu' || langRaw === 'de' ? langRaw : 'en'
  const l = L[lang]
  const people = People.list()
  const families = Families.list()
  const byId = new Map(people.map((p) => [p.id, p]))

  const linkTo = (id: string | null | undefined): string => {
    const p = id ? byId.get(id) : undefined
    if (!p) return ''
    if (p.isPrivate) return `<span class="muted">${esc(l.confidential)}</span>`
    return `<a href="#p-${esc(p.id)}">${esc(fullName(p, lang))}</a>`
  }
  const lifespan = (p: Person): string => {
    const b = yearOf(p.birthDate)
    const d = yearOf(p.deathDate)
    return b || d ? `${b || '?'}–${p.deceased ? d || '?' : ''}` : ''
  }
  const vital = (label: string, date: string | null, place: string | null): string => {
    if (!date && !place) return ''
    const parts = [fmtDate(date, l, lang), place ? esc(place) : ''].filter(Boolean).join(' · ')
    return `<div class="row"><span class="lbl">${esc(label)}</span><span>${parts}</span></div>`
  }

  // Spouse-unions per person, children resolved.
  const unionsOf = (p: Person): Family[] =>
    families.filter((f) => f.husbandId === p.id || f.wifeId === p.id)
  const parentsOf = (p: Person): string[] => {
    const fam = families.find((f) => f.childIds.includes(p.id))
    return fam ? [fam.husbandId, fam.wifeId].filter((x): x is string => !!x) : []
  }

  const sections = people
    .map((p) => {
      const nm = fullName(p, lang)
      if (p.isPrivate) {
        return `<section class="person private" id="p-${esc(p.id)}" data-name="${esc(nm.toLowerCase())}">
<h2>${esc(l.confidential)}</h2><p class="muted">${esc(l.confidentialNote)}</p></section>`
      }
      const occs = Occupations.forPerson(p.id)
        .map((o) => o.title)
        .filter(Boolean)
      const events = Events.forPerson(p.id)
      const attrs = Attributes.forPerson(p.id)
      const gps = Godparents.forPerson(p.id)
      const wits = Witnesses.forOwner('person', p.id)
      const parents = parentsOf(p)
      const unions = unionsOf(p)

      const flags: string[] = []
      if (p.stillborn) flags.push(l.stillborn)
      if (p.illegitimate) flags.push(l.illegitimate)

      const unionHtml = unions
        .map((f) => {
          const spouseId = f.husbandId === p.id ? f.wifeId : f.husbandId
          const famWits = Witnesses.forOwner('family', f.id)
          const famEvents = Events.forOwner('family', f.id)
          const kids = f.childIds.map((cid) => linkTo(cid)).filter(Boolean)
          return `<div class="union">
  <div class="row"><span class="lbl">${esc(l.spouse)}</span><span>${linkTo(spouseId) || '—'}</span></div>
  ${f.marriageDate || f.marriagePlace ? `<div class="row"><span class="lbl">${esc(l.marriage)}</span><span>${[fmtDate(f.marriageDate, l, lang), f.marriagePlace ? esc(f.marriagePlace) : ''].filter(Boolean).join(' · ')}</span></div>` : ''}
  ${famEvents.length ? famEvents.map((ev) => `<div class="row"><span class="lbl">${esc(ev.type)}</span><span>${[fmtDate(ev.date, l, lang), ev.place ? esc(ev.place) : '', ev.value ? esc(ev.value) : ''].filter(Boolean).join(' · ')}</span></div>`).join('\n') : ''}
  ${famWits.length ? `<div class="row"><span class="lbl">${esc(l.marriageWitnesses)}</span><span>${famWits.map((w) => linkTo(w)).filter(Boolean).join(', ')}</span></div>` : ''}
  ${kids.length ? `<div class="row"><span class="lbl">${esc(l.children)}</span><span>${kids.join(', ')}</span></div>` : ''}
</div>`
        })
        .join('\n')

      return `<section class="person" id="p-${esc(p.id)}" data-name="${esc(nm.toLowerCase())}">
<h2>${esc(nm)}${p.callName ? ` <span class="call">„${esc(p.callName)}”</span>` : ''} <span class="years">${esc(lifespan(p))}</span></h2>
${flags.length ? `<p class="flags">${esc(flags.join(' · '))}</p>` : ''}
${vital(l.birth, p.birthDate, p.birthPlace)}
${vital(l.christening, p.christeningDate, p.christeningPlace)}
${vital(l.death, p.deathDate, p.deathPlace)}
${vital(l.burial, p.burialDate, p.burialPlace)}
${p.religion ? `<div class="row"><span class="lbl">${esc(l.religion)}</span><span>${esc(p.religion)}</span></div>` : ''}
${occs.length ? `<div class="row"><span class="lbl">${esc(l.occupations)}</span><span>${esc(occs.join(', '))}</span></div>` : ''}
${parents.length ? `<div class="row"><span class="lbl">${esc(l.parents)}</span><span>${parents.map((x) => linkTo(x)).join(', ')}</span></div>` : ''}
${unionHtml ? `<h3>${esc(l.unions)}</h3>${unionHtml}` : ''}
${events.length ? `<h3>${esc(l.events)}</h3>${events.map((ev) => `<div class="row"><span class="lbl">${esc(ev.type)}</span><span>${[fmtDate(ev.date, l, lang), ev.endDate ? '– ' + fmtDate(ev.endDate, l, lang) : '', ev.place ? esc(ev.place) : '', ev.value ? esc(ev.value) : ''].filter(Boolean).join(' · ')}</span></div>`).join('\n')}` : ''}
${attrs.length ? `<h3>${esc(l.attributes)}</h3>${attrs.map((a) => `<div class="row"><span class="lbl">${esc(a.key)}</span><span>${esc(a.value ?? '')}</span></div>`).join('\n')}` : ''}
${gps.length ? `<div class="row"><span class="lbl">${esc(l.godparents)}</span><span>${gps.map((g) => linkTo(g)).filter(Boolean).join(', ')}</span></div>` : ''}
${wits.length ? `<div class="row"><span class="lbl">${esc(l.witnesses)}</span><span>${wits.map((w) => linkTo(w)).filter(Boolean).join(', ')}</span></div>` : ''}
${p.notes ? `<h3>${esc(l.notes)}</h3><p class="notes">${esc(p.notes)}</p>` : ''}
</section>`
    })
    .join('\n')

  const index = people
    .map((p) => {
      const nm = p.isPrivate ? l.confidential : fullName(p, lang)
      return `<li data-name="${esc(nm.toLowerCase())}"><a href="#p-${esc(p.id)}">${esc(nm)}</a> <span class="years">${esc(lifespan(p))}</span></li>`
    })
    .join('\n')

  const generated = new Date().toISOString().slice(0, 10)
  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(l.title)}</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; margin: 0 auto; max-width: 860px; padding: 24px 20px 60px; line-height: 1.5;
  color: #222; background: #fbfaf7; }
@media (prefers-color-scheme: dark) { body { color: #ddd; background: #16181d; } .person { background: #1d2026 !important; border-color: #333 !important; } input#q { background:#1d2026; color:#ddd; border-color:#444 !important; } }
header { border-bottom: 3px double #999; margin-bottom: 20px; padding-bottom: 12px; }
h1 { margin: 0 0 4px; font-size: 1.7rem; }
h2 { margin: 0 0 6px; font-size: 1.15rem; }
h3 { margin: 12px 0 4px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: #777; }
.meta, .muted { color: #777; font-size: 0.85rem; }
input#q { width: 100%; padding: 8px 12px; font-size: 1rem; margin: 14px 0 6px; border: 1px solid #bbb; border-radius: 8px; }
ul.index { columns: 2; list-style: none; margin: 8px 0 26px; padding: 0; font-size: 0.92rem; }
ul.index li { break-inside: avoid; padding: 1px 0; }
.person { background: #fff; border: 1px solid #ddd; border-radius: 10px; padding: 14px 18px; margin: 0 0 14px; }
.person.private { opacity: 0.75; }
.row { display: flex; gap: 10px; font-size: 0.92rem; padding: 1px 0; }
.lbl { flex: 0 0 130px; color: #777; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; padding-top: 2px; }
.years, .call { color: #888; font-weight: normal; font-size: 0.85em; }
.flags { color: #a66; font-size: 0.85rem; margin: 0 0 6px; }
.union { border-left: 3px solid #cbd; margin: 6px 0; padding: 4px 0 4px 12px; }
.notes { white-space: pre-wrap; font-size: 0.92rem; }
a { color: #1d4ed8; text-decoration: none; } a:hover { text-decoration: underline; }
@media (prefers-color-scheme: dark) { a { color: #7aa2ff; } }
footer { margin-top: 30px; color: #999; font-size: 0.8rem; text-align: center; }
@media print { input#q { display: none; } .person { break-inside: avoid; border: none; border-bottom: 1px solid #ccc; border-radius: 0; } }
</style>
</head>
<body>
<header>
  <h1>${esc(l.title)}</h1>
  <p class="meta">${esc(l.generated)}: ${generated} · ${people.length} ${esc(l.people)} · ${families.length} ${esc(l.families)}</p>
</header>
<input id="q" type="search" placeholder="${esc(l.search)}" autocomplete="off">
<h3>${esc(l.index)}</h3>
<ul class="index" id="idx">
${index}
</ul>
${sections}
<footer>${esc(l.footer)}</footer>
<script>
(function () {
  var q = document.getElementById('q');
  q.addEventListener('input', function () {
    var v = q.value.trim().toLowerCase();
    document.querySelectorAll('#idx li, section.person').forEach(function (el) {
      el.style.display = !v || (el.getAttribute('data-name') || '').indexOf(v) !== -1 ? '' : 'none';
    });
  });
})();
</script>
</body>
</html>
`
  writeFileSync(filePath, html, 'utf-8')
  return filePath
}

/**
 * Print-ready NAME + PLACE index lists as one HTML file (Ahnenblatt-style
 * Namensliste/Ortsliste). The name index groups people by surname initial;
 * the place index lists, for every place, who had which event there
 * (* birth, ~ christening, ⚭ marriage, † death, ▭ burial, ⌂ residence).
 * Confidential people are excluded from both.
 */
export function exportIndexes(filePath: string, langRaw: string): string {
  const lang: Lang = langRaw === 'hu' || langRaw === 'de' ? langRaw : 'en'
  const l = L[lang]
  const people = People.list().filter((p) => !p.isPrivate)
  const families = Families.list()
  const byId = new Map(people.map((p) => [p.id, p]))
  const nameOf = (p: Person): string => fullName(p, lang)
  const yr = (d: string | null): string => {
    const m = /(\d{4})/.exec(d ?? '')
    return m ? m[1] : ''
  }

  // ---- Name index, grouped by the sort-name's initial ----
  const sorted = [...people].sort((a, b) =>
    `${a.surname} ${a.givenName}`.localeCompare(`${b.surname} ${b.givenName}`, lang)
  )
  const groups = new Map<string, Person[]>()
  for (const p of sorted) {
    const initial = (p.surname || p.givenName || '#').charAt(0).toUpperCase() || '#'
    const arr = groups.get(initial) ?? []
    arr.push(p)
    groups.set(initial, arr)
  }
  const nameIndex = [...groups.entries()]
    .map(
      ([initial, ps]) => `<h3>${esc(initial)}</h3><ul>` +
        ps
          .map((p) => {
            const b = yr(p.birthDate)
            const d = yr(p.deathDate)
            const span = b || d ? ` <span class="muted">${b || '?'}–${p.deceased ? d || '?' : ''}</span>` : ''
            const place = p.birthPlace ? ` <span class="muted">· ${esc(p.birthPlace.split(',')[0])}</span>` : ''
            return `<li>${esc(nameOf(p))}${span}${place}</li>`
          })
          .join('') +
        '</ul>'
    )
    .join('\n')

  // ---- Place index: place → [symbol name (year)] ----
  const byPlace = new Map<string, { sym: string; who: string; year: string }[]>()
  const addUse = (place: string | null, sym: string, who: string, date: string | null): void => {
    const key = (place ?? '').trim()
    if (!key) return
    const arr = byPlace.get(key) ?? []
    arr.push({ sym, who, year: yr(date) })
    byPlace.set(key, arr)
  }
  for (const p of people) {
    addUse(p.birthPlace, '*', nameOf(p), p.birthDate)
    addUse(p.christeningPlace, '~', nameOf(p), p.christeningDate)
    addUse(p.deathPlace, '†', nameOf(p), p.deathDate)
    addUse(p.burialPlace, '▭', nameOf(p), p.burialDate)
    for (const ev of Events.forPerson(p.id)) {
      if (ev.place && ev.type.toLowerCase() === 'residence') addUse(ev.place, '⌂', nameOf(p), ev.date)
    }
  }
  for (const f of families) {
    if (!f.marriagePlace) continue
    const names = [f.husbandId, f.wifeId]
      .map((id) => (id ? byId.get(id) : undefined))
      .filter((x): x is Person => !!x)
      .map(nameOf)
      .join(' & ')
    if (names) addUse(f.marriagePlace, '⚭', names, f.marriageDate)
  }
  const placeIndex = [...byPlace.entries()]
    .sort(([a], [b]) => a.localeCompare(b, lang))
    .map(
      ([place, uses]) => `<h3>${esc(place)}</h3><ul>` +
        uses
          .sort((a, b) => (a.year || '9999').localeCompare(b.year || '9999'))
          .map((u) => `<li><span class="sym">${u.sym}</span> ${esc(u.who)}${u.year ? ` <span class="muted">(${u.year})</span>` : ''}</li>`)
          .join('') +
        '</ul>'
    )
    .join('\n')

  const generated = new Date().toISOString().slice(0, 10)
  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(l.indexTitle)}</title>
<style>
:root { color-scheme: light dark; }
body { font-family: Georgia, 'Times New Roman', serif; margin: 0 auto; max-width: 860px; padding: 24px 20px 60px;
  line-height: 1.45; color: #222; background: #fbfaf7; }
@media (prefers-color-scheme: dark) { body { color: #ddd; background: #16181d; } }
header { border-bottom: 3px double #999; margin-bottom: 18px; padding-bottom: 10px; }
h1 { margin: 0 0 4px; font-size: 1.6rem; }
h2 { margin: 26px 0 8px; font-size: 1.2rem; border-bottom: 1px solid #ccc; padding-bottom: 4px; break-after: avoid; }
h3 { margin: 14px 0 3px; font-size: 0.95rem; break-after: avoid; }
ul { columns: 2; list-style: none; margin: 0; padding: 0; font-size: 0.9rem; }
li { break-inside: avoid; padding: 1px 0; }
.muted { color: #888; font-size: 0.85em; }
.sym { display: inline-block; width: 1.1em; color: #666; }
.meta { color: #777; font-size: 0.85rem; }
@media print { body { background: #fff; } ul { columns: 3; } }
</style>
</head>
<body>
<header>
  <h1>${esc(l.indexTitle)}</h1>
  <p class="meta">${esc(l.generated)}: ${generated} · ${people.length} ${esc(l.people)} · ${esc(l.legend)}</p>
</header>
<h2>${esc(l.nameIndex)}</h2>
${nameIndex}
<h2>${esc(l.placeIndex)}</h2>
${placeIndex}
</body>
</html>
`
  writeFileSync(filePath, html, 'utf-8')
  return filePath
}
