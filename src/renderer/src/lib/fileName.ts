/**
 * Turn a free-form string (usually a person's name) into a safe file-name base:
 * strips characters that are illegal in file names, collapses whitespace to
 * dashes, and keeps accented letters intact. Falls back to a default when empty.
 */
export function safeFileBase(name: string, fallback = 'treemonk-export'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return cleaned || fallback
}
