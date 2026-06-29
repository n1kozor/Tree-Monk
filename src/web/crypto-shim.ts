// Browser stand-in for Node's `crypto` module — the repository layer imports
// `randomUUID` from it (only used on writes, which the demo blocks, but the
// import must still resolve). Web Crypto provides the same API.
export function randomUUID(): string {
  return globalThis.crypto.randomUUID()
}
