import type {
  FileWriteBatchItem,
  FileWritePayload,
  OpenDialogOptions,
  FolderDialogOptions,
  PlatformAdapter,
  SaveDialogOptions,
} from './types'
import { printHtmlDocument } from './print-utils'

function fileNameFromPath(path: string): string {
  const segments = path.split(/[\\/]/)
  return segments[segments.length - 1] || path
}

function guessMimeType(path: string): string {
  const lowerPath = path.toLowerCase()
  if (lowerPath.endsWith('.csv')) return 'text/csv;charset=utf-8'
  if (lowerPath.endsWith('.svg')) return 'image/svg+xml'
  if (lowerPath.endsWith('.png')) return 'image/png'
  if (lowerPath.endsWith('.json') || lowerPath.endsWith('.magpie')) {
    return 'application/json;charset=utf-8'
  }
  return 'application/octet-stream'
}

function downloadContents(contents: string | Uint8Array, path: string): void {
  const blobPart =
    typeof contents === 'string' ? contents : new Uint8Array(contents)
  const blob = new Blob([blobPart], { type: guessMimeType(path) })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileNameFromPath(path)
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}

async function writeFile(payload: FileWritePayload): Promise<void> {
  downloadContents(payload.contents, payload.path)
}

async function writeFilesBatch(items: FileWriteBatchItem[]): Promise<void> {
  for (const item of items) {
    await writeFile(item)
  }
}

export const webPlatformAdapter: PlatformAdapter = {
  isDesktop: false,
  async selectSavePath(options: SaveDialogOptions): Promise<string | null> {
    return options.defaultFileName
  },
  async selectOpenPath(_options?: OpenDialogOptions): Promise<string | null> {
    return null
  },
  async selectFolder(_options?: FolderDialogOptions): Promise<string | null> {
    return null
  },
  async readFile(_path: string): Promise<Uint8Array> {
    throw new Error('Reading local files is not supported in the web adapter.')
  },
  async fileExists(_path: string): Promise<boolean> {
    return false
  },
  writeFile,
  writeFilesBatch,
  async openInFolder(_path: string): Promise<void> {
    return
  },
  printDocument: printHtmlDocument,
}
