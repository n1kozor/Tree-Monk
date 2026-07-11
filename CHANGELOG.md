# Changelog

All notable changes to TreeMonk are documented here.

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
