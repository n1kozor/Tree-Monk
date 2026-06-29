import { create } from 'zustand'
import dagre from '@dagrejs/dagre'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange
} from '@xyflow/react'
import type { BoardEdge, BoardMeta, BoardNode, BoardNodeKind, EdgeCertainty } from '@shared/types'
import type { InvestigationPlan } from '@/lib/boardWizard'

const BOARD_KEY = 'treemonk.currentBoard'
let activeBoardId = localStorage.getItem(BOARD_KEY) || 'main'

export interface BoardNodeData extends Record<string, unknown> {
  kind: BoardNodeKind
  refId: string | null
  label: string | null
  content: string | null
  color?: string
  /** Explicit width when the user has resized the node (or zone width). */
  width?: number
  /** Explicit height (zones, resized evidence). */
  height?: number
  /** For document/evidence nodes: MIME + extension. */
  mime?: string
  ext?: string
  /** Id of the Investigation Zone this node belongs to (membership persists). */
  parentZoneId?: string | null
}

export type BoardMode = 'flat' | 'corkboard'

const MODE_KEY = 'treemonk.boardMode'

interface BoardStore {
  nodes: Node<BoardNodeData>[]
  edges: Edge[]
  boardMode: BoardMode
  loaded: boolean

  boards: BoardMeta[]
  currentBoardId: string
  connecting: boolean
  editingNodeId: string | null
  /** Spotlight focus — when set, unconnected nodes/edges dim. */
  spotlightId: string | null

  setBoardMode: (m: BoardMode) => void
  setConnecting: (v: boolean) => void
  requestEdit: (id: string | null) => void
  setSpotlight: (id: string | null) => void

  load: () => Promise<void>
  loadBoards: () => Promise<void>
  switchBoard: (id: string) => Promise<void>
  createBoard: (name: string) => Promise<void>
  renameBoard: (id: string, name: string) => Promise<void>
  removeBoard: (id: string) => Promise<void>
  duplicateBoard: (id: string, name: string) => Promise<void>
  magicOrganize: () => void

  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (conn: Connection) => void
  updateNodeData: (id: string, patch: Partial<BoardNodeData>) => void
  persistNode: (id: string) => void

  setEdgeColor: (id: string, color: string | null) => void
  setEdgeCertainty: (id: string, certainty: EdgeCertainty) => void
  setEdgeLabel: (id: string, label: string | null) => void
  removeEdge: (id: string) => void

  addNote: (position: { x: number; y: number }) => void
  addPerson: (position: { x: number; y: number }, person?: { id: string; label: string }) => void
  addMystery: (position: { x: number; y: number }) => void
  addZone: (position: { x: number; y: number }) => void
  addLink: (position: { x: number; y: number }) => void
  /** Drop a paper-style map snippet pinned to a geocoded place. */
  addMap: (position: { x: number; y: number }, place: { label: string; lat: number; lng: number }) => void
  addDocuments: (position: { x: number; y: number }) => Promise<void>
  addDroppedFiles: (paths: string[], position: { x: number; y: number }) => Promise<void>
  addPastedImage: (dataUrl: string, position: { x: number; y: number }) => Promise<void>
  removeNode: (id: string) => void
  /** Wizard: drop a whole investigation cluster (zone + mystery + clues + threads). */
  assembleInvestigation: (plan: InvestigationPlan, center: { x: number; y: number }) => string[]
}

const newId = (prefix: string): string =>
  `${prefix}_${Math.floor(performance.now() * 1000)}_${Math.round(performance.now() % 997)}`

// Stacking: zones (paper) sit BELOW the string edges (zIndex 1), and all other
// nodes sit above the strings. So threads are always visible over a zone.
const Z_ZONE = 0
const Z_NODE = 2
const Z_EDGE = 1

function toRfNode(n: BoardNode): Node<BoardNodeData> {
  const data: BoardNodeData = {
    kind: n.kind,
    refId: n.refId,
    label: n.label,
    content: n.content,
    color: (n.data?.color as string) ?? undefined,
    width: (n.data?.width as number) ?? (n.width ?? undefined),
    height: (n.data?.height as number) ?? (n.height ?? undefined),
    mime: (n.data?.mime as string) ?? undefined,
    ext: (n.data?.ext as string) ?? undefined,
    parentZoneId: (n.data?.parentZoneId as string) ?? null
  }
  const node: Node<BoardNodeData> = {
    id: n.id,
    type: n.kind,
    position: { x: n.posX, y: n.posY },
    data,
    zIndex: n.kind === 'zone' ? Z_ZONE : Z_NODE
  }
  if (n.kind === 'zone') node.style = { width: data.width ?? 360, height: data.height ?? 240 }
  return node
}

function toBoardNode(n: Node<BoardNodeData>): BoardNode {
  const data: Record<string, unknown> = {}
  if (n.data.color) data.color = n.data.color
  if (n.data.width) data.width = n.data.width
  if (n.data.height) data.height = n.data.height
  if (n.data.mime) data.mime = n.data.mime
  if (n.data.ext) data.ext = n.data.ext
  if (n.data.parentZoneId) data.parentZoneId = n.data.parentZoneId
  return {
    id: n.id,
    boardId: activeBoardId,
    kind: n.data.kind,
    refId: n.data.refId,
    label: n.data.label,
    content: n.data.content,
    posX: n.position.x,
    posY: n.position.y,
    width: (n.data.width as number) ?? (n.measured?.width as number) ?? null,
    height: (n.data.height as number) ?? (n.measured?.height as number) ?? null,
    data
  }
}

function extOf(filePath: string): string {
  const m = filePath.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

/** Build an evidence (image) or document node from an imported record. */
function fileNode(
  d: { id: string; title: string; mimeType: string | null; filePath: string },
  position: { x: number; y: number }
): Node<BoardNodeData> {
  const mime = d.mimeType ?? 'application/octet-stream'
  const isImage = mime.startsWith('image/')
  const kind: BoardNodeKind = isImage ? 'evidence' : 'document'
  return {
    id: newId(isImage ? 'evi' : 'doc'),
    type: kind,
    position,
    zIndex: Z_NODE,
    data: {
      kind,
      refId: d.id,
      label: d.title,
      content: null,
      mime,
      ext: extOf(d.filePath),
      width: isImage ? 220 : 176
    }
  }
}

function toRfEdge(e: BoardEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: (e.data?.sourceHandle as string) ?? undefined,
    targetHandle: (e.data?.targetHandle as string) ?? undefined,
    label: e.label ?? undefined,
    type: 'smoothstep',
    zIndex: Z_EDGE,
    style: e.data?.color ? { stroke: e.data.color as string } : undefined,
    data: {
      certainty: (e.data?.certainty as EdgeCertainty) ?? 'verified',
      color: (e.data?.color as string) ?? undefined
    }
  }
}

function toBoardEdge(e: Edge): BoardEdge {
  return {
    id: e.id,
    boardId: activeBoardId,
    source: e.source,
    target: e.target,
    label: typeof e.label === 'string' ? e.label : null,
    data: {
      certainty: (e.data?.certainty as EdgeCertainty) ?? 'verified',
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      color: (e.data?.color as string) ?? null
    }
  }
}

// ---- Zone grouping helpers (containment by node centre) ----
interface Rect {
  x: number
  y: number
  w: number
  h: number
}
function zoneRect(z: Node<BoardNodeData>): Rect {
  return { x: z.position.x, y: z.position.y, w: z.data.width ?? 360, h: z.data.height ?? 240 }
}
function centerInside(n: Node<BoardNodeData>, r: Rect): boolean {
  const w = (n.measured?.width as number) ?? n.data.width ?? 200
  const h = (n.measured?.height as number) ?? 120
  const cx = n.position.x + w / 2
  const cy = n.position.y + h / 2
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  nodes: [],
  edges: [],
  boardMode: ((): BoardMode => {
    const m = localStorage.getItem(MODE_KEY)
    return m === 'flat' ? 'flat' : 'corkboard'
  })(),
  loaded: false,
  boards: [],
  currentBoardId: activeBoardId,
  connecting: false,
  editingNodeId: null,
  spotlightId: null,

  setBoardMode: (boardMode) => {
    localStorage.setItem(MODE_KEY, boardMode)
    set({ boardMode })
  },
  setConnecting: (connecting) => set({ connecting }),
  requestEdit: (editingNodeId) => set({ editingNodeId }),
  setSpotlight: (spotlightId) => set({ spotlightId }),

  load: async () => {
    const state = await window.api.board.get(activeBoardId)
    set({
      nodes: state.nodes.map(toRfNode),
      edges: state.edges.map(toRfEdge),
      spotlightId: null,
      loaded: true
    })
  },

  loadBoards: async () => {
    const boards = await window.api.boards.list()
    if (!boards.some((b) => b.id === activeBoardId)) {
      activeBoardId = boards[0]?.id ?? 'main'
      localStorage.setItem(BOARD_KEY, activeBoardId)
    }
    set({ boards, currentBoardId: activeBoardId })
    await get().load()
  },

  switchBoard: async (id) => {
    activeBoardId = id
    localStorage.setItem(BOARD_KEY, id)
    set({ currentBoardId: id, loaded: false, spotlightId: null })
    await get().load()
  },

  createBoard: async (name) => {
    const board = await window.api.boards.create(name)
    set({ boards: [...get().boards, board] })
    await get().switchBoard(board.id)
  },

  renameBoard: async (id, name) => {
    await window.api.boards.rename(id, name)
    set({ boards: get().boards.map((b) => (b.id === id ? { ...b, name } : b)) })
  },

  removeBoard: async (id) => {
    await window.api.boards.remove(id)
    const boards = get().boards.filter((b) => b.id !== id)
    set({ boards })
    if (get().currentBoardId === id) await get().switchBoard(boards[0]?.id ?? 'main')
  },

  duplicateBoard: async (id, name) => {
    const board = await window.api.boards.duplicate(id, name)
    set({ boards: [...get().boards, board] })
    await get().switchBoard(board.id)
  },

  /** "Magic Organize" — dagre hierarchical layout, animated into place. Zones stay put. */
  magicOrganize: () => {
    // Leave zones AND anything already filed inside a zone untouched.
    const nodes = get().nodes.filter((n) => n.data.kind !== 'zone' && !n.data.parentZoneId)
    if (!nodes.length) return
    const dim = (n: Node<BoardNodeData>): { w: number; h: number } => ({
      w: (n.measured?.width as number) ?? n.data.width ?? 220,
      h: (n.measured?.height as number) ?? 110
    })
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 70, ranksep: 110, marginx: 40, marginy: 40 })
    g.setDefaultEdgeLabel(() => ({}))
    for (const n of nodes) {
      const { w, h } = dim(n)
      g.setNode(n.id, { width: w, height: h })
    }
    for (const e of get().edges) if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target)
    dagre.layout(g)

    const targets = new Map(
      nodes.map((n) => {
        const p = g.node(n.id)
        const { w, h } = dim(n)
        return [n.id, { x: p.x - w / 2, y: p.y - h / 2 }]
      })
    )
    const starts = new Map(get().nodes.map((n) => [n.id, { ...n.position }]))
    const t0 = performance.now()
    const dur = 680
    const tick = (): void => {
      const t = Math.min(1, (performance.now() - t0) / dur)
      const e = 1 - Math.pow(1 - t, 3)
      set({
        nodes: get().nodes.map((n) => {
          const s = starts.get(n.id)
          const tg = targets.get(n.id)
          if (!s || !tg) return n
          return { ...n, position: { x: s.x + (tg.x - s.x) * e, y: s.y + (tg.y - s.y) * e } }
        })
      })
      if (t < 1) requestAnimationFrame(tick)
      else nodes.forEach((n) => get().persistNode(n.id))
    }
    requestAnimationFrame(tick)
  },

  onNodesChange: (changes) => {
    const prev = get().nodes
    let next = applyNodeChanges(changes, prev) as Node<BoardNodeData>[]

    // Dragging a zone drags its members (membership is persistent, not transient).
    for (const c of changes) {
      if (c.type !== 'position' || !c.position) continue
      const zone = prev.find((n) => n.id === c.id)
      if (!zone || zone.data.kind !== 'zone') continue
      const dx = c.position.x - zone.position.x
      const dy = c.position.y - zone.position.y
      if (!dx && !dy) continue
      next = next.map((n) =>
        n.id !== zone.id && n.data.parentZoneId === zone.id
          ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
          : n
      )
    }
    set({ nodes: next })

    for (const c of changes) {
      if (c.type === 'position' && c.dragging === false) {
        const node = get().nodes.find((n) => n.id === c.id)
        if (node?.data.kind === 'zone') {
          get().persistNode(node.id)
          get().nodes.forEach((n) => {
            if (n.data.parentZoneId === node.id) get().persistNode(n.id)
          })
        } else if (node) {
          // (Re)assign zone membership from where the node was dropped, so it
          // stays put inside that zone afterwards (incl. through Magic Organize).
          const host = get()
            .nodes.filter((n) => n.data.kind === 'zone')
            .find((z) => centerInside(node, zoneRect(z)))
          const newParent = host?.id ?? null
          if (newParent !== (node.data.parentZoneId ?? null)) {
            get().updateNodeData(node.id, { parentZoneId: newParent })
          }
          get().persistNode(node.id)
        }
      }
      if (c.type === 'remove') window.api.board.removeNode(c.id)
    }
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) })
    for (const c of changes) if (c.type === 'remove') window.api.board.removeEdge(c.id)
  },

  onConnect: (conn) => {
    const id = newId('edge')
    const edge: Edge = {
      id,
      source: conn.source!,
      target: conn.target!,
      sourceHandle: conn.sourceHandle ?? undefined,
      targetHandle: conn.targetHandle ?? undefined,
      type: 'smoothstep',
      zIndex: Z_EDGE,
      data: { certainty: 'verified' as EdgeCertainty }
    }
    set({ edges: addEdge(edge, get().edges) })
    window.api.board.saveEdge(toBoardEdge(edge))
  },

  updateNodeData: (id, patch) => {
    set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) })
  },

  persistNode: (id) => {
    const node = get().nodes.find((n) => n.id === id)
    if (node) window.api.board.saveNode(toBoardNode(node))
  },

  setEdgeColor: (id, color) => {
    const edges = get().edges.map((e) =>
      e.id === id
        ? {
            ...e,
            style: color ? { ...e.style, stroke: color } : { ...e.style, stroke: undefined },
            data: { ...e.data, color: color ?? undefined }
          }
        : e
    )
    set({ edges })
    const edge = edges.find((e) => e.id === id)
    if (edge) window.api.board.saveEdge(toBoardEdge(edge))
  },

  setEdgeCertainty: (id, certainty) => {
    const edges = get().edges.map((e) => (e.id === id ? { ...e, data: { ...e.data, certainty } } : e))
    set({ edges })
    const edge = edges.find((e) => e.id === id)
    if (edge) window.api.board.saveEdge(toBoardEdge(edge))
  },

  setEdgeLabel: (id, label) => {
    const edges = get().edges.map((e) => (e.id === id ? { ...e, label: label ?? undefined } : e))
    set({ edges })
    const edge = edges.find((e) => e.id === id)
    if (edge) window.api.board.saveEdge(toBoardEdge(edge))
  },

  removeEdge: (id) => {
    set({ edges: get().edges.filter((e) => e.id !== id) })
    window.api.board.removeEdge(id)
  },

  addNote: (position) => {
    const node: Node<BoardNodeData> = {
      id: newId('note'),
      type: 'note',
      position,
      zIndex: Z_NODE,
      data: { kind: 'note', refId: null, label: null, content: '' }
    }
    set({ nodes: [...get().nodes, node] })
    window.api.board.saveNode(toBoardNode(node))
  },

  addPerson: (position, person) => {
    const node: Node<BoardNodeData> = {
      id: newId('person'),
      type: 'person',
      position,
      zIndex: Z_NODE,
      data: {
        kind: 'person',
        refId: person?.id ?? null,
        label: person?.label ?? 'New person',
        content: null
      }
    }
    set({ nodes: [...get().nodes, node] })
    window.api.board.saveNode(toBoardNode(node))
  },

  addMystery: (position) => {
    const node: Node<BoardNodeData> = {
      id: newId('myst'),
      type: 'mystery',
      position,
      zIndex: Z_NODE,
      data: { kind: 'mystery', refId: null, label: 'Unknown', content: null }
    }
    set({ nodes: [...get().nodes, node] })
    window.api.board.saveNode(toBoardNode(node))
  },

  addLink: (position) => {
    // label = title, content = the URL.
    const node: Node<BoardNodeData> = {
      id: newId('link'),
      type: 'link',
      position,
      zIndex: Z_NODE,
      data: { kind: 'link', refId: null, label: '', content: '' }
    }
    set({ nodes: [...get().nodes, node] })
    window.api.board.saveNode(toBoardNode(node))
  },

  addMap: (position, place) => {
    // label = place name, content = "lat,lng" (parsed by MapNode).
    const node: Node<BoardNodeData> = {
      id: newId('map'),
      type: 'map',
      position,
      zIndex: Z_NODE,
      data: {
        kind: 'map',
        refId: null,
        label: place.label,
        content: `${place.lat},${place.lng}`,
        width: 260,
        height: 200
      }
    }
    set({ nodes: [...get().nodes, node] })
    window.api.board.saveNode(toBoardNode(node))
  },

  addZone: (position) => {
    const node: Node<BoardNodeData> = {
      id: newId('zone'),
      type: 'zone',
      position,
      zIndex: Z_ZONE,
      style: { width: 360, height: 240 },
      data: { kind: 'zone', refId: null, label: 'Investigation Zone', content: null, color: '#6366f1', width: 360, height: 240 }
    }
    // Prepend so it renders beneath existing nodes.
    set({ nodes: [node, ...get().nodes] })
    window.api.board.saveNode(toBoardNode(node))
  },

  addDocuments: async (position) => {
    const docs = await window.api.documents.import()
    if (!docs.length) return
    const newNodes = docs.map((d, i) => {
      const node = fileNode(d, { x: position.x + i * 40, y: position.y + i * 40 })
      window.api.board.saveNode(toBoardNode(node))
      return node
    })
    set({ nodes: [...get().nodes, ...newNodes] })
  },

  addDroppedFiles: async (paths, position) => {
    if (!paths.length) return
    const docs = await window.api.documents.importPaths(paths)
    if (!docs.length) return
    const newNodes = docs.map((d, i) => {
      const node = fileNode(d, { x: position.x + i * 36, y: position.y + i * 36 })
      window.api.board.saveNode(toBoardNode(node))
      return node
    })
    set({ nodes: [...get().nodes, ...newNodes] })
  },

  addPastedImage: async (dataUrl, position) => {
    const doc = await window.api.documents.importDataUrl(dataUrl)
    if (!doc) return
    const node = fileNode(doc, position)
    set({ nodes: [...get().nodes, node] })
    window.api.board.saveNode(toBoardNode(node))
  },

  removeNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id)
    })
    window.api.board.removeNode(id)
  },

  assembleInvestigation: (plan, center) => {
    const cx = center.x
    const cy = center.y
    const colW = 290
    const rowH = 150

    const created: Node<BoardNodeData>[] = []
    const mkNode = (
      kind: BoardNodeKind,
      label: string | null,
      content: string | null,
      pos: { x: number; y: number },
      extra: Partial<BoardNodeData> = {}
    ): Node<BoardNodeData> => {
      const node: Node<BoardNodeData> = {
        id: newId(kind),
        type: kind,
        position: pos,
        zIndex: Z_NODE,
        data: { kind, refId: null, label, content, ...extra }
      }
      created.push(node)
      return node
    }

    const mystery = mkNode('mystery', plan.mysteryLabel, plan.mysteryContent, { x: cx, y: cy })
    const anchor = mkNode('person', plan.anchor.label, null, { x: cx, y: cy + rowH }, { refId: plan.anchor.id })
    // Clues fan out to the right in columns of four. No enclosing zone — the nodes
    // stay free so the user can drag/organize them however they like.
    const clueNodes = plan.clues.map((c, i) =>
      mkNode(c.kind, c.label || null, c.content ?? null, { x: cx + colW * (Math.floor(i / 4) + 1), y: cy + rowH * (i % 4) }, {
        refId: c.refId ?? null,
        mime: c.mime,
        ext: c.ext,
        width: c.kind === 'note' ? 230 : c.kind === 'evidence' ? 200 : undefined
      })
    )

    // Threads: mystery → anchor (verified), mystery → each clue (a tentative lead).
    const edges: Edge[] = []
    const mkEdge = (source: string, target: string, certainty: EdgeCertainty): void => {
      edges.push({ id: newId('edge'), source, target, type: 'smoothstep', zIndex: Z_EDGE, data: { certainty } })
    }
    mkEdge(mystery.id, anchor.id, 'verified')
    for (const cn of clueNodes) mkEdge(mystery.id, cn.id, 'theory')

    set({ nodes: [...get().nodes, ...created], edges: [...get().edges, ...edges] })
    for (const n of created) window.api.board.saveNode(toBoardNode(n))
    for (const e of edges) window.api.board.saveEdge(toBoardEdge(e))

    return created.map((n) => n.id)
  }
}))
