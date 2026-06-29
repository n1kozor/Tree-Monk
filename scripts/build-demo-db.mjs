// Builds the read-only browser-demo database: a coherent, fictional Hungarian
// family tree, written with the REAL TreeMonk schema via sql.js (so it is byte-
// identical to what the app expects). Deterministic (seeded) → reproducible.
//
//   node scripts/build-demo-db.mjs
//
// Output: resources/demo.sqlite  (committed; bundled by the web-demo build)
import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'

// ---- pull the production schema straight from schema.ts (single source) ----
const schemaSrc = readFileSync('src/main/db/schema.ts', 'utf8')
const SCHEMA_SQL = schemaSrc.slice(schemaSrc.indexOf('`') + 1, schemaSrc.lastIndexOf('`'))

// ---- deterministic RNG ----
let seed = 0x2f6e2b1
const rnd = () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (a) => a[Math.floor(rnd() * a.length)]
const chance = (p) => rnd() < p
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))

// ---- content pools ----
const MALE = ['István', 'János', 'József', 'László', 'Ferenc', 'Sándor', 'Béla', 'Károly', 'Lajos', 'Géza', 'Antal', 'Mihály', 'Gábor', 'Imre', 'Zoltán', 'Pál', 'Dénes', 'Ödön', 'Miklós', 'András']
const FEMALE = ['Mária', 'Erzsébet', 'Katalin', 'Ilona', 'Margit', 'Anna', 'Júlia', 'Teréz', 'Borbála', 'Rozália', 'Gizella', 'Veronika', 'Eszter', 'Klára', 'Irén', 'Vilma', 'Piroska', 'Etelka', 'Janka', 'Sára']
const SURNAMES = ['Kovács', 'Nagy', 'Szabó', 'Tóth', 'Horváth', 'Varga', 'Kiss', 'Molnár', 'Németh', 'Farkas', 'Balogh', 'Papp', 'Takács', 'Juhász', 'Lakatos', 'Mészáros', 'Simon', 'Fekete', 'Szilágyi', 'Fodor', 'Oláh', 'Gál']

const TOWNS = [
  ['Budapest', 47.4979, 19.0402], ['Debrecen', 47.5316, 21.6273], ['Szeged', 46.253, 20.1414],
  ['Pécs', 46.0727, 18.2323], ['Győr', 47.6875, 17.6504], ['Miskolc', 48.1035, 20.7784],
  ['Sopron', 47.6817, 16.5845], ['Eger', 47.9026, 20.3772], ['Kecskemét', 46.8964, 19.6897],
  ['Veszprém', 47.0931, 17.9117], ['Szombathely', 47.2307, 16.6218], ['Esztergom', 47.7926, 18.7405],
  ['Vác', 47.7763, 19.13], ['Kőszeg', 47.3887, 16.5416], ['Gyula', 46.6453, 21.279],
  ['Kalocsa', 46.5285, 18.9869], ['Pápa', 47.3296, 17.4664], ['Zalaegerszeg', 46.8417, 16.8416],
  ['Nyíregyháza', 47.9554, 21.7167], ['Kaposvár', 46.3594, 17.7968], ['Székesfehérvár', 47.186, 18.4221],
  ['Békéscsaba', 46.6736, 21.0877]
]

const OCC = {
  e1: ['földműves', 'kovács', 'molnár', 'takács', 'asztalos', 'csizmadia', 'juhász', 'kádár', 'tanító', 'pap'],
  e2: ['tanító', 'jegyző', 'gazdálkodó', 'vasutas', 'kőműves', 'szabó', 'kereskedő', 'órás', 'postamester', 'bognár'],
  e3: ['tanár', 'mérnök', 'orvos', 'könyvelő', 'vasutas', 'gépész', 'varrónő', 'hivatalnok', 'ápolónő', 'gyógyszerész'],
  e4: ['mérnök', 'tanár', 'orvos', 'programozó', 'közgazdász', 'grafikus', 'ügyvéd', 'villanyszerelő', 'könyvtáros', 'építész']
}
const occFor = (year) => (year < 1850 ? pick(OCC.e1) : year < 1915 ? pick(OCC.e2) : year < 1970 ? pick(OCC.e3) : pick(OCC.e4))

const THIS_YEAR = 2024
const pad = (n) => String(n).padStart(2, '0')
const dateIn = (year) => `${year}-${pad(int(1, 12))}-${pad(int(1, 28))}`

// ---- collected rows ----
const people = []
const families = []
const familyChildren = []
const occupations = []
const events = []
const usedTowns = new Set()
const town = () => {
  const t = pick(TOWNS)
  usedTowns.add(t[0])
  return t[0]
}

function person({ sex, birthYear, surname, given }) {
  const id = randomUUID()
  given = given ?? (sex === 'F' ? pick(FEMALE) : pick(MALE))
  surname = surname ?? pick(SURNAMES)
  const birthPlace = town()
  // Lifespan; people born recently and still within a normal age are "living".
  const age = int(58, 89)
  const living = birthYear + age > THIS_YEAR && birthYear > 1945
  const deathYear = living ? null : Math.min(THIS_YEAR, birthYear + age)
  const p = {
    id,
    given_name: given,
    surname,
    sex,
    birth_date: dateIn(birthYear),
    birth_place: birthPlace,
    death_date: deathYear ? dateIn(deathYear) : null,
    death_place: deathYear ? (chance(0.6) ? birthPlace : town()) : null,
    deceased: deathYear ? 1 : 0,
    occupation: occFor(birthYear),
    birthYear
  }
  people.push(p)
  occupations.push({ id: randomUUID(), person_id: id, title: p.occupation, start_date: String(birthYear + int(18, 26)) })
  // A residence life-event for some, for a richer timeline.
  if (chance(0.4)) events.push({ id: randomUUID(), owner_id: id, type: 'residence', date: String(birthYear + int(20, 35)), place: town(), value: '' })
  return p
}

function marry(husband, wife, year) {
  const fid = randomUUID()
  families.push({
    id: fid,
    husband_id: husband.id,
    wife_id: wife.id,
    marriage_date: dateIn(year),
    marriage_place: chance(0.5) ? wife.birth_place : husband.birth_place
  })
  return fid
}

// ---- ancestors: recurse upward, the child's surname comes from the father ----
function buildAncestors(child, gen, maxGen) {
  if (gen > maxGen) return
  // Realistic gaps: deeper lines are increasingly "unknown".
  const known = gen <= 4 ? 1 : gen === 5 ? 0.62 : 0.4
  if (!chance(known)) return

  const childYear = child.birthYear
  const father = person({ sex: 'M', birthYear: childYear - int(26, 33), surname: child.surname })
  const mother = person({ sex: 'F', birthYear: childYear - int(24, 31) })
  const fid = marry(father, mother, childYear - int(1, 6))
  familyChildren.push({ family_id: fid, child_id: child.id, ordinal: 0 })
  // Occasionally add a sibling of the child (adds breadth to the descendant view).
  if (gen <= 2 && chance(0.7)) {
    const sib = person({ sex: chance(0.5) ? 'M' : 'F', birthYear: childYear + int(-6, 6), surname: child.surname })
    familyChildren.push({ family_id: fid, child_id: sib.id, ordinal: 1 })
  }
  buildAncestors(father, gen + 1, maxGen)
  buildAncestors(mother, gen + 1, maxGen)
}

// ---- descendants: recurse downward ----
function buildDescendants(parent, gen, maxGen) {
  if (gen > maxGen) return
  if (parent.birthYear > THIS_YEAR - 24) return // too young to have a family yet
  const spouseSex = parent.sex === 'M' ? 'F' : 'M'
  const spouse = person({ sex: spouseSex, birthYear: parent.birthYear + int(-3, 4) })
  const husband = parent.sex === 'M' ? parent : spouse
  const wife = parent.sex === 'M' ? spouse : parent
  const marYear = Math.max(parent.birthYear, spouse.birthYear) + int(22, 27)
  const fid = marry(husband, wife, marYear)
  const kids = int(2, gen <= 2 ? 4 : 3)
  for (let i = 0; i < kids; i++) {
    const kidYear = marYear + 1 + i * int(2, 3)
    if (kidYear > THIS_YEAR - 1) break
    const kid = person({ sex: chance(0.5) ? 'M' : 'F', birthYear: kidYear, surname: husband.surname })
    familyChildren.push({ family_id: fid, child_id: kid.id, ordinal: i })
    buildDescendants(kid, gen + 1, maxGen)
  }
}

// ---- assemble the tree around a central "hub" born ~1910 ----
const hub = person({ sex: 'M', birthYear: 1910, given: 'Antal', surname: 'Erdősi' })
buildAncestors(hub, 1, 6)
buildDescendants(hub, 1, 4)

// ---- one deliberate surname accent-variant so the "Surnames" tool has something
// to show (folds together with the 'Tóth' that occurs elsewhere) ----
const tothLike = people.find((p) => p.surname === 'Tóth')
if (tothLike) tothLike.surname = 'Toth'

// ===================== write with the real schema =====================
const SQL = await initSqlJs()
const db = new SQL.Database()
db.run(SCHEMA_SQL)
const ts = '2024-01-01T00:00:00.000Z'

const insPerson = db.prepare(
  `INSERT INTO people (id, given_name, surname, sex, birth_date, birth_place, death_date, death_place,
     deceased, occupation, created_at, updated_at)
   VALUES (@id,@given_name,@surname,@sex,@birth_date,@birth_place,@death_date,@death_place,@deceased,@occupation,@ts,@ts)`
)
for (const p of people)
  insPerson.run({
    '@id': p.id, '@given_name': p.given_name, '@surname': p.surname, '@sex': p.sex,
    '@birth_date': p.birth_date, '@birth_place': p.birth_place, '@death_date': p.death_date,
    '@death_place': p.death_place, '@deceased': p.deceased, '@occupation': p.occupation, '@ts': ts
  })
insPerson.free()

const insFam = db.prepare(
  `INSERT INTO families (id, husband_id, wife_id, marriage_date, marriage_place)
   VALUES (@id,@h,@w,@d,@p)`
)
for (const f of families)
  insFam.run({ '@id': f.id, '@h': f.husband_id, '@w': f.wife_id, '@d': f.marriage_date, '@p': f.marriage_place })
insFam.free()

const insFC = db.prepare(`INSERT INTO family_children (family_id, child_id, ordinal) VALUES (@f,@c,@o)`)
for (const fc of familyChildren) insFC.run({ '@f': fc.family_id, '@c': fc.child_id, '@o': fc.ordinal })
insFC.free()

const insOcc = db.prepare(`INSERT INTO occupations (id, person_id, title, start_date) VALUES (@id,@p,@t,@s)`)
for (const o of occupations) insOcc.run({ '@id': o.id, '@p': o.person_id, '@t': o.title, '@s': o.start_date })
insOcc.free()

const insEv = db.prepare(
  `INSERT INTO events (id, owner_type, owner_id, type, date, place, value, ordinal)
   VALUES (@id,'person',@o,@t,@d,@p,@v,0)`
)
for (const e of events) insEv.run({ '@id': e.id, '@o': e.owner_id, '@t': e.type, '@d': e.date, '@p': e.place, '@v': e.value })
insEv.free()

const insPlace = db.prepare(`INSERT INTO places (name, lat, lon) VALUES (@n,@lat,@lon)`)
for (const [name, lat, lon] of TOWNS) if (usedTowns.has(name)) insPlace.run({ '@n': name, '@lat': lat, '@lon': lon })
insPlace.free()

db.run(`INSERT INTO settings (key, value) VALUES ('default_root_person_id', '${hub.id}')`)

// ---- export ----
mkdirSync('resources', { recursive: true })
const bytes = db.export()
writeFileSync('resources/demo.sqlite', Buffer.from(bytes))

// ---- stats ----
const count = (t) => db.exec(`SELECT count(*) c FROM ${t}`)[0].values[0][0]
console.log('demo.sqlite written →', (bytes.length / 1024).toFixed(1), 'KB')
console.log('  people          ', count('people'))
console.log('  families        ', count('families'))
console.log('  family_children ', count('family_children'))
console.log('  occupations     ', count('occupations'))
console.log('  events          ', count('events'))
console.log('  places (map pins)', count('places'))
console.log('  root            ', hub.given_name, hub.surname, '(' + hub.id.slice(0, 8) + ')')
db.close()
