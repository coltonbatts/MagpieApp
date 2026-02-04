export interface SaveDialogFilter {
  name: string
  extensions: string[]
}

export interface OpenDialogFilter {
  name: string
  extensions: string[]
}

export interface SaveDialogOptions {
  defaultFileName: string
  title?: string
  filters?: SaveDialogFilter[]
}

export interface OpenDialogOptions {
  title?: string
  filters?: OpenDialogFilter[]
}

export interface FolderDialogOptions {
  title?: string
}

export interface PrintOptions {
  title: string
  html: string
}

export interface FileWritePayload {
  path: string
  contents: string | Uint8Array
}

export interface FileWriteBatchItem extends FileWritePayload {}

export interface PlatformAdapter {
  isDesktop: boolean
  selectSavePath: (options: SaveDialogOptions) => Promise<string | null>
  selectOpenPath: (options?: OpenDialogOptions) => Promise<string | null>
  selectFolder: (options?: FolderDialogOptions) => Promise<string | null>
  readFile: (path: string) => Promise<Uint8Array>
  fileExists: (path: string) => Promise<boolean>
  writeFile: (payload: FileWritePayload) => Promise<void>
  writeFilesBatch: (items: FileWriteBatchItem[]) => Promise<void>
  openInFolder: (path: string) => Promise<void>
  printDocument: (options: PrintOptions) => Promise<void>
}
