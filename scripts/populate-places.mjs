// One-off: extracts PLAC->coords from the GEDCOM and fills the `places` table
// of the live DB (so the map works without a manual re-import). Run with Electron.
import { app } from 'electron'
import Database from 'better-sqlite3'
import { readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

app.disableHardwareAcceleration()

app.whenReady().then(() => {
  const ged = readFileSync(
    new URL('../my_family_tree.ged', import.meta.url),
    'utf-8'
  )
  const lines = ged.split(/\r\n|\r|\n/)
  const places = new Map()
  let cur = null
  let lat = null
  let lon = null
  const num = (s) => {
    const m = s.match(/([NSEW])?\s*(-?\d+(?:\.\d+)?)/i)
    if (!m) return null
    let v = parseFloat(m[2])
    const h = m[1]?.toUpperCase()
    if (h === 'S' || h === 'W') v = -Math.abs(v)
    return v
  }
  for (const raw of lines) {
    const place = raw.match(/^\d+\s+PLAC\s+(.+)$/)
    if (place) {
      cur = place[1].trim()
      lat = lon = null
      continue
    }
    const la = raw.match(/^\d+\s+LATI\s+(.+)$/)
    if (la) lat = num(la[1])
    const lo = raw.match(/^\d+\s+LONG\s+(.+)$/)
    if (lo) lon = num(lo[1])
    if (cur && lat !== null && lon !== null) {
      places.set(cur, { lat, lon })
      lat = lon = null
    }
  }

  const candidates = [
    join(homedir(), '.config', 'treemonk', 'data', 'treemonk.db'),
    join(homedir(), '.config', 'Electron', 'data', 'treemonk.db')
  ].filter(existsSync)
  const dbPath = candidates.sort((a, b) => statSync(b).size - statSync(a).size)[0]
  const db = new Database(dbPath)
  db.exec(
    'CREATE TABLE IF NOT EXISTS places (name TEXT PRIMARY KEY, lat REAL NOT NULL, lon REAL NOT NULL)'
  )
  const up = db.prepare(
    `INSERT INTO places (name, lat, lon) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET lat=excluded.lat, lon=excluded.lon`
  )
  const tx = db.transaction(() => {
    for (const [name, c] of places) up.run(name, c.lat, c.lon)
  })
  tx()
  const count = db.prepare('SELECT COUNT(*) n FROM places').get().n
  db.close()
  console.log(JSON.stringify({ db: dbPath, parsed: places.size, stored: count }))
  app.exit(0)
})
