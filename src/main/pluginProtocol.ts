import { protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { pluginFilePath } from './plugins'
import { SDK_FILES } from './pluginSdk'

/**
 * Serves installed plugin files over `tmplugin://<pluginId>/<path>` INTO the
 * sandboxed panel iframe. The Content-Security-Policy attached to every
 * response is the security boundary of the whole plugin system:
 *
 * - `connect-src http://127.0.0.1:*` — a plugin can fetch the LOCAL API and
 *   nothing else. Family data physically cannot be sent to the internet.
 * - No remote scripts/styles/frames; images only from the plugin itself,
 *   data: URLs, or the local API (document images).
 */
const SCHEME = 'tmplugin'

const CSP = [
  "default-src 'none'",
  // tmplugin: lets panels load the shared SDK from tmplugin://sdk/… (the SDK
  // host is a different origin than the plugin's own files, so 'self' alone
  // would block it). Still no remote code — the scheme only serves from disk.
  "script-src 'self' 'unsafe-inline' tmplugin:",
  "style-src 'self' 'unsafe-inline' tmplugin:",
  "img-src 'self' data: http://127.0.0.1:*",
  "font-src 'self' data:",
  "connect-src http://127.0.0.1:*",
  "form-action 'none'",
  "base-uri 'none'"
].join('; ')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

/** Must run before app `ready`. */
export function registerPluginScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false }
    }
  ])
}

/** Must run after app `ready`. */
export function registerPluginProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      // The reserved `sdk` host serves the bundled plugin SDK (css/js).
      if (url.hostname === 'sdk') {
        const asset = SDK_FILES[decodeURIComponent(url.pathname).replace(/^\/+/, '')]
        if (!asset) return new Response('Not found', { status: 404 })
        return new Response(asset.body, {
          headers: {
            'Content-Type': asset.mime,
            'Content-Security-Policy': CSP,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-cache'
          }
        })
      }
      // With a `standard` scheme, the plugin id parses as the host (lowercased).
      const file = pluginFilePath(url.hostname, decodeURIComponent(url.pathname))
      if (!file) return new Response('Not found', { status: 404 })
      const body = await readFile(file)
      return new Response(body, {
        headers: {
          'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
          'Content-Security-Policy': CSP,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-cache'
        }
      })
    } catch {
      return new Response('Error', { status: 404 })
    }
  })
}
