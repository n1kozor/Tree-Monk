/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly MAIN_VITE_FS_CLIENT_ID?: string
  readonly MAIN_VITE_FS_ENV?: string
  readonly MAIN_VITE_FS_REDIRECT_URI?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
