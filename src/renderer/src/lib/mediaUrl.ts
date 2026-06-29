/**
 * URL for a stored document served by the main-process `tmedia://` protocol.
 * Loads natively in `<img src>` — no base64 IPC, no synchronous main-thread
 * file reads (which previously froze the UI when many photos rendered at once).
 */
export const mediaUrl = (documentId: string): string => `tmedia://media/${documentId}`

/**
 * A downscaled JPEG thumbnail of a stored image (the main process resizes it on
 * the fly and caches it). Far lighter than the full-resolution original — use it
 * for grids and avatars. Use `mediaUrl()` for the full-size viewer.
 */
export const mediaThumb = (documentId: string, width: number): string =>
  `tmedia://media/${documentId}?w=${Math.round(width)}`
