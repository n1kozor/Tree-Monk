import { cn } from '@/lib/utils'

/**
 * Tiny dependency-free Markdown renderer for release notes / changelogs.
 * Supports the common subset authored in GitHub release bodies: headings
 * (#, ##, ###), bold, italic, inline code, links, bullet/numbered lists and
 * horizontal rules. Anything else falls through as plain text. Builds real React
 * nodes (no dangerouslySetInnerHTML), so it's safe to render untrusted text.
 */
export function Markdown({ children, className }: { children: string; className?: string }): JSX.Element {
  const lines = children.replace(/\r\n/g, '\n').split('\n')
  const blocks: JSX.Element[] = []
  let para: string[] = []
  let list: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let key = 0

  const flushPara = (): void => {
    if (!para.length) return
    const items = para
    blocks.push(
      <p key={`p${key++}`} className="my-1.5 first:mt-0">
        {items.map((ln, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {renderInline(ln, `p${key}-${i}`)}
          </span>
        ))}
      </p>
    )
    para = []
  }

  const flushList = (): void => {
    if (!list.length) return
    const items = list.map((it, i) => <li key={i}>{renderInline(it, `li${key}-${i}`)}</li>)
    blocks.push(
      listType === 'ol' ? (
        <ol key={`l${key++}`} className="my-1.5 ml-5 list-decimal space-y-0.5">
          {items}
        </ol>
      ) : (
        <ul key={`l${key++}`} className="my-1.5 ml-5 list-disc space-y-0.5">
          {items}
        </ul>
      )
    )
    list = []
    listType = null
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) {
      flushPara()
      flushList()
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      flushPara()
      flushList()
      const level = heading[1].length
      const cls =
        level === 1
          ? 'mb-1 mt-3 text-base font-bold first:mt-0'
          : level === 2
            ? 'mb-1 mt-3 text-sm font-bold first:mt-0'
            : 'mb-0.5 mt-2 text-[13px] font-semibold first:mt-0'
      const content = renderInline(heading[2], `h${key}`)
      blocks.push(
        level === 1 ? (
          <h3 key={`h${key++}`} className={cls}>
            {content}
          </h3>
        ) : level === 2 ? (
          <h4 key={`h${key++}`} className={cls}>
            {content}
          </h4>
        ) : (
          <h5 key={`h${key++}`} className={cls}>
            {content}
          </h5>
        )
      )
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushPara()
      flushList()
      blocks.push(<hr key={`hr${key++}`} className="my-2.5 border-border" />)
      continue
    }
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    if (bullet) {
      flushPara()
      if (listType === 'ol') flushList()
      listType = 'ul'
      list.push(bullet[1])
      continue
    }
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/)
    if (numbered) {
      flushPara()
      if (listType === 'ul') flushList()
      listType = 'ol'
      list.push(numbered[1])
      continue
    }
    // Plain text line — accumulate into the current paragraph.
    flushList()
    para.push(line)
  }
  flushPara()
  flushList()

  return <div className={cn('text-[13px] leading-relaxed', className)}>{blocks}</div>
}

/** Inline span patterns, tried earliest-match-wins (ties → earlier in the list). */
const INLINE: { re: RegExp; node: (m: RegExpMatchArray, key: string) => JSX.Element }[] = [
  { re: /\*\*(.+?)\*\*/, node: (m, k) => <strong key={k}>{m[1]}</strong> },
  { re: /__(.+?)__/, node: (m, k) => <strong key={k}>{m[1]}</strong> },
  {
    re: /`([^`]+)`/,
    node: (m, k) => (
      <code key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
        {m[1]}
      </code>
    )
  },
  {
    re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/,
    node: (m, k) => (
      <a
        key={k}
        onClick={(e) => {
          e.preventDefault()
          void window.api?.app?.openExternal?.(m[2])
        }}
        className="cursor-pointer text-primary underline underline-offset-2 hover:opacity-80"
      >
        {m[1]}
      </a>
    )
  },
  { re: /\*(.+?)\*/, node: (m, k) => <em key={k}>{m[1]}</em> },
  { re: /_(.+?)_/, node: (m, k) => <em key={k}>{m[1]}</em> }
]

/** Parses bold / italic / code / links inside a single line into React nodes. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let rest = text
  let n = 0
  while (rest) {
    let best: { idx: number; len: number; node: JSX.Element } | null = null
    for (const p of INLINE) {
      const m = rest.match(p.re)
      if (m && m.index !== undefined && (!best || m.index < best.idx)) {
        best = { idx: m.index, len: m[0].length, node: p.node(m, `${keyPrefix}-${n}`) }
      }
    }
    if (!best) {
      out.push(rest)
      break
    }
    if (best.idx > 0) out.push(rest.slice(0, best.idx))
    out.push(best.node)
    rest = rest.slice(best.idx + best.len)
    n++
  }
  return out
}
