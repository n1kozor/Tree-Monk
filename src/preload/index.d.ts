import type { TreeMonkApi } from '@shared/ipc'

declare global {
  interface Window {
    api: TreeMonkApi
  }
}

export {}
