import type { PlatformAdapter } from './types'
import { webPlatformAdapter } from './platform.web'

let platformAdapterPromise: Promise<PlatformAdapter> | null = null

function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
}

export async function getPlatformAdapter(): Promise<PlatformAdapter> {
  if (!platformAdapterPromise) {
    platformAdapterPromise = (async () => {
      if (!isTauriRuntime()) {
        return webPlatformAdapter
      }

      const desktopModule = await import('./platform.desktop')
      return desktopModule.desktopPlatformAdapter
    })()
  }

  return platformAdapterPromise
}

export type {
  FileWriteBatchItem,
  FileWritePayload,
  OpenDialogFilter,
  OpenDialogOptions,
  FolderDialogOptions,
  PlatformAdapter,
  PrintOptions,
  SaveDialogFilter,
  SaveDialogOptions,
} from './types'
