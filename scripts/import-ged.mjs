// Validates + runs the upgraded GEDCOM import against the live DB:
// people, families, sources, notes, citations, places. Mirrors src/main logic.
import { app } from 'electron'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID as uuid } from 'crypto'
import { readFileSync as rf } from 'fs'

app.disableHardwareAcceleration()

// ---- minimal GEDCOM parser (same shape as parser.ts) ----
const LINE = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/
function parse(text) {
  const roots = []
  const stack = []
  for (const raw of text.split(/\r\n|\r|\n/)) {
    if (!raw.trim()) continue
    const m = LINE.exec(raw)
    if (!m) continue
    const level = +m[1]
    const node = { level, xref: m[2] ?? null, tag: m[3], value: (m[4] ?? '').trim(), children: [] }
    if (level === 0) {
      roots.push(node)
      stack.length = 0
      stack[0] = node
    } else {
      const parent = stack[level - 1]
      if (parent) {
        if (node.tag === 'CONT') { parent.value += '\n' + node.value; continue }
        if (node.tag === 'CONC') { parent.value += node.value; continue }
        parent.children.push(node)
      }
      stack[level] = node
      stack.length = level + 1
    }
  }
  return roots
}
const child = (n, t) => n.children.find((c) => c.tag === t)
const cval = (n, t) => child(n, t)?.value || null
const ev = (n, t) => { const e = child(n, t); return e ? { date: cval(e, 'DATE'), place: cval(e, 'PLAC') } : { date: null, place: null } }
function coord(raw) { if (!raw) return null; const m = raw.trim().match(/([NSEW])?\s*(-?\d+(?:\.\d+)?)/i); if (!m) return null; let v = parseFloat(m[2]); if ((m[1]||'').toUpperCase()==='S'||(m[1]||'').toUpperCase()==='W') v=-Math.abs(v); return v }
function name(v) { if (!v) return { given: '', surname: '' }; const m = v.match(/^(.*?)\/(.*?)\/(.*)$/); return m ? { given: (m[1]+m[3]).trim(), surname: m[2].trim() } : { given: v.trim(), surname: '' } }
const EVENTS = ['BIRT','DEAT','CHR','BURI','MARR','RESI','OCCU','EVEN','CENS','DIV','BAPM','NATU','IMMI']

import { homedir } from 'os'
import { existsSync } from 'fs'

app.whenReady().then(() => {
  // The dev app runs under app-name "treemonk"; a raw script runs as "Electron".
  // Always target the dev app's DB explicitly.
  const treemonk = join(homedir(), '.config', 'treemonk', 'data', 'treemonk.db')
  const dbPath = existsSync(treemonk) ? treemonk : join(app.getPath('userData'), 'data', 'treemonk.db')
  const schema = rf(new URL('../src/main/db/schema.ts', import.meta.url), 'utf-8').replace(/^[\s\S]*?`/, '').replace(/`\s*$/, '')
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  db.exec(schema)

  const text = readFileSync(new URL('../my_family_tree.ged', import.meta.url), 'utf-8')
  const roots = parse(text)
  const nowts = new Date().toISOString()
  const counts = { people: 0, families: 0, sources: 0, notes: 0, citations: 0 }

  const tx = db.transaction(() => {
    // places
    const upPlace = db.prepare('INSERT INTO places (name,lat,lon) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET lat=excluded.lat, lon=excluded.lon')
    const walkPlace = (n) => { if (n.tag==='PLAC'&&n.value){ const mp=child(n,'MAP'); if(mp){ const la=coord(cval(mp,'LATI')), lo=coord(cval(mp,'LONG')); if(la!=null&&lo!=null) upPlace.run(n.value.trim(),la,lo) } } n.children.forEach(walkPlace) }
    roots.forEach(walkPlace)

    // notes
    const noteByX = new Map()
    const upNote = db.prepare('INSERT OR REPLACE INTO notes (id,gedcom_id,text) VALUES (?,?,?)')
    for (const n of roots.filter((x)=>x.tag==='NOTE'&&x.xref)) { const id=uuid(); upNote.run(id,n.xref,n.value); noteByX.set(n.xref,id); counts.notes++ }
    // sources
    const srcByX = new Map()
    const upSrc = db.prepare('INSERT OR REPLACE INTO sources (id,gedcom_id,title,author,publication,repository_id,text) VALUES (?,?,?,?,?,NULL,?)')
    for (const s of roots.filter((x)=>x.tag==='SOUR'&&x.xref)) { const id=uuid(); upSrc.run(id,s.xref,cval(s,'TITL')??'',cval(s,'AUTH'),cval(s,'PUBL'),cval(s,'TEXT')); srcByX.set(s.xref,id); counts.sources++ }

    const insCite = db.prepare('INSERT INTO citations (id,source_id,owner_type,owner_id,event_tag,page,quality,note) VALUES (?,?,?,?,?,?,?,?)')
    const linkNote = db.prepare('INSERT OR IGNORE INTO note_links (note_id,owner_type,owner_id) VALUES (?,?,?)')
    const insNote2 = db.prepare('INSERT INTO notes (id,gedcom_id,text) VALUES (?,NULL,?)')
    const doNotes = (node, ot, oid) => { for (const c of node.children) { if (c.tag!=='NOTE') continue; const ptr=/^@.+@$/.test(c.value)?c.value:null; if(ptr){const nid=noteByX.get(ptr); if(nid) linkNote.run(nid,ot,oid)} else if(c.value.trim()){const id=uuid(); insNote2.run(id,c.value); linkNote.run(id,ot,oid); counts.notes++} } }
    const addCite = (s, ot, oid, tag) => { const ptr=/^@.+@$/.test(s.value)?s.value:null; const sid=ptr?(srcByX.get(ptr)??null):null; const data=child(s,'DATA'); insCite.run(uuid(),sid,ot,oid,tag,cval(s,'PAGE'),cval(s,'QUAY'),data?cval(data,'TEXT'):cval(s,'NOTE')); counts.citations++ }
    const doCites = (node, ot, oid) => { for (const c of node.children) if(c.tag==='SOUR') addCite(c,ot,oid,null); for(const e of node.children){ if(!EVENTS.includes(e.tag)) continue; for(const c of e.children) if(c.tag==='SOUR') addCite(c,ot,oid,e.tag) } }

    // people
    const pById = new Map()
    const findP = db.prepare('SELECT id FROM people WHERE gedcom_id = ?')
    const insP = db.prepare(`INSERT INTO people (id,gedcom_id,given_name,surname,sex,birth_date,birth_place,death_date,death_place,occupation,notes,profile_photo_id,created_at,updated_at) VALUES (@id,@g,@gn,@sn,@sex,@bd,@bp,@dd,@dp,@occ,NULL,NULL,@ts,@ts) ON CONFLICT(id) DO UPDATE SET given_name=@gn,surname=@sn,sex=@sex,birth_date=@bd,birth_place=@bp,death_date=@dd,death_place=@dp,occupation=@occ,updated_at=@ts`)
    for (const indi of roots.filter((r)=>r.tag==='INDI'&&r.xref)) {
      const ex = findP.get(indi.xref)
      const id = ex?.id ?? uuid()
      const nm = name(child(indi,'NAME')?.value ?? null)
      const b = ev(indi,'BIRT'), d = ev(indi,'DEAT')
      const sx = cval(indi,'SEX'); const sex = sx==='M'||sx==='F'?sx:'U'
      insP.run({ id, g: indi.xref, gn: nm.given, sn: nm.surname, sex, bd: b.date, bp: b.place, dd: d.date, dp: d.place, occ: cval(indi,'OCCU'), ts: nowts })
      pById.set(indi.xref, id)
      doNotes(indi,'person',id); doCites(indi,'person',id)
    }
    counts.people = pById.size

    // families
    const findF = db.prepare('SELECT id FROM families WHERE gedcom_id = ?')
    const insF = db.prepare('INSERT INTO families (id,gedcom_id,husband_id,wife_id,marriage_date,marriage_place,notes) VALUES (?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET husband_id=excluded.husband_id,wife_id=excluded.wife_id,marriage_date=excluded.marriage_date,marriage_place=excluded.marriage_place')
    const delCh = db.prepare('DELETE FROM family_children WHERE family_id = ?')
    const insCh = db.prepare('INSERT OR IGNORE INTO family_children (family_id,child_id,ordinal) VALUES (?,?,?)')
    const R = (x) => (x ? pById.get(x) ?? null : null)
    for (const fam of roots.filter((r)=>r.tag==='FAM'&&r.xref)) {
      const ex = findF.get(fam.xref)
      const id = ex?.id ?? uuid()
      const marr = ev(fam,'MARR')
      insF.run(id, fam.xref, R(cval(fam,'HUSB')), R(cval(fam,'WIFE')), marr.date, marr.place)
      delCh.run(id)
      fam.children.filter((c)=>c.tag==='CHIL').map((c)=>R(c.value)).filter(Boolean).forEach((cid,i)=>insCh.run(id,cid,i))
      if (!ex) counts.families++
      doNotes(fam,'family',id); doCites(fam,'family',id)
    }
  })
  tx()
  db.close()
  console.log(JSON.stringify(counts))
  app.exit(0)
})
