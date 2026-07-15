// Shared domain types — imported by both the Electron main process and the renderer.

export type Sex = 'M' | 'F' | 'U'

/** An isolated family tree ("mandant") — its own database file. */
export interface Workspace {
  id: string
  name: string
  file: string
  color: string
  createdAt: string
}

export interface Person {
  id: string
  gedcomId: string | null
  /** FamilySearch person id (_FSFTID), used to resolve the default root. */
  fsId: string | null
  givenName: string
  surname: string
  sex: Sex
  birthDate: string | null
  birthPlace: string | null
  deathDate: string | null
  deathPlace: string | null
  /** Known to have died, even when no death date is recorded (GEDCOM `DEAT`). */
  deceased: boolean
  /** Marked as born out of wedlock (törvénytelen gyermek). */
  illegitimate: boolean
  /** Manually reviewed & confirmed ("verified") by the user. Off by default;
   *  surfaced as a green/orange mark when the verification setting is on. */
  verified: boolean
  /** Burial / interment (GEDCOM BURI). */
  burialDate: string | null
  burialPlace: string | null
  /** Christening / baptism (GEDCOM CHR/BAPM, FS /Christening). */
  christeningDate: string | null
  christeningPlace: string | null
  /** Religious affiliation (GEDCOM RELI, FS /Religion). */
  religion: string | null
  /** Per-vital research "reason" notes (e.g. a FamilySearch cause-of-death note). */
  birthNote: string | null
  deathNote: string | null
  christeningNote: string | null
  burialNote: string | null
  occupation: string | null
  notes: string | null
  profilePhotoId: string | null
  /** Framing for the profile photo, JSON `{x,y,scale}` — x/y are object-position
   *  fractions (0..1, 0.5 = centred), scale is zoom (≥1). Null = centred, no zoom. */
  profilePhotoCrop: string | null
  createdAt: string
  updatedAt: string
}

export type PersonInput = Partial<
  Omit<Person, 'id' | 'createdAt' | 'updatedAt'>
> & { givenName?: string; surname?: string }

/** GEDCOM-style family unit: a couple plus their children. */
export interface Family {
  id: string
  gedcomId: string | null
  husbandId: string | null
  wifeId: string | null
  marriageDate: string | null
  marriagePlace: string | null
  /** Which marriage this is for the couple (1 = first, 2 = second, …). */
  marriageOrder: number | null
  notes: string | null
  childIds: string[]
}

export type FamilyInput = Partial<Omit<Family, 'id' | 'childIds'>> & {
  childIds?: string[]
}

export type DocumentKind =
  | 'photo'
  | 'certificate'
  | 'census'
  | 'letter'
  | 'map'
  | 'newspaper'
  | 'other'

export interface DocumentRecord {
  id: string
  title: string
  kind: DocumentKind
  filePath: string
  mimeType: string | null
  date: string | null
  description: string | null
  createdAt: string
  /** Person ids this document is attached to (many-to-many). */
  personIds: string[]
}

export type DocumentInput = Partial<
  Omit<DocumentRecord, 'id' | 'createdAt' | 'personIds'>
> & { personIds?: string[] }

// ---- Investigation Board ----

export type BoardNodeKind =
  | 'note'
  | 'person'
  | 'document'
  /** Image evidence (drag-drop / clipboard) shown as a photo / torn snippet. */
  | 'evidence'
  /** Unknown-person placeholder (silhouette + "?"). */
  | 'mystery'
  /** Translucent group box that visually encloses related nodes. */
  | 'zone'
  /** External web link / reference. */
  | 'link'
  /** A paper-style map snippet pinned to a place (lat,lng in `content`). */
  | 'map'

/** Evidence strength of a board connection. */
export type EdgeCertainty = 'verified' | 'suspicion' | 'theory'

export interface BoardNode {
  id: string
  boardId: string
  kind: BoardNodeKind
  /** person.id or document.id when kind !== 'note'. */
  refId: string | null
  label: string | null
  content: string | null
  posX: number
  posY: number
  width: number | null
  height: number | null
  /** Free-form JSON (color, verified flag, etc.). */
  data: Record<string, unknown>
}

export interface BoardEdge {
  id: string
  boardId: string
  source: string
  target: string
  label: string | null
  data: Record<string, unknown>
}

export interface BoardState {
  nodes: BoardNode[]
  edges: BoardEdge[]
}

// ---- Tree projection (for react-d3-tree) ----

export interface TreeNodeDatum {
  name: string
  /** Name parts, so the renderer can order them per locale (Hungarian = surname first). */
  given?: string
  surname?: string
  attributes?: Record<string, string | number>
  personId?: string
  sex?: Sex
  birthYear?: string
  deathYear?: string
  __rd3t?: unknown
  children?: TreeNodeDatum[]
}

// ---- GEDCOM ----

// ---- FamilySearch importer ----

export interface FamilySearchImportOptions {
  /** Which FamilySearch tree to import from ('GLOBAL' = shared Family Tree). */
  treeId?: string
  /** Hard cap on how many persons to import (priority: direct line first). */
  maxPersons?: number
  /** Legacy fields — unused by the official OAuth flow, kept for IPC compat. */
  username?: string
  password?: string
  /** Starting person FID; defaults to the logged-in user. */
  root?: string
  /** Ancestor generations to fetch (upward). */
  ascend?: number
  /** Collateral depth (1 = direct ancestor lines only; higher = more relatives). */
  depth?: number
  /** Descendant depth fetched per ancestor (side-branches). */
  childrenDepth?: number
  /** Hard safety cap: stop after this many people (0/undefined = unlimited). */
  maxPeople?: number
  /** Wipe all existing data before importing. Default is a non-destructive merge. */
  replace?: boolean
  /** Keep the current global starting person (don't re-root on the imported root).
   *  Used by the per-person "deep import" so it only adds a branch. */
  keepRoot?: boolean
}

export interface FamilySearchPersonResult {
  id: string
  name: string
  lifespan: string | null
  gender: string | null
}

export interface FamilySearchPreview {
  root: FamilySearchPersonResult
  ancestors: number
}

/** Last-used FS import settings, persisted so the user can re-import easily.
 *  The password is NEVER stored on disk — only echoed from the in-memory
 *  session cache when still logged in. */
export interface FamilySearchSavedSettings {
  username?: string
  password?: string
  root?: string
  ascend?: number
  depth?: number
  maxPeople?: number
  replace?: boolean
}

export interface FamilySearchStatus {
  phase:
    | 'auth'
    | 'fetching_root'
    | 'searching'
    | 'processed'
    | 'ancestors'
    | 'ancestors_done'
    | 'side_branches'
    | 'downloading_children'
    | 'writing_gedcom'
    | 'ingesting'
    | 'limit'
    | 'done'
    | 'error'
  message?: string
  name?: string
  fid?: string
  generation?: number
  count?: number
  total?: number
  processed?: number
  depth?: number
  individuals?: number
  families?: number
  root?: string
}

export interface GedcomImportResult {
  /** Total people touched (created + updated) — kept for back-compat. */
  people: number
  /** Total families touched (created + updated). */
  families: number
  skipped: number
  /** Breakdown shown to the user: how many were newly added vs. merged. */
  peopleCreated?: number
  peopleUpdated?: number
  familiesCreated?: number
  familiesUpdated?: number
  sources?: number
  notes?: number
  citations?: number
  /** Media references (OBJE → FILE) imported as link-documents. */
  documents?: number
}

/** Live progress of the background remote-media (image) downloader. */
export interface MediaDownloadProgress {
  done: number
  total: number
  /** Successfully downloaded + localized. */
  ok: number
  /** Skipped due to fetch errors (auth-gated / dead URLs). */
  failed: number
}

/** A live node broadcast during a streaming FamilySearch import. */
export interface FsImportNodeEvent {
  kind: 'person' | 'family'
  person?: Person
  family?: Family
}

// ---- Kinship anomalies (consanguinity / step-sibling marriage) ----

export type KinshipKind = 'consanguineous' | 'stepSiblingMarriage'

/** A flag on one person, explaining an unusual marriage they're part of. */
export interface KinshipFlag {
  kind: KinshipKind
  /** The spouse on the other side of the flagged marriage. */
  withId: string | null
  /** Supporting ids: the common blood ancestor (consanguineous) or the two
   *  shared step-parents (stepSiblingMarriage). */
  relatedIds: string[]
}

// ---- Pedigree (FamilySearch-style couple cards) ----

export interface PedigreePerson {
  id: string
  name: string
  /** Name parts, so the renderer can order them per locale (Hungarian = surname first). */
  given: string
  surname: string
  sex: Sex
  birthYear: string
  deathYear: string
  living: boolean
  docs: number
  /** First-union spouse (one level only, no further nesting) — lets the pedigree
   *  show a collateral person together with their partner. */
  spouse?: PedigreePerson | null
}

/** A reference to one of a person's marriages/unions (for spouse switching). */
export interface UnionRef {
  familyId: string
  spouseId: string | null
  spouseName: string
  spouseGiven: string
  spouseSurname: string
  /** 1st / 2nd / … marriage badge, when the user set one on the union. */
  marriageOrder: number | null
}

/** A couple node = two parents shown together in one card. */
export interface PedigreeCouple {
  id: string
  /** The underlying union family id (null for an unmarried solo proband). */
  familyId: string | null
  /** Father / husband (rendered on top). */
  primary: PedigreePerson | null
  /** Mother / wife (rendered on the bottom). */
  partner: PedigreePerson | null
  marriageDate: string | null
  marriagePlace: string | null
  /** 1st / 2nd / … marriage badge, when set on the union. */
  marriageOrder: number | null
  /** Children of this union. */
  children: PedigreePerson[]
  /** All unions of `primary` / `partner` — when >1, the card offers a switcher. */
  primaryUnions: UnionRef[]
  partnerUnions: UnionRef[]
  /** primary's parents. */
  fatherParents: PedigreeCouple | null
  /** partner's parents. */
  motherParents: PedigreeCouple | null
  /**
   * Descendant couples (each child's own marriage/union), built a few levels
   * deep ONLY for the focused root couple. Drives the left/downward expansion
   * in the pedigree chart. Empty for ancestor couples.
   */
  descendants: PedigreeCouple[]
}

// ---- Sources / Citations / Notes / Repositories ----

export interface Repository {
  id: string
  gedcomId: string | null
  name: string
  address: string | null
}

export interface Source {
  id: string
  gedcomId: string | null
  title: string
  author: string | null
  publication: string | null
  repositoryId: string | null
  text: string | null
  /** The record's own date (FamilySearch sortKey) — drives chronological sorting. */
  recordDate?: string | null
}

export interface NoteRecord {
  id: string
  gedcomId: string | null
  text: string
}

export interface Citation {
  id: string
  sourceId: string | null
  ownerType: 'person' | 'family'
  ownerId: string
  eventTag: string | null
  page: string | null
  quality: string | null
  note: string | null
}

// ---- Aliases (AKA / linguistic variants) ----

export interface Alias {
  id: string
  personId: string
  givenName: string
  surname: string
  kind: string | null
  note: string | null
}

export type AliasInput = {
  givenName?: string
  surname?: string
  kind?: string | null
  note?: string | null
}

// ---- Occupations (a person may hold several, each time-scoped) ----

export interface Occupation {
  id: string
  personId: string
  title: string
  startDate: string | null
  endDate: string | null
  note: string | null
}

/** A FamilySearch "Collaboration" (Együttműködés) discussion attached to a person.
 *  Read-only — imported from FamilySearch, shown in its own profile section. */
export interface Collaboration {
  id: string
  personId: string
  title: string | null
  /** Details + comments, already flattened to displayable text. */
  body: string
  createdAt: string | null
}

export type OccupationInput = {
  title?: string
  startDate?: string | null
  endDate?: string | null
  note?: string | null
}

// ---- Life events / facts (residence, military, nationality, …) ----

/** Known event types (free-form `type` also allowed for custom entries). */
export type EventType =
  | 'residence'
  | 'divorce'
  | 'military'
  | 'nationality'
  | 'caste'
  | 'title'
  | 'description'
  | 'naturalization'
  | 'cremation'
  | 'education'
  | 'religious'
  | 'other'

export interface EventRecord {
  id: string
  ownerType: 'person' | 'family'
  ownerId: string
  /** One of EventType, or a free-form custom label. */
  type: string
  date: string | null
  /** Optional end date — e.g. residence 'moved out', so a range is clear. */
  endDate: string | null
  place: string | null
  /** The fact's text value (e.g. a description, a nationality). */
  value: string | null
  note: string | null
}

export type EventInput = {
  type?: string
  date?: string | null
  endDate?: string | null
  place?: string | null
  value?: string | null
  note?: string | null
}

// ---- Research logs (incl. negative results) ----

export type ResearchResult = 'negative' | 'positive' | 'inconclusive'

export interface ResearchLog {
  id: string
  /** null = a general (not person-specific) log. */
  personId: string | null
  date: string
  title: string
  repository: string | null
  sourceDesc: string | null
  dateRange: string | null
  result: ResearchResult
  detail: string | null
  createdAt: string
}

export type ResearchLogInput = Partial<Omit<ResearchLog, 'id' | 'createdAt'>>

/** A citation joined with its source + repository, for the Sources tab. */
export interface CitationDetail extends Citation {
  sourceTitle: string
  sourceAuthor: string | null
  sourcePublication: string | null
  /** The source's full text / transcription (sources.text). */
  sourceText: string | null
  repositoryName: string | null
  /** The cited record's date (from FamilySearch), for chronological sorting. */
  recordDate: string | null
}

/**
 * Editable fields of a citation + its underlying source, used to add or edit a
 * source by hand (and to enrich FamilySearch-imported ones — e.g. give a date).
 * All optional: only provided keys are written. Maps onto existing columns, so
 * no schema change is needed.
 */
export interface CitationEdit {
  sourceTitle?: string
  sourceAuthor?: string | null
  sourcePublication?: string | null
  sourceText?: string | null
  recordDate?: string | null
  eventTag?: string | null
  page?: string | null
  quality?: string | null
  note?: string | null
}

// ---- Query builder ----

export type QueryField =
  | 'givenName'
  | 'surname'
  | 'sex'
  | 'birthPlace'
  | 'deathPlace'
  | 'occupation'
  | 'birthYear'
  | 'deathYear'

export type QueryOperator =
  | 'contains'
  | 'notContains'
  | 'equals'
  | 'notEquals'
  | 'startsWith'
  | 'lt'
  | 'gt'
  | 'isEmpty'
  | 'notEmpty'

export interface QueryRule {
  field: QueryField
  operator: QueryOperator
  value: string
}

export interface PersonQuery {
  combinator: 'AND' | 'OR'
  rules: QueryRule[]
}

/** A named, reusable query the user saved (stored as a JSON blob in settings —
 *  no schema change, and it travels with backups). */
export interface SavedQuery {
  id: string
  name: string
  query: PersonQuery
  createdAt: string
}

// ---- Relationship finder (kinship path between two people) ----

export type RelationKind = 'parent' | 'child' | 'spouse'

export interface RelationshipNode {
  id: string
  name: string
  sex: Sex
  lifespan: string
}

export interface RelationshipPath {
  /** Ordered people from the start person to the target. */
  nodes: RelationshipNode[]
  /** relations[i] = how nodes[i+1] relates to nodes[i]. Length = nodes.length - 1. */
  relations: RelationKind[]
}

/** A user-added "famous person" row. The famous-relatives feature was removed,
 *  but the table/repo are kept inert so existing databases and the merge logic
 *  stay valid without a migration. */
export interface CustomFamous {
  id: string
  name: string
  birthYear: number | null
  deathYear: number | null
  occupation: string | null
  url: string | null
}
export type CustomFamousInput = Omit<CustomFamous, 'id'>

// ---- Sanity check (data issues) ----

export type SanitySeverity = 'high' | 'medium'

/** A one-click correction the Issues page can offer for an anomaly. */
export interface SanityFix {
  kind: 'markDeceased'
  personId: string
  personName: string
}

export interface SanityIssue {
  id: string
  rule: string
  severity: SanitySeverity
  detail: string
  people: { id: string; name: string }[]
  /** Stable key (rule + sorted person ids) for dismissing false positives. */
  key?: string
  /** Optional quick-fixes rendered as buttons on the Issues page. */
  fixes?: SanityFix[]
}

// ---- Undoable deletion snapshots ----

/** Everything needed to fully restore a deleted person. */
export interface PersonSnapshot {
  person: Person
  husbandOf: string[]
  wifeOf: string[]
  childOf: { familyId: string; ordinal: number }[]
  documentIds: string[]
  citations: Citation[]
  noteIds: string[]
  /** Families removed because deleting this person left them empty (no spouses,
   *  no children) — kept so undo can recreate them. */
  emptiedFamilies?: Family[]
}

/** A deleted document (the media file is kept on disk so it can be restored). */
export interface DocumentSnapshot {
  document: DocumentRecord
}

export interface BoardMeta {
  id: string
  name: string
  ordinal: number
  createdAt: string
}

// ---- Genealogy Map ----

export interface GeoResult {
  name: string
  lat: number
  lon: number
}

// ---- Atlas (map view) ----

/** Every geolocatable life-event kind the atlas can plot. */
export type AtlasKind =
  | 'birth'
  | 'christening'
  | 'marriage'
  | 'residence'
  | 'death'
  | 'burial'
  | 'other'

/** One plottable life event: a person, a kind, a place with coordinates. */
export interface AtlasPoint {
  kind: AtlasKind
  personId: string
  personName: string
  sex: Sex
  /** 4-digit year when known (for the time filter + chronological sort). */
  year: number | null
  /** Raw date string (finer chronological ordering within a year). */
  date: string | null
  /** Optional range end (residences: moved-out year). */
  endYear: number | null
  place: string
  lat: number
  lon: number
  /** Extra label for 'other' events (the event's type/value). */
  detail: string | null
}

export type MapEventKind = 'birth' | 'death' | 'marriage'

export interface MapEvent {
  kind: MapEventKind
  personId: string
  personName: string
  year: string
}

export interface MapMarker {
  name: string
  lat: number
  lon: number
  events: MapEvent[]
}

/** A historical event near a place in a given era (from Wikidata), for the map's
 *  "what was happening" overlay + side panel. */
export interface HistEvent {
  id: string
  title: string
  date: string | null
  year: number | null
  lat: number
  lon: number
  url: string
}

// ---- Local API server (Settings-toggled, 127.0.0.1-only) ----
export interface ApiServerConfig {
  enabled: boolean
  port: number
  token: string
  allowWrites: boolean
  mcpEnabled: boolean
}
export interface ApiServerStatus {
  running: boolean
  port: number
  error: string | null
}

// ---- Plugins (sandboxed panels that may only talk to the local API) ----

/** What a plugin is allowed to do — enforced per-token by the local API. */
export type PluginScope = 'read' | 'write' | 'documents'

/** One entry the plugin adds under the sidebar "Plugins" section. */
export interface PluginMenuEntry {
  id: string
  /** Display title; either one string or per-language strings. */
  title: string | Partial<Record<AppLanguage, string>>
  /** HTML file (relative to the plugin folder) the panel loads. */
  entry: string
}

/** The manifest.json a plugin ships (validated on install). */
export interface PluginManifest {
  id: string
  name: string
  version: string
  author?: string
  description?: string | Partial<Record<AppLanguage, string>>
  /** Emoji shown in the sidebar/settings (keeps plugins asset-free). */
  icon?: string
  permissions: PluginScope[]
  menu: PluginMenuEntry[]
}

/** An installed plugin as shown in Settings / the sidebar. */
export interface InstalledPlugin extends PluginManifest {
  enabled: boolean
}

/** Everything the sandboxed panel iframe needs to boot one menu entry. */
export interface PluginPanelInfo {
  /** tmplugin:// URL of the entry file. */
  url: string
  /** The plugin's own scoped API token (NOT the user's main token). */
  token: string
  /** http://127.0.0.1:<port> of the local API. */
  apiBase: string
}

export type AppLanguage = 'hu' | 'en' | 'de'

// ---- Printable tree export ----

export type ExportPaper = 'A4' | 'A3' | 'A2' | 'A1' | 'A0'

/** A positioned SVG fragment + its bounding box, so tiling can emit only the
 *  pieces that intersect each sheet (keeps deep trees from exhausting memory). */
export interface TreeExportPiece {
  x: number
  y: number
  w: number
  h: number
  svg: string
}

/**
 * A fully-rendered, print-ready tree handed from the renderer to the main
 * process. The renderer builds vector SVG (cards/wedges already drawn); the main
 * process only wraps it into a single huge page, tiled sheets, or a raw .svg.
 */
export interface TreeExportPayload {
  /** SVG `<defs>` children (shared clip path, fan text-path arcs, …). */
  defs: string
  /** Positioned SVG pieces making up the drawn tree + poster chrome. */
  pieces: TreeExportPiece[]
  /** Content size in CSS pixels (interpreted at 96 dpi → millimetres). */
  width: number
  height: number
  /** Paper/background colour (print-friendly, e.g. `#ffffff`). */
  background: string
  /** `svg` writes the vector file as-is; `pdf` rasterises via Chromium print. */
  format: 'svg' | 'pdf'
  /** `single` = one giant page sized to the content; `tiled` = many sheets. */
  pdfLayout: 'single' | 'tiled'
  /** Sheet size for tiled output. */
  paper: ExportPaper
  orientation: 'portrait' | 'landscape'
  /** Overlap between neighbouring sheets (mm) so pages can be glued. */
  overlapMm: number
  /** Draw corner crop marks + a row·column label on every tile. */
  cropMarks: boolean
  /** Suggested file name (no extension). */
  fileName: string
}

export interface TreeExportResult {
  path: string
  /** Number of PDF pages written (1 for SVG / single page). */
  pages: number
}

/** One published GitHub release, for the full changelog history view. */
export interface ReleaseEntry {
  /** Release tag without a leading "v" (e.g. "1.2.1"). */
  version: string
  /** Release title, if any. */
  name: string | null
  /** Raw markdown body (may contain `<!--lang:xx-->` sections). */
  body: string | null
  /** The release's GitHub page. */
  url: string | null
  /** ISO timestamp the release was published. */
  publishedAt: string | null
  /** True for pre-releases. */
  prerelease: boolean
}

/** Result of checking GitHub for a newer release. */
export interface UpdateInfo {
  /** The running app version (from package.json). */
  current: string
  /** The latest published release tag (without a leading "v"), or null if unknown. */
  latest: string | null
  /** True when `latest` is strictly newer than `current`. */
  hasUpdate: boolean
  /** Release notes (markdown body), if any. */
  notes: string | null
  /** The release's GitHub page. */
  url: string | null
  /** ISO timestamp the release was published. */
  publishedAt: string | null
  /** Direct download URL of the installer asset for the current OS, if present. */
  assetUrl: string | null
}

/** A user feedback submission from the in-app feedback form. */
export interface FeedbackInput {
  /** What kind of feedback: a bug report, an idea/request, or general. */
  category: 'bug' | 'idea' | 'other'
  /** The free-text message (required). */
  message: string
  /** Optional reply address so the developer can follow up. */
  email?: string
  /** The UI language the user is running (for context). */
  locale?: string
  /** Optional 1–5 satisfaction rating (from the welcome prompt). */
  rating?: number
}

/** Outcome of sending feedback to the collection backend. */
export interface FeedbackResult {
  ok: boolean
  /** Short reason when `ok` is false: "not_configured" | "network" | a server message. */
  error?: string
}

/** One recorded change in the audit log (a single row insert/update/delete). */
export interface AuditEntry {
  /** Monotonic sequence number (also the stable id). */
  seq: number
  /** UTC timestamp, "YYYY-MM-DD HH:MM:SS". */
  ts: string
  /** Friendly category: 'person' | 'family' | 'event' | 'occupation' | 'alias' | … */
  entity: string
  /** The underlying table (used by the generic undo). */
  table: string
  /** Primary key (or "a:b" for join tables) of the affected row. */
  entityId: string
  action: 'create' | 'update' | 'delete'
  /** Best-effort human label (a person's name, a document title, …). */
  label: string
  /** The related person id for click-through, when the row is/belongs to a person. */
  personId: string | null
  /** For updates: which columns changed and how. */
  fields: { field: string; from: string | null; to: string | null }[]
  /** Whether this entry has already been reverted. */
  undone: boolean
}

/** What reverting an audit entry would affect — surfaced as a warning. */
export interface AuditImpact {
  /** Later, not-yet-undone edits to the SAME row that an undo would overwrite. */
  laterEdits: number
  /** Rows that would cascade away when undoing a create (i.e. deleting the row). */
  cascadeCount: number
  /** Referenced parents that no longer exist when undoing a delete (re-insert). */
  missingRefs: string[]
}

/** Filter + keyset cursor for paging the audit log at scale. */
export interface AuditFilter {
  /** Free-text match against the entry's label (names, places, titles, …). */
  search?: string
  /** Restrict to one entity category ('person' | 'family' | …); '' = all. */
  entity?: string
  /** Restrict to one action; '' = all. */
  action?: '' | 'create' | 'update' | 'delete'
  /** Keyset cursor: only return entries with seq < this (for "load more"). */
  beforeSeq?: number
  /** Page size (default 100, capped at 500). */
  limit?: number
}

/** One page of audit entries plus the total count for the current filter. */
export interface AuditPage {
  entries: AuditEntry[]
  /** Total matching entries (across all pages) for the active filter. */
  total: number
  /** Whether another page exists after this one. */
  hasMore: boolean
}

/** A likely-duplicate pair surfaced by the scan, with a 0–100 confidence score. */
export interface DuplicateCandidate {
  aId: string
  bId: string
  /** Confidence 0–100 (100 = same external id). */
  score: number
  /** i18n reason keys, e.g. 'name', 'birthYear', 'birthPlace', 'sharedParent'. */
  reasons: string[]
}

/** A set of names — surnames OR given names — that are spelling/accent variants
 *  of one another (e.g. "József" / "Jozsef", "Kovács" / "Kovacs"). */
export interface NameGroup {
  /** The folded key the variants share (internal). */
  key: string
  /** The most common spelling — suggested as the canonical form. */
  suggested: string
  /** Total people across all variants. */
  total: number
  variants: { name: string; count: number }[]
}

/** The survivor's final field values, chosen field-by-field in the merge dialog. */
export interface MergeResolution {
  givenName?: string
  surname?: string
  sex?: Sex
  birthDate?: string | null
  birthPlace?: string | null
  deathDate?: string | null
  deathPlace?: string | null
  deceased?: boolean
  burialDate?: string | null
  burialPlace?: string | null
  christeningDate?: string | null
  christeningPlace?: string | null
  religion?: string | null
  occupation?: string | null
  notes?: string | null
  profilePhotoId?: string | null
}

/** Outcome of a merge: the survivor + the audit entry that can undo it + a tally. */
export interface MergeResult {
  survivorId: string
  /** audit_log seq of the merge entry — undo via `audit.revert(seq)`. */
  auditSeq: number
  moved: {
    families: number
    children: number
    documents: number
    events: number
    citations: number
    other: number
  }
}
