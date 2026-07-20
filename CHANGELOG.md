# Changelog

All notable changes to TreeMonk are documented here.

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
