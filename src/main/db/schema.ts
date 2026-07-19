/** SQL DDL for the TreeMonk database. Applied idempotently on startup. */
export const SCHEMA_SQL = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS people (
  id              TEXT PRIMARY KEY,
  gedcom_id       TEXT,
  fs_id           TEXT,
  given_name      TEXT NOT NULL DEFAULT '',
  surname         TEXT NOT NULL DEFAULT '',
  sex             TEXT NOT NULL DEFAULT 'U',
  birth_date      TEXT,
  birth_place     TEXT,
  death_date      TEXT,
  death_place     TEXT,
  deceased        INTEGER NOT NULL DEFAULT 0,
  illegitimate    INTEGER NOT NULL DEFAULT 0,
  verified        INTEGER NOT NULL DEFAULT 0,
  call_name       TEXT,                     -- Rufname (GEDCOM _RUFNAME)
  name_prefix     TEXT,                     -- GEDCOM NPFX ("Dr.", "ifj.")
  name_suffix     TEXT,                     -- GEDCOM NSFX ("Jr.", "III")
  stillborn       INTEGER NOT NULL DEFAULT 0,
  is_private      INTEGER NOT NULL DEFAULT 0,  -- confidential (GEDCOM RESN)
  burial_date     TEXT,
  burial_place    TEXT,
  christening_date  TEXT,
  christening_place TEXT,
  religion        TEXT,
  birth_note      TEXT,
  death_note      TEXT,
  christening_note TEXT,
  burial_note     TEXT,
  occupation      TEXT,
  notes           TEXT,
  profile_photo_id TEXT,
  profile_photo_crop TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS families (
  id              TEXT PRIMARY KEY,
  gedcom_id       TEXT,
  husband_id      TEXT REFERENCES people(id) ON DELETE SET NULL,
  wife_id         TEXT REFERENCES people(id) ON DELETE SET NULL,
  marriage_date   TEXT,
  marriage_place  TEXT,
  marriage_order  INTEGER,                  -- 1st / 2nd / … marriage (user-set)
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS family_children (
  family_id       TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id        TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  ordinal         INTEGER NOT NULL DEFAULT 0,
  relation        TEXT,                     -- NULL = birth; adopted | foster | step (GEDCOM PEDI)
  PRIMARY KEY (family_id, child_id)
);

-- Godparents (keresztszülők): a person has one or more godparents, each another
-- person. A pure many-to-many join (both sides cascade-delete with the person).
CREATE TABLE IF NOT EXISTS godparents (
  person_id       TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  godparent_id    TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  ordinal         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (person_id, godparent_id)
);
CREATE INDEX IF NOT EXISTS idx_godparents_godparent ON godparents(godparent_id);

--- Witnesses (tanúk): christening witnesses attach to a person, marriage
--- witnesses to a family (the union). The witness is always another person.
--- The owner side has no FK (it points at two different tables); cleanup on
--- owner delete happens in the repos.
CREATE TABLE IF NOT EXISTS witnesses (
  owner_type      TEXT NOT NULL CHECK (owner_type IN ('person','family')),
  owner_id        TEXT NOT NULL,
  witness_id      TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  ordinal         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_type, owner_id, witness_id)
);
CREATE INDEX IF NOT EXISTS idx_witnesses_witness ON witnesses(witness_id);

--- Participants of a shared event, each with a free-form role (pap, bába,
--- adományozó…) — Gramps-style shared events. The event's own witnesses stay
--- in the witnesses table; this is for every OTHER kind of participant.
CREATE TABLE IF NOT EXISTS event_participants (
  event_id        TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id       TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role            TEXT,
  ordinal         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_event_participants_person ON event_participants(person_id);

--- Free-form person attributes (GEDCOM FACT/TYPE): height, DNA haplogroup,
--- service number… — anything that isn't a dated life event.
CREATE TABLE IF NOT EXISTS attributes (
  id              TEXT PRIMARY KEY,
  person_id       TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  value           TEXT,
  ordinal         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_attributes_person ON attributes(person_id);

CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL DEFAULT '',
  kind            TEXT NOT NULL DEFAULT 'other',
  file_path       TEXT NOT NULL,
  mime_type       TEXT,
  date            TEXT,
  description     TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS person_documents (
  person_id       TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (person_id, document_id)
);

CREATE TABLE IF NOT EXISTS board_nodes (
  id              TEXT PRIMARY KEY,
  board_id        TEXT NOT NULL DEFAULT 'main',
  kind            TEXT NOT NULL DEFAULT 'note',
  ref_id          TEXT,
  label           TEXT,
  content         TEXT,
  pos_x           REAL NOT NULL DEFAULT 0,
  pos_y           REAL NOT NULL DEFAULT 0,
  width           REAL,
  height          REAL,
  data            TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS board_edges (
  id              TEXT PRIMARY KEY,
  board_id        TEXT NOT NULL DEFAULT 'main',
  source          TEXT NOT NULL,
  target          TEXT NOT NULL,
  label           TEXT,
  data            TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS places (
  name            TEXT PRIMARY KEY,
  lat             REAL NOT NULL,
  lon             REAL NOT NULL,
  place_type      TEXT,                     -- village/town/district/county/country/…
  parent_name     TEXT,                     -- next level up in the place hierarchy
  gov_id          TEXT                      -- GOV id (gov.genealogy.net)
);

-- App settings (key/value) — e.g. default_root_person_id
CREATE TABLE IF NOT EXISTS settings (
  key             TEXT PRIMARY KEY,
  value           TEXT
);

-- Multiple investigation boards (tabbed interface)
CREATE TABLE IF NOT EXISTS boards (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT 'Board',
  ordinal         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

-- Repositories (REPO) — archives/libraries that hold sources
CREATE TABLE IF NOT EXISTS repositories (
  id              TEXT PRIMARY KEY,
  gedcom_id       TEXT,
  name            TEXT NOT NULL DEFAULT '',
  address         TEXT
);

-- Sources (SOUR) — historical documents/records
CREATE TABLE IF NOT EXISTS sources (
  id              TEXT PRIMARY KEY,
  gedcom_id       TEXT,
  title           TEXT NOT NULL DEFAULT '',
  author          TEXT,
  publication     TEXT,
  repository_id   TEXT REFERENCES repositories(id) ON DELETE SET NULL,
  text            TEXT,
  record_date     TEXT          -- the record's own date (FamilySearch sortKey)
);

-- Notes (NOTE) — top-level or inline researcher notes
CREATE TABLE IF NOT EXISTS notes (
  id              TEXT PRIMARY KEY,
  gedcom_id       TEXT,
  text            TEXT NOT NULL DEFAULT ''
);

-- Citations — a source cited from a specific record/event
CREATE TABLE IF NOT EXISTS citations (
  id              TEXT PRIMARY KEY,
  source_id       TEXT REFERENCES sources(id) ON DELETE CASCADE,
  owner_type      TEXT NOT NULL,            -- 'person' | 'family'
  owner_id        TEXT NOT NULL,
  event_tag       TEXT,                     -- BIRT/DEAT/MARR/... or NULL for record-level
  page            TEXT,
  quality         TEXT,
  note            TEXT
);

-- Note attachments (a note linked to person/family/source/citation)
CREATE TABLE IF NOT EXISTS note_links (
  note_id         TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  owner_type      TEXT NOT NULL,            -- 'person' | 'family' | 'source' | 'citation'
  owner_id        TEXT NOT NULL,
  PRIMARY KEY (note_id, owner_type, owner_id)
);

-- Aliases (AKA / linguistic variants) for a person
CREATE TABLE IF NOT EXISTS aliases (
  id              TEXT PRIMARY KEY,
  person_id       TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  given_name      TEXT NOT NULL DEFAULT '',
  surname         TEXT NOT NULL DEFAULT '',
  kind            TEXT,                     -- 'aka' | 'maiden' | 'latin' | 'german' | ...
  note            TEXT
);

-- Occupations — a person can hold several over their life, each time-scoped.
-- Replaces the single people.occupation column (kept, vestigial, for legacy).
CREATE TABLE IF NOT EXISTS occupations (
  id              TEXT PRIMARY KEY,
  person_id       TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT '',
  start_date      TEXT,                     -- free-form, like birth/death dates
  end_date        TEXT,
  note            TEXT,
  ordinal         INTEGER NOT NULL DEFAULT 0 -- manual order for undated entries
);

-- FamilySearch "Collaboration" (Együttműködés) discussions imported per person.
-- Read-only mirror of the FS discussion threads; created via "CREATE TABLE IF
-- NOT EXISTS" so it appears for existing databases on the next launch too.
CREATE TABLE IF NOT EXISTS collaborations (
  id              TEXT PRIMARY KEY,         -- FamilySearch discussion id
  person_id       TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title           TEXT,
  body            TEXT NOT NULL DEFAULT '', -- details + comments, flattened
  created_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_collaborations_person ON collaborations(person_id);

-- Famous-relatives verdicts: the user's manual confirm/reject of a famous match.
CREATE TABLE IF NOT EXISTS famous_verdicts (
  person_id       TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  verdict         TEXT NOT NULL,            -- 'confirmed' | 'rejected'
  famous          TEXT                      -- the matched famous name (reference)
);

-- Anomalies the user marked as false positives (hidden from the data-issues scan).
CREATE TABLE IF NOT EXISTS dismissed_issues (
  key             TEXT PRIMARY KEY          -- stable: rule + sorted person ids
);

-- Duplicate suggestions the user rejected ("not a duplicate") — hidden from scans.
CREATE TABLE IF NOT EXISTS dismissed_merges (
  key             TEXT PRIMARY KEY          -- the two person ids, sorted + joined
);

-- User-added famous people (merged into the Famous-relatives scan).
CREATE TABLE IF NOT EXISTS famous_custom (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  birth_year      INTEGER,
  death_year      INTEGER,
  occupation      TEXT,
  url             TEXT
);

-- Research logs — targeted research sessions incl. NEGATIVE results
CREATE TABLE IF NOT EXISTS research_logs (
  id              TEXT PRIMARY KEY,
  person_id       TEXT REFERENCES people(id) ON DELETE CASCADE,  -- nullable: general log
  date            TEXT NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  repository      TEXT,                     -- archive / parish searched
  source_desc     TEXT,                     -- what was searched
  date_range      TEXT,                     -- e.g. '1840-1845'
  result          TEXT NOT NULL DEFAULT 'negative',  -- 'negative' | 'positive' | 'inconclusive'
  detail          TEXT,
  created_at      TEXT NOT NULL
);

-- To-do items (tasks): free-standing research/admin to-dos, each optionally
-- linked to one or more people (shown on their profile). Additive tables →
-- existing DBs gain them on the next launch (CREATE TABLE IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS todos (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  note        TEXT,
  done        INTEGER NOT NULL DEFAULT 0,
  priority    TEXT NOT NULL DEFAULT 'normal',  -- 'low' | 'normal' | 'high'
  due_date    TEXT,                             -- free-form, like other dates
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS todo_people (
  todo_id     TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  person_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_todo_people_person ON todo_people(person_id);

-- Life events / facts beyond the fixed vitals — residences (one person can have
-- many), military service, nationality, caste, title, naturalization, etc. A
-- generic store so "import everything" never needs a column per fact type.
CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  owner_type      TEXT NOT NULL DEFAULT 'person',  -- 'person' | 'family'
  owner_id        TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'other',    -- 'residence' | 'military' | 'nationality' | …
  date            TEXT,                             -- free-form, like birth/death dates
  end_date        TEXT,                             -- optional range end (e.g. residence moved-out)
  place           TEXT,
  value           TEXT,                             -- the fact's text value (e.g. "Farmer", description)
  note            TEXT,
  fs_key          TEXT,                             -- dedup key for non-destructive re-import
  ordinal         INTEGER NOT NULL DEFAULT 0
);

-- Local copy of the support-chat conversation with the developer. Mirrors the
-- self-hosted server, but kept locally (local-first) so the history survives and
-- shows instantly/offline.
CREATE TABLE IF NOT EXISTS support_messages (
  id          TEXT PRIMARY KEY,
  sender      TEXT NOT NULL,                  -- 'user' | 'admin'
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_support_messages_at ON support_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_aliases_person ON aliases(person_id);
CREATE INDEX IF NOT EXISTS idx_occupations_person ON occupations(person_id);
CREATE INDEX IF NOT EXISTS idx_events_owner ON events(owner_type, owner_id);
-- Import matching: stable-id and parent-pair lookups stay O(log n) at scale.
CREATE INDEX IF NOT EXISTS idx_people_fs_id ON people(fs_id);
CREATE INDEX IF NOT EXISTS idx_people_gedcom_id ON people(gedcom_id);
CREATE INDEX IF NOT EXISTS idx_families_parents ON families(husband_id, wife_id);
CREATE INDEX IF NOT EXISTS idx_families_gedcom_id ON families(gedcom_id);
CREATE INDEX IF NOT EXISTS idx_research_logs_person ON research_logs(person_id);
CREATE INDEX IF NOT EXISTS idx_people_surname ON people(surname);
CREATE INDEX IF NOT EXISTS idx_family_children_child ON family_children(child_id);
CREATE INDEX IF NOT EXISTS idx_person_documents_person ON person_documents(person_id);
CREATE INDEX IF NOT EXISTS idx_board_nodes_board ON board_nodes(board_id);
CREATE INDEX IF NOT EXISTS idx_board_edges_board ON board_edges(board_id);
CREATE INDEX IF NOT EXISTS idx_citations_owner ON citations(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_note_links_owner ON note_links(owner_type, owner_id);
`
