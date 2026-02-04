import { invoke } from '@tauri-apps/api/core'
import type {
  FileWriteBatchItem,
  FileWritePayload,
  OpenDialogOptions,
  FolderDialogOptions,
  PlatformAdapter,
  SaveDialogOptions,
} from './types'
import { printHtmlDocument } from './print-utils'

interface DesktopDialogFilter {
  name: string
  extensions: string[]
}

async function selectSavePath(options: SaveDialogOptions): Promise<string | null> {
  return invoke<string | null>('desktop_select_save_path', {
    defaultName: options.defaultFileName,
    title: options.title ?? null,
    filters: (options.filters ?? []) as DesktopDialogFilter[],
  })
}

async function selectOpenPath(options?: OpenDialogOptions): Promise<string | null> {
  return invoke<string | null>('desktop_select_open_path', {
    title: options?.title ?? null,
    filters: (options?.filters ?? []) as DesktopDialogFilter[],
  })
}

async function selectFolder(options?: FolderDialogOptions): Promise<string | null> {
  return invoke<string | null>('desktop_select_folder', {
    title: options?.title ?? null,
  })
}

async function readFile(path: string): Promise<Uint8Array> {
  const bytes = await invoke<number[]>('desktop_read_file', { path })
  return new Uint8Array(bytes)
}

async function writeFile(payload: FileWritePayload): Promise<void> {
  const contents =
    typeof payload.contents === 'string'
      ? new TextEncoder().encode(payload.contents)
      : payload.contents

  await invoke('desktop_write_file', {
    path: payload.path,
    contents: Array.from(contents),
  })
}

async function writeFilesBatch(items: FileWriteBatchItem[]): Promise<void> {
  for (const item of items) {
    await writeFile(item)
  }
}

async function openInFolder(path: string): Promise<void> {
  await invoke('desktop_open_in_folder', { path })
}

export const desktopPlatformAdapter: PlatformAdapter = {
  isDesktop: true,
  selectSavePath,
  selectOpenPath,
  selectFolder,
  readFile,
  writeFile,
  writeFilesBatch,
  openInFolder,
  printDocument: printHtmlDocument,
}
