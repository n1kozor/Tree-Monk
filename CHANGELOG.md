# Changelog

All notable changes to TreeMonk are documented here.

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
