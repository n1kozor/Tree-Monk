import type { FeedbackInput, FeedbackResult } from '@shared/types'

/**
 * Web3Forms access key — from https://web3forms.com. Safe to ship: it can ONLY
 * trigger an e-mail to the registered owner and does NOT contain the address
 * itself (the mapping lives on Web3Forms' servers). Worst case is spam, fixed by
 * rotating the key. No account/login is ever required from the user.
 *
 * NOTE: the request MUST go out from the renderer (a real Chromium browser) —
 * Web3Forms sits behind Cloudflare bot protection that blocks non-browser
 * clients (Node fetch / the main process). The renderer passes it like any web
 * page would, which is the documented Web3Forms usage.
 */
const WEB3FORMS_ACCESS_KEY = 'fabb42c5-aaee-4e22-8bdf-3c94a2fe27de'
const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit'

const CATEGORY_LABEL: Record<FeedbackInput['category'], string> = {
  bug: '🐞 Bug',
  idea: '💡 Idea',
  other: '💬 Feedback'
}

/**
 * Relays a user's feedback to the developer's inbox via Web3Forms. Auto-attaches
 * the app version, OS and UI language for context — but never any genealogy or
 * personal data. Returns a structured result so the UI can show a friendly
 * message on failure.
 */
export async function sendFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  const message = (input.message ?? '').trim()
  if (!message) return { ok: false, error: 'empty' }

  const version = await window.api.updates.version().catch(() => '')
  const ratingStr = input.rating ? `★${input.rating}/5` : ''
  const payload: Record<string, string> = {
    access_key: WEB3FORMS_ACCESS_KEY,
    subject: `TreeMonk ${CATEGORY_LABEL[input.category]}${ratingStr ? ' ' + ratingStr : ''} — v${version || '?'}`,
    from_name: 'TreeMonk',
    category: input.category,
    message,
    app_version: version,
    platform: navigator.platform || navigator.userAgent,
    locale: input.locale ?? '',
    // Web3Forms spam honeypot — always empty for legitimate submissions.
    botcheck: ''
  }
  if (input.rating) payload.rating = `${input.rating}/5`
  // A reply address lets the developer follow up; only sent when the user gives one.
  const email = (input.email ?? '').trim()
  if (email) payload.email = email

  // Bound the request so a hung connection can't wedge the "sending" state.
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(WEB3FORMS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    const data = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null
    if (res.ok && data?.success) return { ok: true }
    return { ok: false, error: data?.message || `http_${res.status}` }
  } catch {
    return { ok: false, error: 'network' }
  } finally {
    window.clearTimeout(timeout)
  }
}
