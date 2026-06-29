import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes
} from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useBoardStore } from './useBoardStore'
import { NoteNode } from './nodes/NoteNode'
import { PersonNode } from './nodes/PersonNode'
import { DocumentNode } from './nodes/DocumentNode'
import { EvidenceNode } from './nodes/EvidenceNode'
import { MysteryNode } from './nodes/MysteryNode'
import { ZoneNode } from './nodes/ZoneNode'
import { LinkNode } from './nodes/LinkNode'
import { MapNode } from './nodes/MapNode'
import { ThreadEdge } from './edges/ThreadEdge'
import { FuseEdge } from './edges/FuseEdge'
import { BoardToolbar } from './BoardToolbar'
import { BoardTabs } from './BoardTabs'
import { BoardWizard } from './BoardWizard'
import { BoardContextMenu, type MenuState } from './BoardContextMenu'

const nodeTypes: NodeTypes = {
  note: NoteNode,
  person: PersonNode,
  document: DocumentNode,
  evidence: EvidenceNode,
  mystery: MysteryNode,
  zone: ZoneNode,
  link: LinkNode,
  map: MapNode
}
const edgeTypes: EdgeTypes = { thread: ThreadEdge, fuse: FuseEdge }

function BoardCanvas(): JSX.Element {
  const { t } = useTranslation()
  const wrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const nodes = useBoardStore((s) => s.nodes)
  const edges = useBoardStore((s) => s.edges)
  const loaded = useBoardStore((s) => s.loaded)
  const loadBoards = useBoardStore((s) => s.loadBoards)
  const onNodesChange = useBoardStore((s) => s.onNodesChange)
  const onEdgesChange = useBoardStore((s) => s.onEdgesChange)
  const onConnect = useBoardStore((s) => s.onConnect)
  const addDroppedFiles = useBoardStore((s) => s.addDroppedFiles)
  const addPastedImage = useBoardStore((s) => s.addPastedImage)
  const setConnecting = useBoardStore((s) => s.setConnecting)
  const connecting = useBoardStore((s) => s.connecting)
  const requestEdit = useBoardStore((s) => s.requestEdit)
  const boardMode = useBoardStore((s) => s.boardMode)
  const spotlightId = useBoardStore((s) => s.spotlightId)
  const setSpotlight = useBoardStore((s) => s.setSpotlight)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const cork = boardMode === 'corkboard'

  useEffect(() => {
    loadBoards()
  }, [loadBoards])

  // ---- Spotlight: dim everything not directly connected to the focused node ----
  const connected = useMemo(() => {
    if (!spotlightId) return null
    const set = new Set<string>([spotlightId])
    for (const e of edges) {
      if (e.source === spotlightId) set.add(e.target)
      if (e.target === spotlightId) set.add(e.source)
    }
    return set
  }, [spotlightId, edges])

  const displayNodes = useMemo(() => {
    if (!connected) return nodes
    return nodes.map((n) =>
      n.data.kind === 'zone'
        ? n
        : { ...n, style: { ...n.style, opacity: connected.has(n.id) ? 1 : 0.16, transition: 'opacity .2s' } }
    )
  }, [nodes, connected])

  const displayEdges = useMemo(() => {
    const type = cork ? 'thread' : 'fuse'
    return edges.map((e) => ({
      ...e,
      type,
      data: {
        ...e.data,
        dimmed: connected ? !(connected.has(e.source) && connected.has(e.target)) : false
      }
    }))
  }, [edges, cork, connected])

  // ---- Clipboard paste → spawn an Evidence node in the viewport centre ----
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return // let text paste through
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (!it.type.startsWith('image/')) continue
        const file = it.getAsFile()
        if (!file) continue
        e.preventDefault()
        const reader = new FileReader()
        reader.onload = (): void => {
          const rect = wrapper.current?.getBoundingClientRect()
          const center = rect
            ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
            : { x: 0, y: 0 }
          void addPastedImage(String(reader.result), center)
        }
        reader.readAsDataURL(file)
        break
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addPastedImage, screenToFlowPosition])

  const spawnAt = useCallback((): { x: number; y: number } => {
    const el = wrapper.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return screenToFlowPosition({
      x: rect.left + rect.width / 2 + (Math.random() - 0.5) * 120,
      y: rect.top + rect.height / 2 + (Math.random() - 0.5) * 120
    })
  }, [screenToFlowPosition])

  const minimapColor = useCallback((n: { type?: string }): string => {
    if (n.type === 'note') return '#fbbf24'
    if (n.type === 'document' || n.type === 'evidence') return '#38bdf8'
    if (n.type === 'link') return '#0ea5e9'
    if (n.type === 'mystery') return '#64748b'
    if (n.type === 'zone') return '#6366f1'
    return '#2dd4bf'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent): void => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files) as Array<File & { path?: string }>
      const paths = files.map((f) => f.path).filter((p): p is string => !!p)
      if (!paths.length) return
      addDroppedFiles(paths, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
    },
    [screenToFlowPosition, addDroppedFiles]
  )

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node): void => {
    e.preventDefault()
    setMenu({ type: 'node', id: node.id, x: e.clientX, y: e.clientY, nodeKind: node.type })
  }, [])
  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge): void => {
    e.preventDefault()
    setMenu({ type: 'edge', id: edge.id, x: e.clientX, y: e.clientY })
  }, [])

  const isEmpty = loaded && nodes.length === 0

  return (
    <div className="flex h-full w-full flex-col">
      <BoardTabs />
      <div
        ref={wrapper}
        className={cn('relative min-h-0 flex-1', cork && 'cork-surface', connecting && 'tm-connecting')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <svg className="pointer-events-none absolute h-0 w-0">
          <defs>
            <filter id="thread-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity="0.45" />
            </filter>
            <filter id="spark-glow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>

        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={() => setConnecting(true)}
          onConnectEnd={() => setConnecting(false)}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onEdgeClick={(e, edge) => setMenu({ type: 'edge', id: edge.id, x: e.clientX, y: e.clientY })}
          onNodeClick={(_, node) => setSpotlight(node.type === 'zone' ? null : node.id)}
          onPaneClick={() => {
            setMenu(null)
            setSpotlight(null)
          }}
          onMoveStart={() => setMenu(null)}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={34}
          elevateNodesOnSelect={false}
          elevateEdgesOnSelect={false}
          // Honour our literal z-index (Z_ZONE 0 < Z_EDGE 1 < Z_NODE 2) instead of
          // lifting edges to their connected nodes' z — which made a thread cover
          // a node dropped onto it (esp. nodes parented to a zone).
          zIndexMode="manual"
          onlyRenderVisibleElements
          fitView
          minZoom={0.1}
          maxZoom={2.5}
          zoomOnScroll
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={['Backspace', 'Delete']}
          className={cork ? 'bg-transparent' : 'bg-background'}
        >
          {!cork && (
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="hsl(var(--dots))" />
          )}
          <Controls className="!shadow-2xl" />
          <MiniMap pannable zoomable nodeColor={minimapColor} maskColor="rgba(0,0,0,0.55)" />
        </ReactFlow>

        <BoardToolbar spawnAt={spawnAt} onWizard={() => setWizardOpen(true)} />
        <BoardWizard open={wizardOpen} onOpenChange={setWizardOpen} spawnAt={spawnAt} />

        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <p className={cn('text-sm', cork ? 'text-zinc-800' : 'text-muted-foreground')}>{t('board.empty')}</p>
            <p className={cn('text-xs', cork ? 'text-zinc-700/80' : 'text-muted-foreground/70')}>
              {t('board.dropHint')}
            </p>
          </div>
        )}

        {menu && (
          <BoardContextMenu menu={menu} onClose={() => setMenu(null)} onEdit={(id) => requestEdit(id)} />
        )}
      </div>
    </div>
  )
}

export function InvestigationBoard(): JSX.Element {
  return (
    <ReactFlowProvider>
      <BoardCanvas />
    </ReactFlowProvider>
  )
}
