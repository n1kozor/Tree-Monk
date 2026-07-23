/// <reference types="vite/client" />

// Vite `?url` asset imports used by the web demo (the WASM binary and the
// bundled sample database). tsc doesn't understand the query suffix, so declare
// them as string-URL modules.
declare module '*.wasm?url' {
  const url: string
  export default url
}
declare module '*.sqlite?url' {
  const url: string
  export default url
}
