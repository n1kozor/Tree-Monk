/**
 * The complete, self-contained TreeMonk plugin specification as one markdown
 * document — the "Copy for AI" button on the plugin dev guide puts this on
 * the clipboard so the user can paste it into any LLM and say "build me a
 * plugin that …". English on purpose: it is the most reliable prompt language
 * across models; the OUTPUT (the plugin) must still be trilingual, and the
 * spec says so emphatically.
 */

/**
 * Worked request/response examples with realistic sample data — shared
 * verbatim between the in-app dev guide's API reference and the LLM spec.
 */
export const API_EXAMPLES = `GET /api/v1/stats
→ 200
{
  "people": 395, "families": 224, "geocodedPlaces": 61,
  "earliestBirthYear": 1687, "latestBirthYear": 1995
}

GET /api/v1/people?q=kovács&limit=2
→ 200
{
  "total": 14,
  "offset": 0,
  "items": [
    {
      "id": "6a947a83-f25d-4fcc-b39d-aedc41152fe8",
      "givenName": "János",
      "surname": "Kovács",
      "sex": "M",
      "birthDate": "1874-03-11",
      "birthPlace": "Kecskemét",
      "deathDate": "1951-10-02",
      "deathPlace": "Budapest",
      "deceased": true,
      "illegitimate": false,
      "christeningDate": "1874-03-15",
      "christeningPlace": "Kecskemét",
      "burialDate": null,
      "burialPlace": null,
      "religion": "római katolikus",
      "notes": null
    },
    { "…": "second hit, same shape" }
  ]
}

GET /api/v1/people/6a947a83-f25d-4fcc-b39d-aedc41152fe8
→ 200
{
  "person": { "…": "the Person above" },
  "parentsFamily": {
    "id": "0f1c…", "husbandId": "9d2e…", "wifeId": "77ab…",
    "marriageDate": "1870-05-21", "marriagePlace": "Kecskemét",
    "marriageOrder": null, "notes": null,
    "childIds": ["6a947a83-f25d-4fcc-b39d-aedc41152fe8", "b31f…"]
  },
  "unions": [
    {
      "id": "4e09…", "husbandId": "6a947a83-f25d-4fcc-b39d-aedc41152fe8",
      "wifeId": "c554…",
      "marriageDate": "1896-11-08", "marriagePlace": "Budapest",
      "marriageOrder": 1, "notes": null, "childIds": ["e7d0…"]
    }
  ],
  "events": [
    {
      "id": "ab12…", "ownerType": "person",
      "ownerId": "6a947a83-f25d-4fcc-b39d-aedc41152fe8",
      "type": "residence", "date": "1900", "endDate": "1912",
      "place": "Szeged", "value": null, "note": "családi ház"
    }
  ]
}

GET /api/v1/families?limit=500&offset=0
→ 200 — PAGED envelope (like /people): iterate .items, not the object!
{
  "total": 224,
  "offset": 0,
  "items": [
    {
      "id": "4e09…", "gedcomId": null,
      "husbandId": "6a947a83-f25d-4fcc-b39d-aedc41152fe8", "wifeId": "c554…",
      "marriageDate": "1896-11-08", "marriagePlace": "Budapest",
      "marriageOrder": 1, "notes": null, "childIds": ["e7d0…"]
    }
  ]
}

POST /api/v1/people
body:
{ "givenName": "Mária", "surname": "Szabó", "sex": "F",
  "birthDate": "1901-02-03", "birthPlace": "Kecskemét" }
→ 201: the created Person (same shape as above, with a new "id")

PATCH /api/v1/people/{id}
body:  { "deathDate": "1980-06-30", "deathPlace": "Szeged" }
→ 200: the updated Person

POST /api/v1/people/{id}/events
body:  { "type": "residence", "date": "1920", "endDate": "1935", "place": "Szeged" }
→ 201: the created EventRecord

POST /api/v1/families
body:  { "husbandId": "6a94…", "wifeId": "c554…", "marriageDate": "1896-11-08",
         "marriageOrder": 1, "childIds": [] }
→ 201: the created Family

GET /api/v1/people/{id}/documents
→ 200
[
  {
    "id": "gm_5bab3766…",
    "title": "Halotti anyakönyvi kivonat",
    "kind": "certificate",
    "mimeType": "image/png",
    "date": "1951-10-04",
    "description": null,
    "personIds": ["6a947a83-f25d-4fcc-b39d-aedc41152fe8"]
  }
]
(the raw bytes: GET /api/v1/documents/gm_5bab3766…/file → image/png body;
 display with: const blob = await (await TM.fetch(path)).blob();
 img.src = URL.createObjectURL(blob))

GET /api/v1/people/{id}/citations
→ 200
[
  {
    "id": "cit-01", "sourceId": "src-01",
    "ownerType": "person", "ownerId": "6a947a83-f25d-4fcc-b39d-aedc41152fe8",
    "eventTag": "BIRT", "page": "fol. 112, no. 38",
    "quality": "primary", "note": null,
    "sourceTitle": "Kecskeméti r. k. keresztelési anyakönyv 1870–1880",
    "sourceAuthor": null,
    "sourcePublication": "Bács-Kiskun Megyei Levéltár",
    "sourceText": "1874. március 11-én született Kovács János…",
    "repositoryName": "MNL Bács-Kiskun Megyei Levéltára",
    "recordDate": "1874-03-15"
  }
]

GET /api/v1/people/{id}/occupations
→ 200
[ { "id": "occ-01", "personId": "6a94…", "title": "kovácsmester",
    "startDate": "1895", "endDate": "1930", "note": null } ]

GET /api/v1/people/{id}/aliases
→ 200
[ { "id": "al-01", "personId": "6a94…", "givenName": "Johann",
    "surname": "Kowatsch", "kind": "német anyakönyvi alak", "note": null } ]

GET /api/v1/people/{id}/godparents
→ 200
{ "godparentIds": ["77ab…"], "godchildIds": ["e7d0…", "b31f…"] }

GET /api/v1/people/{id}/notes
→ 200
[ { "id": "nt-01", "gedcomId": null,
    "text": "Az 1900-as népszámlálásban Szegeden szerepel." } ]

GET /api/v1/people/{id}/research-logs   (also: GET /api/v1/research-logs)
→ 200
[ { "id": "rl-01", "personId": "6a94…", "date": "2026-05-14",
    "title": "Halotti bejegyzés keresése", "repository": "FamilySearch",
    "sourceDesc": "Budapest VIII. ker. halotti akv.", "dateRange": "1950–1952",
    "result": "found", "detail": "1951. okt. 2., tüdőgyulladás",
    "createdAt": "2026-05-14T10:22:00.000Z" } ]

GET /api/v1/people/{id}/collaborations
→ 200
[ { "id": "co-01", "personId": "6a94…", "title": "Születési hely kérdéses",
    "body": "A FamilySearch-en vita: Kecskemét vagy Nagykőrös…",
    "createdAt": "2025-11-03T08:00:00.000Z" } ]

GET /api/v1/places
→ 200
[ { "name": "Kecskemét", "lat": 46.9062, "lon": 19.6913 },
  { "name": "Budapest", "lat": 47.4979, "lon": 19.0402 } ]

GET /api/v1/atlas/points
→ 200
[
  {
    "kind": "birth",
    "personId": "6a947a83-f25d-4fcc-b39d-aedc41152fe8",
    "personName": "Kovács János", "sex": "M",
    "year": 1874, "endYear": null, "date": "1874-03-11",
    "place": "Kecskemét", "lat": 46.9062, "lon": 19.6913,
    "detail": null
  },
  {
    "kind": "residence",
    "personId": "6a947a83-f25d-4fcc-b39d-aedc41152fe8",
    "personName": "Kovács János", "sex": "M",
    "year": 1900, "endYear": 1912, "date": "1900",
    "place": "Szeged", "lat": 46.2530, "lon": 20.1414,
    "detail": null
  }
]

GET /api/v1/pedigree?rootId=6a947a83-…
→ 200 — nested couple tree:
{
  "id": "…", "familyId": "4e09…",
  "primary":  { "id": "6a94…", "givenName": "János", "surname": "Kovács", "…": "person-card fields" },
  "partner":  { "id": "c554…", "givenName": "Erzsébet", "surname": "Nagy", "…": "…" },
  "marriageDate": "1896-11-08", "marriagePlace": "Budapest", "marriageOrder": 1,
  "children": [ { "…": "PedigreePerson" } ],
  "primaryUnions": [ { "familyId": "4e09…", "marriageOrder": 1, "…": "…" } ],
  "partnerUnions": [],
  "fatherParents": { "…": "PedigreeCouple of primary's parents (recursive)" },
  "motherParents": null
}

GET /api/v1/export/gedcom
→ 200
{ "gedcom": "0 HEAD\\n1 SOUR TreeMonk\\n…full GEDCOM 5.5.1 text…" }

Error responses:
401 { "error": "Missing or invalid Bearer token" }
403 { "error": "This plugin was not granted the \\"write\\" permission" }
404 { "error": "Person not found" }
409 { "error": "File not downloaded locally yet — open it in the app first" }
410 { "error": "File missing on disk" }`
export const PLUGIN_LLM_SPEC = `# TreeMonk Plugin Development Specification

You are building a **plugin for TreeMonk**, a local-first desktop genealogy
application (Electron). Follow this specification EXACTLY — the installer
validates hard requirements and rejects non-conforming zips.

## What a plugin is

A plugin is a folder, delivered as a **single .zip**, containing:

\`\`\`
manifest.json     (required — validated on install)
index.html        (your panel; name it anything, reference it in the manifest)
icon.svg          (recommended)
…any other html/js/css/image files you need
\`\`\`

It runs as a **sandboxed iframe panel** inside the app:
- No Node.js, no Electron APIs, no npm — plain web platform only.
- Content-Security-Policy allows network access to \`http://127.0.0.1\` ONLY
  (the local TreeMonk API). Requests to any other host are blocked by the
  browser — do not attempt them.
- All data access goes through the local REST API with the plugin's own
  Bearer token, limited to the permissions declared in the manifest.
- There is no persistent storage guarantee (no localStorage across origins);
  treat the panel as stateless. It is reloaded when the user switches the
  app language or theme.

## manifest.json — exact validation rules

\`\`\`json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "you",
  "description": {
    "hu": "Rövid leírás magyarul.",
    "en": "A short description in English.",
    "de": "Eine kurze Beschreibung auf Deutsch."
  },
  "icon": "icon.svg",
  "permissions": ["read"],
  "menu": [
    {
      "id": "main",
      "title": { "hu": "Saját nézet", "en": "My view", "de": "Meine Ansicht" },
      "entry": "index.html"
    }
  ]
}
\`\`\`

Rules (violations = install rejected):
- \`id\`: lowercase letters/digits/dashes, 2–64 chars, must match the folder;
  \`"sdk"\` is reserved.
- \`name\`, \`version\`: non-empty strings.
- \`description\`: an OBJECT with non-empty \`hu\`, \`en\` AND \`de\` strings.
  A plain string or a missing language is rejected.
- \`permissions\`: array; allowed values only \`"read"\`, \`"write"\`,
  \`"documents"\`. Request ONLY what you use.
- \`menu\`: at least one entry. Each entry: \`id\` (slug), \`title\` (OBJECT
  with non-empty hu+en+de — enforced), \`entry\` (relative path to an .html
  file inside the zip; no "..").
- \`icon\` (optional): an svg/png/webp path inside the zip, or an emoji.
  Prefer a Lucide-style SVG (24×24 viewBox, fill="none", stroke="#000",
  stroke-width 2, stroke-linecap/linejoin round) — the app renders it as a
  currentColor mask so it matches the built-in icons in every theme/state.

## Boot parameters

The entry page receives its configuration in the **URL hash**:

| param | value |
|---|---|
| \`api\`   | \`http://127.0.0.1:<port>\` — local API base |
| \`token\` | the plugin's scoped Bearer token |
| \`lang\`  | \`hu\` \\| \`en\` \\| \`de\` — current app language |
| \`theme\` | \`light\` \\| \`dark\` — current app theme |

## The official SDK (use it)

Load both files from the app-served \`sdk\` host (works offline):

\`\`\`html
<link rel="stylesheet" href="tmplugin://sdk/treemonk.css" />
<script src="tmplugin://sdk/treemonk.js"></script>
\`\`\`

\`treemonk.js\` parses the hash, sets \`<html data-theme="light|dark">\` and
exposes \`window.TM\`:
- \`TM.t({hu, en, de})\` → the string for the current app language.
- \`TM.fetch(path, opts?)\` → \`fetch\` against the local API with the
  Authorization header set; JSON responses are parsed; non-2xx throws
  \`Error('API <status>')\`. Example: \`TM.fetch('/api/v1/people?q=kiss')\`.
- \`TM.api\`, \`TM.token\`, \`TM.lang\`, \`TM.theme\` — the boot params.

\`treemonk.css\` provides the app's look, automatically correct in light AND
dark (colors flip on \`data-theme\`):
- Layout/typography: sensible body defaults, \`h1\`, \`h2\`.
- Classes: \`.tm-card\` (panel/row card), \`.tm-row\` (flex row),
  \`.tm-badge\` (accent pill), \`.tm-btn\` / \`.tm-btn-primary\` (buttons),
  \`.tm-input\` (inputs), \`.tm-table\` (data table), \`.tm-sub\` (subtitle),
  \`.tm-muted\` (secondary text), \`.tm-state\` (empty/loading state).
- CSS variables for custom styles: \`--tm-fg\`, \`--tm-muted\`, \`--tm-card\`,
  \`--tm-card-solid\`, \`--tm-border\`, \`--tm-accent\`, \`--tm-accent-soft\`,
  \`--tm-danger\`, \`--tm-radius\`.

**Never hard-code text or background colors** — always the variables; that is
what makes dark mode automatic.

## MANDATORY quality rules

1. Every user-visible string goes through \`TM.t({hu, en, de})\` — the plugin
   must be fully usable in Hungarian, English and German.
2. Both themes must look right (free if you use the SDK variables).
3. Render user-sourced data (names, notes…) with \`textContent\`, NEVER with
   \`innerHTML\` string interpolation — genealogy data can contain anything.
4. Handle the error/empty states: API unreachable, zero results.
5. Declare only the permissions you call.

## Local REST API reference

Base: \`TM.api\` (\`http://127.0.0.1:<port>\`). Auth: \`Authorization: Bearer
<TM.token>\` (TM.fetch does this). Errors: \`401\` invalid token, \`403\`
permission not granted to this plugin, \`404\` unknown id/route, JSON body
\`{ "error": "…" }\`.

Dates are ISO-ish strings (\`YYYY-MM-DD\`, sometimes partial like \`1850\` or
textual like \`abt 1850\`) — parse defensively (\`/\\d{4}/\` for the year).
Ids are opaque strings; never invent them, always look them up first.

### read permission

- \`GET /api/v1/stats\`
  → \`{ people, families, geocodedPlaces, earliestBirthYear, latestBirthYear }\`
- \`GET /api/v1/people?q=<substring>&limit=<≤500, default 100>&offset=<n>\`
  → \`{ total, offset, items: Person[] }\` (q matches "given surname" and
  "surname given", accent-sensitive lowercase substring)
- \`GET /api/v1/people/{id}\`
  → \`{ person: Person, parentsFamily: Family|null, unions: Family[], events: EventRecord[] }\`
- \`GET /api/v1/people/{id}/events\` → \`EventRecord[]\`
- \`GET /api/v1/families?limit=<≤1000, default 200>&offset=<n>\`
  → \`{ total, offset, items: Family[] }\` — PAGED, same envelope as /people;
  loop with offset to drain it (do NOT iterate the envelope itself)
- \`GET /api/v1/families/{id}\` → \`Family\`
- \`GET /api/v1/people/{id}/documents\` → \`DocumentMeta[]\`
- \`GET /api/v1/people/{id}/citations\` → \`CitationDetail[]\` (source
  title/author/publication/transcription, event tag, page, quality)
- \`GET /api/v1/people/{id}/occupations\` → \`Occupation[]\`;
  \`GET /api/v1/occupations\` → every occupation
- \`GET /api/v1/people/{id}/aliases\` → \`Alias[]\` (name variants);
  \`GET /api/v1/aliases\` → every alias
- \`GET /api/v1/people/{id}/godparents\` → \`{ godparentIds, godchildIds }\`
- \`GET /api/v1/people/{id}/notes\` → \`NoteRecord[]\`
- \`GET /api/v1/people/{id}/research-logs\` → \`ResearchLog[]\`;
  \`GET /api/v1/research-logs\` → every entry (personId null = general)
- \`GET /api/v1/people/{id}/collaborations\` → \`Collaboration[]\` (read-only
  FamilySearch discussions)
- \`GET /api/v1/places\` → geocoded gazetteer entries \`{ name, lat, lon }\`
- \`GET /api/v1/pedigree?rootId=<personId>\` → nested couple tree (couple +
  children arrays; explore the JSON — shape mirrors the app's pedigree view)
- \`GET /api/v1/atlas/points\` → \`AtlasPoint[]\` (every geocoded life event)
- \`GET /api/v1/export/gedcom\` → \`{ gedcom: "<full GEDCOM 5.5.1 text>" }\`

### write permission (each write is audit-logged and undoable in the app)

- \`POST /api/v1/people\` body: PersonInput → created \`Person\` (201)
- \`PATCH /api/v1/people/{id}\` body: partial PersonInput → updated \`Person\`
- \`DELETE /api/v1/people/{id}\`
- \`POST /api/v1/people/{id}/events\` body: EventInput → created \`EventRecord\`
- \`DELETE /api/v1/events/{id}\`
- \`POST /api/v1/families\` body: FamilyInput → created \`Family\` (201)
- \`PATCH /api/v1/families/{id}\` body: partial FamilyInput → updated \`Family\`
- \`DELETE /api/v1/families/{id}\`

### documents permission

- \`GET /api/v1/documents/{id}/file\` → the raw file bytes (image/PDF; the
  Content-Type header tells you what it is). Use ids from
  \`/api/v1/people/{id}/documents\`. \`409\` = the file is a remote URL not
  downloaded yet; \`410\` = missing on disk.

### Data shapes

\`\`\`ts
Person {
  id: string
  givenName: string; surname: string
  sex: 'M' | 'F' | 'U'
  birthDate, birthPlace, deathDate, deathPlace: string | null
  deceased: boolean            // may be true with no deathDate
  illegitimate: boolean
  christeningDate, christeningPlace, burialDate, burialPlace: string | null
  religion, notes: string | null
  // …plus additional read-only fields (fsId, avatar crop, …): ignore unknowns
}
PersonInput  = any subset of the fields above (no id)

Family {
  id: string
  husbandId, wifeId: string | null
  marriageDate, marriagePlace: string | null
  marriageOrder: number | null   // 1 = first marriage, 2 = second, …
  notes: string | null
  childIds: string[]
}
FamilyInput  = any subset (childIds replaces the whole list)

EventRecord {
  id: string
  ownerType: 'person' | 'family'; ownerId: string
  type: string        // 'residence' | 'occupation-ish types | free-form label
  date, endDate, place, value, note: string | null
}
EventInput   = { type?, date?, endDate?, place?, value?, note? }

DocumentMeta {
  id: string; title: string
  kind: 'photo'|'certificate'|'census'|'letter'|'map'|'newspaper'|'other'
  mimeType: string | null; date: string | null; description: string | null
  personIds: string[]
}

AtlasPoint {
  kind: string          // 'birth'|'death'|'marriage'|'residence'|'christening'|'burial'|'other'
  personId: string; personName: string; sex: 'M'|'F'|'U'
  year: number | null; endYear: number | null; date: string | null
  place: string; lat: number; lon: number
  detail: string | null
}

CitationDetail {
  id: string; sourceId: string | null
  ownerType: 'person' | 'family'; ownerId: string
  eventTag: string | null      // which fact it supports, e.g. 'BIRT', 'DEAT'
  page, quality, note: string | null
  sourceTitle: string; sourceAuthor, sourcePublication: string | null
  sourceText: string | null    // transcription of the source
  repositoryName, recordDate: string | null
}

Occupation { id, personId, title: string, startDate, endDate, note: string | null }
Alias      { id, personId, givenName, surname: string, kind, note: string | null }
NoteRecord { id: string, gedcomId: string | null, text: string }

ResearchLog {
  id: string; personId: string | null   // null = general (not person-specific)
  date, title: string
  repository, sourceDesc, dateRange: string | null
  result: string                        // e.g. 'found' | 'not-found' | …
  detail: string | null; createdAt: string
}

Collaboration { id, personId, title: string | null, body: string, createdAt: string | null }
\`\`\`

### Worked examples — real shapes with sample data

Use these as the source of truth for field names and envelopes:

\`\`\`
${API_EXAMPLES}
\`\`\`

## Complete working example

**manifest.json**

\`\`\`json
{
  "id": "longevity-top",
  "name": "Longevity Top List",
  "version": "1.0.0",
  "author": "TreeMonk examples",
  "description": {
    "hu": "A családfád leghosszabb életű tagjai — toplista a helyi API-ból.",
    "en": "The longest-lived members of your tree — a top list from the local API.",
    "de": "Die langlebigsten Mitglieder deines Stammbaums — eine Topliste aus der lokalen API."
  },
  "icon": "icon.svg",
  "permissions": ["read"],
  "menu": [
    {
      "id": "toplist",
      "title": { "hu": "Hosszú élet toplista", "en": "Longevity top list", "de": "Langlebigkeit-Topliste" },
      "entry": "index.html"
    }
  ]
}
\`\`\`

**index.html**

\`\`\`html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="tmplugin://sdk/treemonk.css" />
    <script src="tmplugin://sdk/treemonk.js"></script>
  </head>
  <body>
    <h1 id="title"></h1>
    <p class="tm-sub" id="sub"></p>
    <div id="out" class="tm-state"></div>
    <script>
      const T = {
        title: TM.t({ hu: 'Hosszú élet toplista', en: 'Longevity top list', de: 'Langlebigkeit-Topliste' }),
        loading: TM.t({ hu: 'Betöltés…', en: 'Loading…', de: 'Laden…' }),
        years: TM.t({ hu: 'év', en: 'yrs', de: 'J.' }),
        none: TM.t({ hu: 'Nincs elég adat.', en: 'Not enough data.', de: 'Zu wenig Daten.' }),
        error: TM.t({ hu: 'Nem sikerült elérni a helyi API-t.', en: 'Could not reach the local API.', de: 'Lokale API nicht erreichbar.' })
      }
      document.getElementById('title').textContent = T.title
      const out = document.getElementById('out')
      out.textContent = T.loading
      const year = (s) => { const m = /\\d{4}/.exec(s || ''); return m ? Number(m[0]) : null }

      TM.fetch('/api/v1/people?limit=500')
        .then(({ items }) => {
          const scored = items
            .map((p) => {
              const b = year(p.birthDate), d = year(p.deathDate)
              return b && d && d >= b && d - b < 130
                ? { name: (p.givenName + ' ' + p.surname).trim() || '—', b, d, age: d - b } : null
            })
            .filter(Boolean).sort((a, b) => b.age - a.age).slice(0, 20)
          if (!scored.length) { out.textContent = T.none; return }
          out.className = ''
          out.innerHTML = scored.map((p, i) =>
            '<div class="tm-card tm-row"><b>' + (i + 1) + '.</b>' +
            '<span class="name" style="flex:1"></span>' +
            '<span class="tm-muted">' + p.b + '–' + p.d + '</span>' +
            '<span class="tm-badge">' + p.age + ' ' + T.years + '</span></div>').join('')
          out.querySelectorAll('.name').forEach((el, i) => (el.textContent = scored[i].name))
        })
        .catch(() => { out.textContent = T.error })
    </script>
  </body>
</html>
\`\`\`

## Delivery

Produce every file's full content. The user zips the folder's contents
(manifest at the zip root, or inside one top-level folder — both accepted)
and installs it in TreeMonk via *sidebar → Plugins → Add plugin*. If the
installer rejects it, it shows the exact validator message — fix and re-zip.

## Final checklist (verify before you output)

- [ ] description + every menu title has non-empty hu, en AND de
- [ ] every visible string uses TM.t({...})
- [ ] SDK css+js loaded from tmplugin://sdk/…, colors only via --tm-* vars
- [ ] user data rendered via textContent (no HTML injection)
- [ ] only used permissions declared
- [ ] error + empty states handled
- [ ] no requests to anything except TM.api
`
