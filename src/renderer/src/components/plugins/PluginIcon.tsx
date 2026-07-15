import { Puzzle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A plugin's icon, matching the app's own (lucide) icon look. The manifest may
 * name an SVG/PNG file inside the plugin — it is rendered as a currentColor
 * MASK, so it tints exactly like the built-in stroke icons (active/hover/muted
 * states included). An emoji still works; no icon falls back to the puzzle.
 */
export function PluginIcon({
  pluginId,
  icon,
  className
}: {
  pluginId: string
  icon?: string
  className?: string
}): JSX.Element {
  if (icon && /\.(svg|png|webp)$/i.test(icon)) {
    const url = `tmplugin://${pluginId}/${icon}`
    const mask = `url("${url}") center / contain no-repeat`
    return (
      <span
        aria-hidden
        className={cn('inline-block shrink-0 bg-current', className)}
        style={{ mask, WebkitMask: mask }}
      />
    )
  }
  if (icon)
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center text-base leading-none', className)}>
        {icon}
      </span>
    )
  return <Puzzle className={className} />
}
