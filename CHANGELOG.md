# Changelog

All notable changes to TreeMonk are documented here.

## [Unreleased]

### Added
- **GEDCOM package export/import (.zip with media)**: the export dialog can
  write one .zip holding the .ged plus its `media/` folder, and the import
  opens such a package directly (extracts it, imports the .ged with the media
  resolved). A plain .ged export still writes the pictures into the sibling
  `media/` folder — the success toast now says so, with the file count, so the
  folder is not left behind when the file moves to another machine. The
  profile photo is marked `_PRIM Y` on export, so a round trip restores which
  picture is the portrait. Prompted by a GitHub feature request (#18).
- **Investigation-board shortcuts on the profile**: a new Pin button puts the
  person straight onto the active investigation board, and when they are
  already pinned (on any board) it turns into an amber "On the board" link
  that jumps to the board and spotlights their node.
- **Christening year stands in on the People list**: when a person has no
  birth date but has a christening, the list shows the christening year —
  amber, with a leading ~ — instead of an empty lifespan.
- The batch-rename box now says where its trail lives: every rename is
  recorded in the History view and can be undone there.

### Technical
- **Electron 31 → 43.4.1** (community PR by @AntGervais, GitHub #14/#15):
  Electron 31 was end-of-life and macOS XProtect now deletes its binary, which
  made `npm run dev` impossible on a Mac. With it: better-sqlite3 13 (ABI 148),
  @electron/rebuild 4, `printToPDF` numeric margins, and — because Electron 32
  removed `File.path` — dropped files are resolved through the preload's
  `webUtils.getPathForFile`, so drag-and-drop onto the investigation board and
  onto a person's sources keeps working. CI builds on Node 22.

### Fixed
- **Corkboard map fragments were blank in the desktop app**: the 1.10.7 tile
  switch (Carto → OpenStreetMap) missed the renderer's Content-Security-Policy
  image whitelist, so Electron silently blocked the new tiles. The browser
  webapp was unaffected. Stale Carto entries left the CSP too.
- **Exact search now accepts typographic quotes**: „Dosa”, “Dosa” and »Dosa«
  work the same as "Dosa" — Hungarian keyboards and autocorrect often produce
  curly quotes, which the exact-match detector previously ignored.

### Added
- **Six new UI languages**: French (contributed by @AntGervais), Italian,
  Spanish, Russian (based on @lavich's translation), Polish and Portuguese —
  full locale parity
  (~1850 keys each incl. the built-in manual sections), localized month names
  with grammatical variants, date qualifiers, CSV headers, historical events,
  religion lists, website export, API docs and FamilySearch browser pages.
  Correct Slavic plural forms (few/many) for Russian and Polish.
- **Local API: source/citation/repository writes** for external research
  tools (church-book citation helpers etc.):
  `GET/POST /api/v1/sources` and `/api/v1/repositories` (idempotent via
  `externalId`), `POST /api/v1/people/{id}/citations` and
  `/api/v1/families/{id}/citations` (page, quality, note, event tag),
  `GET/POST /api/v1/families/{id}/events` (a marriage belongs to the couple),
  and `POST /api/v1/batch` — up to 100 operations in one atomic transaction
  with `$ref` cross-references, so one capture is all-or-nothing. Documented
  in /docs, the OpenAPI spec and the plugin developer guide.
- **Exact search with quotes**: a person query wrapped in quotes ("Dosa") is
  accent-sensitive — it finds only that exact spelling, never "Dósa"; the
  unquoted search stays forgiving. Works on the People page and every
  person picker.
- **Hidden issues tab**: everything dismissed as a false positive — data
  anomalies, name-variant suggestions and "not a duplicate" pairs — is listed
  in one place (like FamilySearch's rejected hints) and can be restored
  one by one; hidden anomalies show the affected people as clickable chips.
- **Name-variant groups can be hidden** ("this spelling set is fine"), the
  unify row shows WHO would be renamed (clickable list opening the profile),
  and a **batch-rename box** rewrites any exact name to another in one click
  ("Barbara" → "Borbála"), audit-logged and undoable.
- **Expired FamilySearch session is now impossible to miss**: opening an
  FS-mode tree after the 24h token lapsed pops a sign-in dialog (one click
  re-runs the browser sign-in), and the topbar carries a persistent status
  badge — green while connected, amber "sign-in needed" once expired. The
  state also refreshes whenever the window regains focus, and starting any
  FamilySearch action (person sync, pull-in-environment, change scan) with an
  expired session pops the same sign-in dialog instead of a bare error.
- **Map scope filter**: the map's control rail gained the same four circles
  the dashboard and the People page use — everyone, or the root person's
  bloodline / ancestors / descendants, with a married-in-spouses toggle — so
  the map can show ONLY the family you mean, not every imported side branch.
  The spouse toggle works on "Everyone" too: switching it off there narrows
  the map to the root person's blood circle, dropping married-in branches.
- **Christening-as-birth shortcut**: when a person has only a christening,
  one click marks its date and place as the birth (only fills empty fields).

### Fixed
- **Dark basemap showed "API Key Required" tiles**: Carto locked its free
  basemaps behind API keys, so the map's dark layer (and the corkboard's map
  fragment) broke. Both now use key-free sources — the OpenFreeMap dark vector
  style (same host as the light styles, labels localize too) and plain
  OpenStreetMap raster tiles. No account or key needed, ever. (GitHub #11)
- Person names now follow the UI language's order everywhere: the data-issue
  details and map/atlas labels put the surname first for Hungarian, matching
  the rest of the app.

## [1.10.0]

### Added
- **Complete GEDCOM export**: sources (uncited ones included), citations at
  every position (NAME, BIRT, CHR, DEAT, BURI, OCCU, RESI, EVEN, MARR, ENGA,
  DIV — with PAGE/QUAY/DATA and link details), repositories, source notes and
  the SUBM submitter record are all written out; unmatched citations fall back
  to record level instead of being dropped. Prompted by a detailed GitHub
  report.
- **GEDCOM-L place records (GOV)**: `_LOC` records are read on import —
  coordinates and GOV ids (gov.genealogy.net) land in the gazetteer, spelling
  variants referencing the same record link up through the canonical mapping
  layer, and no geocoding is needed for carried coordinates. Export writes
  standard inline MAP coordinates plus `_LOC`/`_GOV` records back, so the
  place registry round-trips losslessly.
- **Migration animation** on the map: a starting person's ancestors wander
  the timeline in seven color-coded branches (parents + four grandparent
  lines); relocations draw as curved trails with play/pause and adjustable
  speed, the historical basemap's borders follow the animation year, and
  **meeting points** mark where the paternal and maternal lines overlapped in
  space and time.
- **All blood connections** in the relationship finder: every nearest common
  ancestor (couples grouped), not just the shortest path — plus PDF export
  for both the relationship view and the pedigree-collapse view.

### Fixed
- GEDCOM import: nameless placeholder spouses are kept (families no longer
  lose a partner), NICK under NAME is read, CONF/ENGA/MARB/EMIG become
  structured events, citation DATA.WWW links and source-record notes are
  preserved, and OBJE record pointers with relative media paths resolve.

## [1.9.0]

### Added
- **Direct-line fast path**: with no descendants and no side branches the
  import pulls the pedigree via `/tree/ancestry` (8 generations per request,
  ahnentafel-numbered, multi-hop above that) instead of crawling person by
  person — the walk phase measured ~50× faster, the whole import roughly 2×.
  Marriage facts and parent links ride along on each person's own record.
- **Place mapping layer**: records are never rewritten; every raw place
  spelling keeps its own gazetteer row plus a `canonical` pointer
  (`places.canonical`), and the statistics group through it. Standardize
  builds mappings only. Bare one-word names get the tree's dominant region as
  a geocoding hint and are never text-"enriched".
- **Fact participants** (`fact_participants` table + IPC + UI): midwife,
  priest, doctor etc. with a free-text role on BIRT/CHR/DEAT/BURI; godparents
  moved into the christening block.
- **Couple notes import** from FamilySearch (`couple-relationships/{id}/notes`
  in the enrichment pass) and from GEDCOM FAM-level NOTEs.
- **Pre-import phase notice** (photos/sources arrive last, places unify last),
  scope filters (bloodline/ancestors/descendants) on the People page and the
  website/index exports, historical vs present-day map choice on the profile,
  record cards labelled, edition name + FS Solutions logo on the splash.
- Adaptive request pacing against FamilySearch's processing-time budget, with
  a live throttle self-test button; request timeouts everywhere (60s API /
  30s token / 120s media) so an import can never hang forever.

### Fixed
- **Replace-mode import wiped the database BEFORE authentication** — an
  expired session in replace mode destroyed the tree and imported nothing.
  The wipe now runs only after the session proves alive; `isSignedIn()`
  honours the token's 24h lifetime and a pre-import probe fails cleanly.
- **Place corruption**: standardization accepted the geocoder's top hit
  unchecked ("Póstelek, Békés" → Somogy; bare "Russland" → a Scottish
  settlement via the FS Places authority's variant matching). Multi-part
  names must not contradict the source; bare names are never rewritten.
- Post-import standardization skipped everything the incremental geocoder had
  just written (gazetteer snapshot taken before the import now).
- Compact dates ("19460704") parse everywhere (import falls back to the
  formal value, display, sanity, manual input mask).
- Unindexed FamilySearch sources show a derived ~year from their tagged
  event, validated against the register volume's year range.
- The fast path records known relatives, so the change watcher no longer
  flags every imported person with "new relatives".
- Sanity: sibling same-name rule removed (necronyms), death registration
  after death not flagged, dismissed anomalies clear from every panel live.
- UI: import dialog rebuilt (sliders, presets, live estimate, two columns,
  pinned FS-brand footer), sticky profile tab strip opaque, pedigree
  crosshair no longer shifts the row, atlas no longer force-switches the
  basemap when jumping to a person.

### Technical
- `places.canonical` column (idempotent migration), `PlaceInfo.canonical`
  through IPC and the web shim; `standardizeAll` keeps its IPC shape with
  `recordsUpdated` permanently 0.
- FamilySearch access tokens carry `issuedAt`; session file format extended
  backward-compatibly.

## [1.8.17]

### Added
- **FamilySearch integration is live in the free edition — READ-ONLY.** The
  AppKey is baked in at build time from the `FS_CLIENT_ID` repository secret
  (`MAIN_VITE_FS_ENV: production`); without a key the whole integration stays
  dormant exactly as before. All 18 `familysearch:*` IPC channels are reads —
  import, single-person sync, expand, search, lookup, preview, date
  normalization — and `FsPushDialog` does not exist in this build. Data moves
  one way: FamilySearch → TreeMonk.
- **Sign in / sign out row** in Settings → Data, and the first-launch
  "Start from FamilySearch" card now follows `familysearch.configured()`
  instead of being hard-disabled ("coming soon" only in keyless builds).
- **Local-first browser app** (treemonk.eu/webapp) replaces the read-only demo:
  the full editable app with the database persisted in the visitor's own
  browser storage (OPFS, IndexedDB fallback) — no cloud, no account. Shared
  migrations moved to `src/main/db/migrations.ts` so both runtimes run them.
- `workspaces:freshBootstrap` IPC + `wasFreshBootstrap()` /
  `markActiveWorkspaceKind()`, and `removeDisconnectedImports()` in `db/admin`.
- **One-time "a new family tree is needed" notice** on startup for users with an
  existing non-FS tree: FamilySearch and manual/GEDCOM modes live in separate
  trees, so the popup points at the workspace switcher in the top-left corner.
  `ReimportNoticeDialog` was repurposed for it (purely informational now: it no
  longer embeds `ModeChooser` and changes no mode), gated on a NEW
  `tm_fs_arrived_notice` flag â€” the old `tm_fs_reimport_notice` was already set
  for most of the target audience and would have swallowed the message.

### Fixed
- **FamilySearch mode is derived from the data**, not from a fragile flag: a
  tree containing FS-linked people (or a live FS session) is treated as an FS
  tree, restoring the integration for anyone whose flag had been zeroed. The
  legacy "default existing users to Manual" path now runs only when no choice
  was ever made, instead of resetting a chosen FS mode on every restart.
- A profile bootstrapped from nothing (fresh install / wiped data folder)
  clears the stale start-choice flags, so the start chooser appears again.
- The "interrupted import" warning fires once per run and never while an
  import is actually running (a language switch used to re-trigger it).
- **FamilySearch write boilerplate no longer round-trips into local data**:
  per-fact reason statements ending in "via TreeMonk" are dropped on read, and
  custom FS fact types (`data:,Baptism`) are normalised to their bare label.
- Media download no longer decodes thumbnails inline on the main thread
  (lower concurrency + async writes + deferred warm-up), so large imports stay
  responsive.

## [1.8.16]

### Added
- **Pedigree-collapse (Ősvesztés) finder**: new sidebar view under Kinship that
  walks the selected person's complete ancestor tree along EVERY path
  (Ahnentafel/Sosa numbering, blood lines only, no dedup) and lists each
  ancestor occupying 2+ Sosa positions with an ×n multiplier, generation info
  and the classic implex %. The right-hand pan/zoom canvas draws all paths as a
  single converging graph — shared segments once, junction points visible.
- **Per-fact sources & documents**: a ＋ button next to the birth / christening /
  death / burial blocks (profile + person panel) opens a modal to record a NEW
  source, cite an EXISTING source (searchable picker, new `research:listSources`
  IPC) or tie a DOCUMENT to the fact (file import or pick from the library).
  `person_documents` gained a nullable `event_tag` column (idempotent ALTER —
  existing DBs migrate untouched); the fact badge now counts citations and
  fact-tagged documents together, documents open in the in-app viewer.
- **Residence quick-fill**: residence events get "From birth" / "Until death"
  buttons that fill the date fields from the person's own vital dates.
- **GEDCOM: local media import**: `OBJE > FILE` entries pointing at local
  absolute paths (Windows/UNC/POSIX, `file://` too — e.g. a MyHeritage media
  folder) are now imported: files are copied into media storage (deterministic
  doc id → idempotent re-import), `_PRIM Y` becomes the profile photo; dead
  paths are skipped.

### Fixed
- **GEDCOM person notes were imported invisibly**: person-level NOTEs (inline
  and @N@ pointer records — Heredis/PAF & co.) now land in the profile's
  visible notes field (non-destructive merge on re-import via `fillFrom`), and
  the export writes linked note records too — as proper multi-line CONT/CONC
  structures instead of newline-flattened text.
- **Microsoft Store build couldn't open PDFs/documents**: MSIX virtualizes
  AppData writes into the package LocalCache, so external apps got a path that
  doesn't exist for them. `openDocument` now maps the virtual path to its real
  on-disk location before handing it to the OS.
- **Visible scrollbars**: the shared ScrollArea's scrollbar had no width and
  hover-only visibility — now 10px wide, always shown while content overflows
  (every list view: Documents, People, Todos, Research…).
- **Crisper text in the portrait tree view**: card positions snap to whole
  pixels (the layout's centering math produced fractional offsets → blurry
  glyphs), and PanZoom snaps its translate to integers at rest.

### Changed
- **Consistent Hungarian terminology**: web-link documents are now "Link"
  everywhere (was "Hivatkozás", clashing with citations), citations are
  "forráshivatkozás".

## [1.8.15]

### Added
- **Visible father/mother roles on the profile**: small role chips in the parents
  (Apa/Anya) and marriage (Férj/Feleség) sections show which family slot each
  person occupies. When a slot contradicts the person's recorded sex (what the
  data-issues "swapped roles" check flags), the chip turns amber with a warning
  tooltip and a ⇄ button swaps the roles in place (undoable) — the same
  operation as the one-click fix in Data issues, now reachable right where the
  problem is visible.

### Fixed
- **Adding a new parent now shows up immediately**: `fillParent` only refreshed
  families, not people, so a newly created father/mother wasn't in the people
  map and the slot kept showing the "add" button as if nothing happened —
  inviting duplicate parents. Now both stores refresh.

## [1.8.14]

### Added
- **Optional label emphasis for the card family tree** (`usePedigreeSettings.labelStrength`:
  `normal` | `bold` | `strong`, default `normal`): an inline style that bumps both
  font-weight and font-size of the person name so names stay legible when zoomed
  out. Applied to the landscape, portrait and descendant card views. Opt-in — the
  default look is unchanged for everyone.
- **Investigation Board — empty-pane context menu** with "Remove all threads" and
  "Clear board", so stuck connections can always be removed.
- **"What's new" page: Microsoft Store update notice** — a banner explaining that
  Store installs may receive updates later than direct/GitHub downloads.

### Fixed
- **Investigation Board self-heals orphan threads**: on load, any edge whose
  endpoint node no longer exists is dropped from state and the DB (React Flow
  can't render or select such an edge, so it used to linger as an invisible,
  un-removable "thread").
- **Fewer false positives in data checks**: `disconnected` now counts godparent /
  witness / event-participant links; `childBeforeMarriage` skips illegitimate and
  non-birth (adopted/step) relationships; `siblingSameName` skips necronyms (one
  child died before the other was born).

## [1.8.13]

### Added
- **Accessibility panel** (left sidebar flyout): contrast (incl. a high-contrast
  mode via a `.hc` class), font size, animations and reduce-effects toggles.
- **Photo region (face) tags**: draw a zone on a document image and link it to a
  person; regions are normalized (0..1) so they survive any display size, shown
  as boxes with names, click-to-open in the viewer. Cropping a **profile photo**
  auto-creates the matching region; profile photos can now be **removed**.
- **Selectable fonts for the fan / circle chart** — 20+ self-hosted woff2
  families (Latin + Latin-Extended), loaded locally (no CDN) and embedded into
  the exported SVG/PDF.
- **Map label localization**: base-map place names follow the chosen app
  language; the atlas control rail is collapsible.
- Data issues: ~24 new checks (event-after-death / before-birth, christening
  logic, unparsable/typo dates, marriage before-birth / too-young / age-gap /
  duplicate-couple / married-relative, parent-too-old, child-before-marriage,
  too-many-children, sibling-same-name, name affix/whitespace, married-name-as-
  maiden, sex-role mismatch, missing sex, own-ancestor loop, disconnected
  person, parentless family, missing media file) + a "notice" severity, plus
  one-click fixes (swap parents / move to the correct parent slot).

### Changed
- Settings page redesigned (left-rail tabs); "What's new" moved into Settings.
- Date DISPLAY now normalizes non-ISO stored dates (GEDCOM/legacy free-form)
  before formatting, so existing/imported dates reformat to the chosen format
  immediately — no focus/blur round-trip needed.

### Fixed
- CSV import: whole-file, quote-aware parse (embedded delimiters/newlines).
- GEDCOM: christening-type EVEN exact-anchored; per-parent child relations
  preserved through re-writes; anonymized-living children no longer leak
  adoption/foster/step facts.
- Given-names editor: Backspace-to-edit no longer wipes the draft.

## [1.8.12]

### Added
- **Offline month-name date parsing.** `normalizeDate` now recognises month
  names + abbreviations in hu/en/de, any order, mixed separators
  (space/./,/-/ /), Roman-numeral months (I–XII), ordinals, and small typos
  (Damerau OSA distance ≤1 on full names ≥6 chars). Composes with the existing
  qualifiers (abt/bef/aft/between) and Julian/dual markers. Requires a 4-digit
  year to fire. The FamilySearch Date authority stays primary when signed in;
  this is the offline equivalent.
- Space-separated numeric dates ("10 04 1992", "1992 04 10").
- Installer EULA (build/license_{en,hu,de}.txt) + a data-resale notice on the
  FamilySearch connect dialog and in the terms; README "Terms of use".

### Changed
- **DateInput shows one format focused and blurred.** Editing now happens on a
  draft seeded from the display-format value, so a field no longer reads as raw
  ISO while focused and eu/us after blur. Storage stays ISO (normalized on
  commit). The suggestion dropdown previews in the display format too.

### Fixed
- Dual-date parsing only fires when the two years are consecutive, so a plain
  year/month like "1850/3" canonicalises to "1850-03" instead of "1850/1903".
- A bare trailing "jul"/"Jul." (July abbreviation) is no longer misread as the
  Julian-calendar marker.
- Per-parent child-relation edits persist: the legacy-relation seed is now a
  one-time, settings-gated migration instead of re-running (and reverting user
  edits) on every launch.
- The website export no longer embeds a confidential person's real name in the
  section's data attribute.
- GEDCOM import treats only `RESN confidential` as the confidentiality flag
  (not `RESN privacy`, the anonymize-living marker) — a protected export no
  longer flags every living person confidential on re-import.

## [1.8.11]

### Added
- **Empty-tree onboarding.** With zero people in the database, the tree view
  shows a clear call to action instead of a blank canvas: a "Create the first
  person" button opening a three-step wizard (name/sex → birth date + place →
  done). The created person becomes the tree's starting person and the tree
  focuses on them; a GEDCOM-import link is offered as the alternative.
- **Search button in every place field.** Besides Enter and leaving the field,
  the lookup can now be triggered by clicking the magnifier inside the field
  (also in the investigation board's map search).

### Changed
- **Nominatim-policy-compliant place lookup.** Place fields no longer fire
  requests while typing; one lookup runs on Enter / blur / button. Lookups
  route through the TreeMonk geocoder proxy first (a zero-dependency server
  ships in `deploy/geocoder/` — shared cache + global throttle, optional
  LocationIQ upstream) and fall back to the public Nominatim transparently.
- **Map licensing hygiene.** The attribution control is always visible (no
  longer collapsed behind the compact ⓘ); the terrain DEM source is credited;
  the board's map cards fetch Carto tiles instead of tile.openstreetmap.org
  (the OSMF tile policy forbids distributed apps using the community server);
  the Esri satellite basemap was removed (licensing) with a silent settings
  migration back to the default; dead/unused hosts were pruned from the CSPs.
- **Feedback is a direct e-mail** to the developer (mailto) — the third-party
  Web3Forms relay, its dialog and its CSP entry were removed.

### Removed
- Vestigial famous-dataset packaging entry in electron-builder.yml.

## [1.8.10]

### Changed
- Internal optimizations and further preparation for the production
  FamilySearch integration; the local HTTP API is unchanged.

## [1.8.9]

### Changed
- **Descendants view redesigned.** The bare SVG rectangles were replaced with
  the pedigree's card language: photo avatars (LOD-aware — initials when zoomed
  out), sex accent bars, rounded connectors, a highlighted root card and a
  quiet per-card descendant-count badge.
- The profile header shows FULL birth/death dates (in the chosen display
  format, qualifiers localized) instead of years only.
- The per-parent relation control is a labelled chip ("Kapcsolat") with
  stronger contrast; the pencil-only affordance was too easy to miss.
- A few code comments reworded to neutral phrasing.

## [1.8.8]

### Added
- **Multiple parent families + parent slots.** Every family a person is a
  child of shows on the profile; a missing parent can be filled in (Add
  father/mother) and a second (e.g. adoptive) parent pair added. Abandoned
  empty pairs auto-clean on leaving the profile; a real pair can be unlinked
  (child–parents edge only) with confirmation.
- **Per-parent child relations.** `family_children` gains father_relation /
  mother_relation (legacy couple-level `relation` seeds both, idempotently);
  quiet badge + expandable per-parent selects with PARENT-perspective labels
  (Örökbefogadó, not Örökbefogadott); add-child dialog sets both sides.
  GEDCOM: standard `PEDI` when equal, FTM-style `_FREL`/`_MREL` when differing.
- **Union relationship type.** families.relationship (marriage default /
  partner / none / other) with a type-aware icon; GEDCOM `_REL` round-trip.
- **Protected GEDCOM export.** Options to exclude confidential people entirely
  or anonymize the living (structure kept, "Living //" + RESN privacy, family
  facts of living couples withheld).
- **Given-names chip editor.** Numbered, drag-to-reorder chips on both
  profiles — storage stays the space-separated string (zero migration).
- **Typed name variants.** Alias kinds (married / birth / aka / nickname /
  religious) with translated chips; married + birth (maiden) names shown in
  the profile header; GEDCOM NAME/TYPE values normalized on import.
- **CSV import.** Bulk person creation with delimiter + hu/en/de header
  auto-detection and quoted-field support.
- **Name & place index export.** Print-ready alphabetical name index + place
  index (birth/christening/marriage/death/burial/residence symbols) as one
  HTML file; confidential people excluded.
- **Julian calendar + dual dating.** `(J)` marker and dual years
  ("1699/00" → "1699/1700") parse, display, sort and round-trip.
- **Concise place names.** Nominatim lookups use addressdetails to compose
  settlement–county–country (drops járás/regions/postcodes; note: Nominatim's
  `municipality` IS the járás in Hungary); the standardize button rewrites
  existing long names.
- Help (person/map/settings sections) and the trilingual HTML manual gained
  chapters covering everything since 1.8.0.

### Changed
- **Union cards decluttered:** empty witnesses/family-events render as small
  chips that expand on use; participants section in the event dialog likewise.
- **Side panel:** the four flags share one row; witnesses/attributes/
  participations moved into a collapsed "More data" section; name
  prefix/suffix behind a "more name fields" link (both profiles).
- Godparents/christening-witness cards live only on the Family tab (the
  Overview duplicate was removed).

### Fixed
- Raw i18n keys at the Settings place-standardization row — the new `places`
  namespace had clobbered the existing one (1.8.0 regression).
- Child relation labels next to Apa/Anya now speak from the PARENT's
  perspective, and the child-add dialog clarifies it sets both parents.

## [1.8.0]

### Added
- **Witnesses.** Christening witnesses attach to a person, marriage witnesses
  to the specific union — person-referencing chips on the profile, side panel
  and family cards. GEDCOM round-trip via `ASSO`/`RELA christening witness`
  (person) and a family-level `_WITN` pointer.
- **Family (union) events.** Engagement, banns, civil/church wedding, divorce
  and separation recorded on the marriage card (the events table's family
  owner, no schema change). GEDCOM: `DIV`/`ENGA`/`MARB` plus typed `EVEN`.
- **Shared-event participants with roles.** Any person can take part in any
  event with a free-form role (priest, midwife, registrar, …); the participant's
  profile shows the reverse "Participations" view. GEDCOM: `_PART` + `ROLE`.
- **Adoption / parent types.** The child↔parents link carries a relation
  (birth / adopted / foster / step) — selectable in the add-child dialog and on
  the family cards; preserved across child reordering. GEDCOM `FAMC`/`PEDI`.
- **Structured date qualifiers.** "abt / before / after / between" dates are
  parsed from typed input in hu/en/de (`kb. 1850`, `1850 előtt`, `vor 1850`,
  `between 1850 and 1860`, `~1850`…), stored as canonical GEDCOM-style prefixes
  in the existing date fields (zero schema change) and displayed localized.
  Sorting and GEDCOM round-trip unaffected.
- **Name pieces.** Call name / Rufname (`_RUFNAME`), name prefix (`NPFX`) and
  suffix (`NSFX`) — editable on the profile and side panel, shown in the header.
- **Stillborn + confidential flags.** Stillborn implies deceased; confidential
  people export with `RESN confidential` and are excluded from the website
  export.
- **Person attributes.** Free-form key/value facts (height, DNA haplogroup, …)
  as a new card; GEDCOM `FACT`/`TYPE` round-trip.
- **Place hierarchy + GOV ids.** Places gain a type (village/district/county/…),
  a parent place and a GOV id (gov.genealogy.net) — managed in a new place
  manager dialog opened from the Map view; the flat place strings on records
  stay untouched.
- **Website export.** The whole tree as ONE self-contained, searchable HTML
  file (Settings → Export website), in the interface language, with every
  person cross-linked; confidential people excluded.

### Changed
- Events (person and family) are now added through the same modal that edits
  them, instead of the inline pre-fill row.

### Fixed
- Children sort by full birth-date precision (year-month-day) everywhere —
  profile family tab, dashboards; unions order by marriage number, then date.
- The printed family sheet shows ALL of a person's marriages, not just the
  last one.
- A GEDCOM `RELA` witness value is no longer misread as a godparent
  ("keresztelési tanú" used to match the godparent pattern).

## [1.7.5]

### Added
- **GEDCOM round-trip completeness.** Godparents now export/import as the
  standard `ASSO`/`RELA godparent` association; life events (residence,
  military, education, …) export as `RESI` / typed `EVEN` records with date
  ranges, places and notes, and import back as structured events (previously
  they were flattened into notes); per-vital research notes (`2 NOTE` under
  BIRT/CHR/DEAT/BURI) and the out-of-wedlock flag (`_ILLEGITIMATE`) round-trip;
  spouse families (`FAMS`) are written in marriage order.

### Changed
- **Person profile redesigned.** Compact segmented tab switcher (always
  labelled, animated, sticky while scrolling), grouped header actions with a
  ⋯ overflow menu (prints + delete moved there), identity/religion merged into
  one card, and the four vital events laid out as icon-labelled blocks in a
  2×2 grid with per-fact sources and notes inline.
- **Person side panel tidied.** The stacked header buttons collapsed into a
  compact action strip (tree / map / kinship tiles) plus Print and FamilySearch
  menus; the FamilySearch ID moved into a small dialog behind the FS menu.
- **Top bar is responsive.** Import/export/theme/language fold into a single
  ⋯ menu below 1024 px (icon-only labels below 1280 px), and the tree/root
  pickers get tighter max widths — nothing overlaps on small windows anymore.
- The tree views' "Display" settings panel starts collapsed, with a labelled
  button to open it.

### Fixed
- **GEDCOM export could scramble trees in other programs.** Generated record
  ids could collide with imported ones (`@I5@` given to two different people),
  which made Gramps/MyHeritage merge unrelated records — wrong parents,
  duplicated spouse couples. Xref assignment is now collision-free across the
  whole file, and re-importing the same file never duplicates data.
- Long unbreakable place names no longer push dialog content out of the frame
  (dialog grid items may now shrink).
- Timeline dots are no longer clipped at fractional display scalings — the
  rail and dots sit inside the list's own padding.

## [1.7.2]

### Added
- **To-do list (new sidebar view).** Create tasks with a title, note, priority
  (high / normal / low) and a due date; overdue dates are highlighted. Filter by
  open / done / all, search, toggle done in one click, and undo on delete.
- **Link people to a to-do.** A task can be attached to one or more people (via
  the existing person-picker). Each linked person's profile shows a "To-dos"
  section on the Research tab, where you can toggle a task done or create a new
  one already linked to that person; clicking a linked person on a task card
  opens their profile.

### Technical
- New `todos` and `todo_people` tables (auto-created on DB open), a `Todos` repo
  module, `todos:*` IPC channels, and reactive store state (`todos` plus a
  `todosByPerson` index). No online features — everything stays local.

## [1.7.0]

### Added
- **Plugin system (opt-in, mainly for advanced users).** Install a plugin from a
  .zip via *sidebar → Plugins*; its menu entries appear in the sidebar. Each
  plugin runs in a sandboxed panel that can reach **only** the local
  127.0.0.1 API, with its own scoped token limited to the permissions
  (read / write / documents) shown on install and granted by enabling it — no
  Node, no external network, so data cannot leave the machine. Includes a
  step-by-step installer that surfaces the exact validator error on a bad
  plugin, an in-app developer guide with a "Copy for AI" button (puts the full
  spec — manifest rules, SDK, API reference with examples — on the clipboard),
  a shared `treemonk.css` / `treemonk.js` SDK served at `tmplugin://sdk/…`
  (theme-aware, trilingual helpers), and two example plugins in `examples/`.
  Manifests must provide description + menu titles in all three languages
  (hu/en/de) or the installer rejects them. No online features and no built-in
  AI were added; nothing changes unless you install and enable a plugin.
- **Local API: read-only research endpoints.** Source citations, occupations,
  aliases, godparents, notes, research logs and FamilySearch collaborations are
  now exposed over the API, so plugins (and AI assistants over MCP) can see a
  person's sources and profile extras. MCP gained `get_sources` and
  `get_profile_extras` tools. `GET /api/v1/families` is now paged
  (`{total, offset, items}`), like `/api/v1/people`.

## [1.6.3]

### Added
- **Attach a source to several people at once.** After adding a file, image, link
  or citation to someone, a dialog offers to attach the same item to others —
  spouse, parents and children as one-tap quick picks (multi-select), plus a full
  person search.
- **Manage who an item is attached to, afterwards.** Documents and citations get a
  people button that opens a manager: see everyone it's attached to (remove with
  ×) and add more. For a citation this shows every person who cites the same
  source; removing one keeps the source for the others.
- **Link existing documents both ways.** From the Documents overview you can
  assign a document to people, and from a person's Sources panel you can link an
  existing document from the library ("Existing").

### Fixed
- **Calendar: long names no longer overflow the day cells** — they truncate
  cleanly inside the chip.
- **Image viewer: no more console warnings when zooming with the wheel** (the
  wheel handler is now a proper non-passive listener), and zooming no longer
  scrolls the page behind it.
- **Map: hardened against a "signal is aborted" crash** on basemap/theme swaps and
  when leaving the map view.

## [1.6.2]

### Fixed
- **Restoring a backup on another computer works now.** The workspace registry
  and document records store absolute paths, so a backup restored under a
  different Windows username (or drive) pointed at the old machine's folders —
  the app died on launch with "Could not open the database" even though every
  file had been restored fine. The registry now self-heals on load (a missing
  path is re-pointed at the same file in the current data folder; entries that
  resolve are never touched), and media reads fall back to the local media
  folder the same way — so photos and scanned documents display again and are
  included in GEDCOM exports after a restore. Covered by an e2e test that
  boots the app on a foreign-path registry.

## [1.6.1]

### Fixed
- **The date format setting now actually works.** *Settings → Appearance → Date
  format* (ISO / European / US) was previously ignored; dates are now shown in
  the chosen format everywhere — profile fields, events, occupations, timeline,
  tree marriage lines, research, documents and print sheets. Editable fields show
  the format when not being edited and the plain ISO value while you type; storage
  stays ISO, and textual dates ("abt 1850") and bare years are left untouched. The
  date-input placeholders follow the format too.

### Added
- **Reduce effects (Settings → Appearance).** Turns off the frosted-glass blur
  for solid surfaces — a big CPU drop on machines without GPU acceleration, where
  the blur is otherwise software-rendered on every panel. Off by default.

## [1.6.0]

### Added
- **Local API server (opt-in, mainly for advanced users).** TreeMonk can serve
  your tree over HTTP, strictly on 127.0.0.1 and protected by a Bearer token
  generated in Settings. Reads and writes (writes behind a second toggle) go
  through the same repository layer as the UI, so audit history is kept and open
  windows refresh live. Off by default — no online features and no built-in AI
  were added; nothing changes unless you enable it.
- **MCP server.** Connect an MCP-compatible assistant (e.g. Claude) to your tree:
  search people, walk relations/ancestors/timelines, get statistics, and — if
  writes are enabled — create and edit people, families and life events. Attached
  document images (photos, scanned certificates) can be opened by the assistant
  for reading and cross-checking.
- **Built-in offline docs** at `/docs` (hu/en/de) plus an OpenAPI 3.1 description
  at `/api/v1/openapi.json`.

## [1.5.10]

### Changed
- **Manual ordering now works on every row.** You can drag any occupation or life
  event anywhere — including dropping an undated entry *between* two dated ones,
  which the first version didn't allow. Dated entries still default to
  chronological order (a new dated entry auto-slots into its place; a new undated
  entry appends to the end). On this update the order is re-seeded chronologically
  once.

## [1.5.9]

### Added
- **Manual ordering for occupations and life events.** Undated entries can be
  dragged into a hand-set sequence (grab the handle on the row) when you know the
  order but not the dates. Dated entries still sort chronologically on their own.

### Fixed
- **Portrait tree view: switching a husband to a later wife now shows that
  marriage's children.** Previously the children below kept showing the first
  wife's, unless you re-picked the second wife as the start person.

## [1.5.8]

### Fixed
- **Source counts on the tree cards now update live.** Adding or removing a
  source (a document/link or a citation) on a profile immediately refreshes the
  source badge on the family-tree cards, instead of showing a stale count until
  you reloaded or re-rooted the tree.

## [1.5.7]

### Fixed
- **You can now add a child to a person who has no spouse.** The Family tab
  gains an *Add child* button that creates a single-parent family (this person as
  the sole parent, the other parent unknown) — for mother-only or father-only.
  You can still fill in the missing spouse on that family later.

## [1.5.6]

### Added
- **Verification marks (optional, off by default).** Turn it on in
  *Settings → Appearance → Verification marks* to give every person a coloured
  frame around their photo everywhere — **green = verified, orange = not
  verified**. Mark a person as verified with the check button on their card or
  full profile. The People page also gains a verified / not-verified filter (only
  shown while the setting is on).
- **Redesigned Settings page** — a wider, tidier, categorised layout.

### Fixed
- **Multiple residences now all show on the map.** Previously only one appeared
  (seemingly at random) because residence/life-event places were never geocoded.
  **What to do:** run *Settings → Standardize places* once — it now geocodes your
  residence places too, so all of them appear on the map (in date order along the
  migration path).

## [1.5.5]

### Fixed
- **Duplicate family after deleting + re-creating a spouse.** If a spouse was
  deleted and then re-created (instead of re-assigned), the children ended up in
  BOTH the real family and the old partner-less leftover — showing up as both
  siblings and half-siblings, and the real spouse stopped showing as a parent.
  A one-time automatic repair on launch now folds those redundant partner-less
  families away (a child is only removed when it already belongs to another
  family of the same parent, so nothing is ever orphaned).
- **Statistics page showed raw `{{…}}` placeholders** on the Generations and
  Living cards. The labels now render correctly.

## [1.5.4]

### Fixed
- **Re-add a spouse to a family that lost one.** When a spouse is deleted, the
  family (with its children) stays but with an empty partner slot. You can now
  set a spouse back onto that exact family — pick an existing person or create a
  new one — and the children (and any marriage date/place) are kept.

## [1.5.3]

### Changed
- **Completely redesigned Statistics page.** A tidy, tabbed layout — Overview,
  Population, Names, Places, Life and Migration — with animated KPI cards, a tree
  health score with quick wins, births/deaths by century, lifespan distribution,
  top names/places/occupations/religions, and birth→death migration routes.
  Everything stays clickable to drill into the people behind each number.

### Fixed
- **Wiping a tree now also deletes its media files** from disk, not just the
  database rows. Only the wiped tree's own photos/documents are removed (the
  media folder is shared between trees, so others are untouched); trashing a
  single document still keeps its file so it can be restored.

## [1.5.2]

### Changed
- **Redesigned the People page.** Uniform person cards (no more mismatched
  heights), a clean two-row toolbar, a segmented sex filter, a birth-year range,
  a place filter, the research-gap criteria tucked into a dropdown, sorting
  (name / birth year), and an empty state.

### Fixed
- **Map markers are far easier to hover and click** — an invisible larger
  hit-area sits under each small dot, so the pointer cursor and popups trigger
  reliably.
- **Wrong geocoding for messy place names.** A place like "Budapest X. kerület"
  could land on an unrelated same-named spot abroad (e.g. Argentina); results are
  now re-ranked by how well they match the text, so the right place wins. Re-run
  Settings → *Standardize places* to correct places already stored wrongly.
- **Map view could crash** while rebuilding its layers (and on a fast view
  switch); the layer/source teardown and disposal are now safe.

## [1.4.8]

### Fixed
- **Duplicate/"Unknown" spouses after merging people.** Merging two people who
  were both linked to the same partner could leave the shared spouse showing up
  two or three times — some as a stray "Unknown" — on the Family tab. Merge now
  folds the duplicated marriage into one, and a **one-time automatic repair runs
  on launch** to clean up any tree already affected (exact-duplicate couples are
  merged, empty single-partner "phantom" families are removed). Genuine
  single-parent families and recorded marriages are left untouched, and merges
  stay fully undoable.

## [1.4.7]

### Added
- **All-new launch splash** and a **fresh app logo** — a growing sprout that
  opens into a canopy, in the TreeMonk teal.
- **Person picker now disambiguates same-name people** — when choosing an
  existing person (e.g. a spouse) the list shows birth place, parents and spouse
  next to each name, so two "same name" people are easy to tell apart.

### Changed
- **Refreshed teal colour theme** across the whole app.
- **New standard tree-view look** — frame width 4, corner radius 24, line
  thickness 5, line opacity 100%. Existing users are switched to it automatically
  on update (you can still re-tune it afterwards).
- The occupation title field is now full-width so long job titles are readable.

## [1.4.6]

### Added
- **Marriage place autocomplete** — the family editor's place field now offers
  the same city suggestions as the birth/death place fields.
- **Life-event date ranges (from–to)** — events like residence can record a
  start AND end date, so "moved in" vs "moved out" is unambiguous.
- **Divorce** added as a life-event type.
- **Rename uploaded files/sources** — documents and images can be renamed after
  upload (pencil button on each thumbnail).
- **Religion quick-pick dropdown** — the religion field suggests common
  denominations (still free-text).
- Fan chart now supports up to **13 generations** (was 6).
- **Person sheet (Personenblatt)** — a printable, on-screen A4 record sheet for a
  person (vitals, parents, marriages, children, occupations, events, notes).
  Opens from the profile and the side panel; "Print" uses the system print dialog.
- **Family sheet (Familienblatt)** — a printable family group sheet (husband,
  wife, marriage, and a numbered children table).
- Print buttons on both the large profile and the small side panel.
- **Research logs are now editable** — click a log to open a modal that shows the
  full entry and lets you edit every field (previously they could only be
  deleted).

### Changed
- **Geocoding language follows the UI language** — place-name lookups
  (FamilySearch Places and Nominatim) now return names in the app's language
  (e.g. German for a German UI) instead of a fixed Hungarian-first order.
- **Map labels are localized** — base-map symbol labels now render in the UI
  language (`name:<lang>`), falling back to the latin/local name.
- Occupation date fields are clearly marked **optional** (only the title is
  required — occupations like "Rentnerin" save without dates).

### Notes
- A printable tree diagram already exists via the tree view's export button
  (vector SVG / single or tiled PDF, pedigree and fan layouts).
- **FamilySearch integration is prepared and coming soon.** The launch offers a
  FamilySearch / Manual start mode; the FamilySearch option is currently marked
  "coming soon". Read-only FamilySearch groundwork ships dormant; write-back is
  reserved for a future Pro edition.

### Safety
- Updating from an earlier version **never touches your existing database** — no
  prompt, no wipe; your tree keeps working in Manual mode.

<!-- The FamilySearch integration is developed separately and is not part of
     this public changelog. -->
