import type { IncomingMessage, ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { app, nativeImage } from 'electron'
import {
  Aliases,
  Citations,
  Collaborations,
  Documents,
  Events,
  Families,
  Godparents,
  Notes,
  Occupations,
  People,
  ResearchLogs
} from '../db/repo'
import { resolveMediaPath } from '../db/connection'
import { buildAtlasPoints } from '../db/atlasData'
import type { Person } from '@shared/types'

/**
 * TreeMonk as an MCP server — connect Claude (or any MCP client) to the
 * family tree at http://127.0.0.1:<port>/mcp with the Settings Bearer token.
 *
 * Stateless Streamable-HTTP: each request gets a fresh server+transport pair
 * (the documented pattern), so there is no session bookkeeping to leak. Write
 * tools are only registered when the Settings "allow writes" toggle is on.
 */

function fullName(p: Person): string {
  return `${p.givenName} ${p.surname}`.trim() || '—'
}

function personSummary(p: Person): Record<string, unknown> {
  return {
    id: p.id,
    name: fullName(p),
    sex: p.sex,
    birth: [p.birthDate, p.birthPlace].filter(Boolean).join(' · ') || null,
    death: [p.deathDate, p.deathPlace].filter(Boolean).join(' · ') || null
  }
}

function text(data: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function buildServer(allowWrites: boolean, onWrite: () => void): McpServer {
  const server = new McpServer(
    { name: 'treemonk', version: app.getVersion() },
    {
      instructions:
        'TreeMonk is a local-first genealogy workbench. These tools read (and, if enabled, edit) ' +
        'the user’s own family-tree database on this machine. Person and family ids are opaque ' +
        'strings returned by the search/list tools — always look ids up first, never invent them.'
    }
  )

  server.tool(
    'search_people',
    'Search people by name (accent-insensitive substring). Returns id, name, birth and death info.',
    { query: z.string().describe('Name or name fragment'), limit: z.number().int().min(1).max(100).default(20) },
    async ({ query, limit }) => {
      const q = query.trim().toLowerCase()
      const hits = People.list()
        .filter((p) => `${p.givenName} ${p.surname} ${p.surname} ${p.givenName}`.toLowerCase().includes(q))
        .slice(0, limit)
        .map(personSummary)
      return text({ total: hits.length, people: hits })
    }
  )

  server.tool(
    'get_person',
    'Full record of one person: every stored field plus life events (residences, occupations…).',
    { id: z.string().describe('Person id from search_people') },
    async ({ id }) => {
      const p = People.get(id)
      if (!p) return text({ error: 'Person not found' })
      return text({ person: p, events: Events.forOwner('person', id) })
    }
  )

  server.tool(
    'get_relations',
    'Relationships of a person: parents, siblings, spouses (with marriage data) and children.',
    { id: z.string() },
    async ({ id }) => {
      const p = People.get(id)
      if (!p) return text({ error: 'Person not found' })
      const families = Families.list()
      const byId = new Map(People.list().map((x) => [x.id, x]))
      const name = (pid: string | null): unknown => (pid && byId.get(pid) ? personSummary(byId.get(pid)!) : null)
      const asChild = families.find((f) => f.childIds.includes(id))
      const unions = families
        .filter((f) => f.husbandId === id || f.wifeId === id)
        .map((f) => ({
          familyId: f.id,
          spouse: name(f.husbandId === id ? f.wifeId : f.husbandId),
          marriage: [f.marriageDate, f.marriagePlace].filter(Boolean).join(' · ') || null,
          marriageOrder: f.marriageOrder,
          children: f.childIds.map((c) => name(c)).filter(Boolean)
        }))
      return text({
        person: personSummary(p),
        father: asChild ? name(asChild.husbandId) : null,
        mother: asChild ? name(asChild.wifeId) : null,
        siblings: asChild ? asChild.childIds.filter((c) => c !== id).map((c) => name(c)).filter(Boolean) : [],
        unions
      })
    }
  )

  server.tool(
    'get_ancestors',
    'Ancestor chain of a person up to N generations (parents, grandparents, …).',
    { id: z.string(), generations: z.number().int().min(1).max(10).default(4) },
    async ({ id, generations }) => {
      const families = Families.list()
      const byId = new Map(People.list().map((x) => [x.id, x]))
      const childFamily = new Map<string, (typeof families)[number]>()
      for (const f of families) for (const c of f.childIds) if (!childFamily.has(c)) childFamily.set(c, f)
      type Node = { person: unknown; father?: Node | null; mother?: Node | null }
      const walk = (pid: string | null, depth: number): Node | null => {
        if (!pid) return null
        const p = byId.get(pid)
        if (!p) return null
        const node: Node = { person: personSummary(p) }
        if (depth < generations) {
          const f = childFamily.get(pid)
          node.father = f ? walk(f.husbandId, depth + 1) : null
          node.mother = f ? walk(f.wifeId, depth + 1) : null
        }
        return node
      }
      const root = walk(id, 0)
      return text(root ?? { error: 'Person not found' })
    }
  )

  server.tool(
    'get_timeline',
    'Chronological, geocoded life journey of a person (birth, residences, marriages, death…).',
    { id: z.string() },
    async ({ id }) => {
      const pts = buildAtlasPoints()
        .filter((p) => p.personId === id)
        .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
        .map((p) => ({ kind: p.kind, year: p.year, endYear: p.endYear, place: p.place, detail: p.detail }))
      return text({ stops: pts })
    }
  )

  server.tool(
    'list_documents',
    'Documents (photos, certificates, records) attached to a person — id, title, kind, date, mime type.',
    { person_id: z.string() },
    async ({ person_id }) => {
      if (!People.get(person_id)) return text({ error: 'Person not found' })
      const docs = Documents.listForPerson(person_id).map((d) => ({
        id: d.id,
        title: d.title,
        kind: d.kind,
        date: d.date,
        description: d.description,
        mimeType: d.mimeType,
        isImage: /^image\//.test(d.mimeType ?? '') || /\.(jpe?g|png|webp|gif)$/i.test(d.filePath),
        storedLocally: !/^https?:\/\//i.test(d.filePath)
      }))
      return text({ total: docs.length, documents: docs })
    }
  )

  server.tool(
    'get_sources',
    'Every SOURCE of a person: citations (source title/author/publication/text, event tag, page, ' +
      'quality) plus attached document metadata — the full evidence base for their facts.',
    { person_id: z.string() },
    async ({ person_id }) => {
      if (!People.get(person_id)) return text({ error: 'Person not found' })
      return text({
        citations: Citations.forOwner('person', person_id),
        documents: Documents.listForPerson(person_id).map((d) => ({
          id: d.id,
          title: d.title,
          kind: d.kind,
          date: d.date,
          mimeType: d.mimeType
        }))
      })
    }
  )

  server.tool(
    'get_profile_extras',
    'Everything else on a profile: occupations, name variants (aliases), godparents/godchildren, ' +
      'free-text notes, research log entries and FamilySearch collaboration discussions.',
    { person_id: z.string() },
    async ({ person_id }) => {
      const p = People.get(person_id)
      if (!p) return text({ error: 'Person not found' })
      const name = (pid: string): string => {
        const x = People.get(pid)
        return x ? `${x.givenName} ${x.surname}`.trim() : pid
      }
      return text({
        occupations: Occupations.forPerson(person_id),
        aliases: Aliases.forPerson(person_id),
        godparents: Godparents.forPerson(person_id).map((id) => ({ id, name: name(id) })),
        godchildren: Godparents.godchildrenOf(person_id).map((id) => ({ id, name: name(id) })),
        notes: Notes.forOwner('person', person_id),
        researchLogs: ResearchLogs.forPerson(person_id),
        collaborations: Collaborations.forPerson(person_id)
      })
    }
  )

  server.tool(
    'get_document_image',
    'Fetch an attached document IMAGE (photo, scanned certificate…) so you can actually read it. ' +
      'Large scans are downscaled automatically. Use list_documents first to find the id.',
    { document_id: z.string() },
    async ({ document_id }) => {
      const doc = Documents.get(document_id)
      if (!doc) return text({ error: 'Document not found' })
      if (/^https?:\/\//i.test(doc.filePath))
        return text({ error: 'File not downloaded locally yet — open it in TreeMonk once first' })
      const filePath = resolveMediaPath(doc.filePath)
      if (!existsSync(filePath)) return text({ error: 'File missing on disk' })
      const ext = extname(filePath).toLowerCase()
      const mime =
        doc.mimeType ||
        ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' } as Record<string, string>)[ext] ||
        ''
      if (!/^image\//.test(mime))
        return text({ error: `Not an image (${mime || ext || 'unknown type'}) — open it in TreeMonk instead` })

      const meta = { id: doc.id, title: doc.title, kind: doc.kind, date: doc.date, description: doc.description }
      // PNG/JPEG: decode + downscale via nativeImage (vision reads ~1500px scans
      // perfectly, and it keeps the payload small). Other formats: send as-is
      // when reasonably sized.
      const img = nativeImage.createFromPath(filePath)
      if (!img.isEmpty()) {
        const { width } = img.getSize()
        const resized = width > 1600 ? img.resize({ width: 1600 }) : img
        return {
          content: [
            { type: 'image' as const, data: resized.toJPEG(85).toString('base64'), mimeType: 'image/jpeg' },
            { type: 'text' as const, text: JSON.stringify(meta) }
          ]
        }
      }
      const buf = readFileSync(filePath)
      if (buf.length > 3 * 1024 * 1024)
        return text({ error: 'Image format not resizable and file too large (>3 MB) — open it in TreeMonk' })
      return {
        content: [
          { type: 'image' as const, data: buf.toString('base64'), mimeType: mime },
          { type: 'text' as const, text: JSON.stringify(meta) }
        ]
      }
    }
  )

  server.tool('get_statistics', 'Overall tree statistics (counts, year range).', {}, async () => {
    const people = People.list()
    let earliest: number | null = null
    let latest: number | null = null
    let missingBirth = 0
    for (const p of people) {
      const y = Number((p.birthDate ?? '').match(/\d{4}/)?.[0])
      if (y) {
        if (earliest === null || y < earliest) earliest = y
        if (latest === null || y > latest) latest = y
      } else missingBirth++
    }
    return text({
      people: people.length,
      families: Families.list().length,
      earliestBirthYear: earliest,
      latestBirthYear: latest,
      peopleMissingBirthDate: missingBirth
    })
  })

  if (allowWrites) {
    server.tool(
      'create_person',
      'Create a new person. Returns the created record (use its id for linking).',
      {
        given_name: z.string(),
        surname: z.string(),
        sex: z.enum(['M', 'F', 'U']).default('U'),
        birth_date: z.string().optional().describe('ISO-ish, e.g. 1885-03-07 or 1885'),
        birth_place: z.string().optional(),
        death_date: z.string().optional(),
        notes: z.string().optional()
      },
      async (a) => {
        const p = People.create({
          givenName: a.given_name,
          surname: a.surname,
          sex: a.sex,
          birthDate: a.birth_date ?? null,
          birthPlace: a.birth_place ?? null,
          deathDate: a.death_date ?? null,
          notes: a.notes ?? null
        })
        onWrite()
        return text(p)
      }
    )

    server.tool(
      'update_person',
      'Update fields of an existing person (only the provided fields change).',
      {
        id: z.string(),
        given_name: z.string().optional(),
        surname: z.string().optional(),
        sex: z.enum(['M', 'F', 'U']).optional(),
        birth_date: z.string().optional(),
        birth_place: z.string().optional(),
        death_date: z.string().optional(),
        death_place: z.string().optional(),
        notes: z.string().optional()
      },
      async (a) => {
        if (!People.get(a.id)) return text({ error: 'Person not found' })
        const p = People.update(a.id, {
          ...(a.given_name !== undefined ? { givenName: a.given_name } : {}),
          ...(a.surname !== undefined ? { surname: a.surname } : {}),
          ...(a.sex !== undefined ? { sex: a.sex } : {}),
          ...(a.birth_date !== undefined ? { birthDate: a.birth_date } : {}),
          ...(a.birth_place !== undefined ? { birthPlace: a.birth_place } : {}),
          ...(a.death_date !== undefined ? { deathDate: a.death_date } : {}),
          ...(a.death_place !== undefined ? { deathPlace: a.death_place } : {}),
          ...(a.notes !== undefined ? { notes: a.notes } : {})
        })
        onWrite()
        return text(p)
      }
    )

    server.tool(
      'add_life_event',
      'Attach a life event (residence, military, education…) to a person.',
      {
        person_id: z.string(),
        type: z.string().describe('e.g. residence, military, education, other'),
        date: z.string().optional(),
        end_date: z.string().optional(),
        place: z.string().optional(),
        value: z.string().optional().describe('Free-text value/description')
      },
      async (a) => {
        if (!People.get(a.person_id)) return text({ error: 'Person not found' })
        const ev = Events.create('person', a.person_id, {
          type: a.type,
          date: a.date ?? null,
          endDate: a.end_date ?? null,
          place: a.place ?? null,
          value: a.value ?? null,
          note: null
        })
        onWrite()
        return text(ev)
      }
    )

    server.tool(
      'create_family',
      'Create a family (couple) — optionally with marriage data and children.',
      {
        husband_id: z.string().optional(),
        wife_id: z.string().optional(),
        marriage_date: z.string().optional(),
        marriage_place: z.string().optional(),
        child_ids: z.array(z.string()).optional()
      },
      async (a) => {
        const f = Families.create({
          husbandId: a.husband_id ?? null,
          wifeId: a.wife_id ?? null,
          marriageDate: a.marriage_date ?? null,
          marriagePlace: a.marriage_place ?? null,
          childIds: a.child_ids ?? []
        })
        onWrite()
        return text(f)
      }
    )

    server.tool(
      'add_child_to_family',
      'Add an existing person as a child of an existing family.',
      { family_id: z.string(), child_id: z.string() },
      async (a) => {
        const f = Families.get(a.family_id)
        if (!f) return text({ error: 'Family not found' })
        if (!People.get(a.child_id)) return text({ error: 'Child person not found' })
        const updated = Families.update(a.family_id, { childIds: [...f.childIds, a.child_id] })
        onWrite()
        return text(updated)
      }
    )
  }

  return server
}

/** One stateless request-response cycle (fresh server + transport each time). */
export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  allowWrites: boolean,
  onWrite: () => void
): Promise<void> {
  const server = buildServer(allowWrites, onWrite)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  })
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res)
}
