import { normalizeImage, normalizeImageCapped } from '@/processing/image-utils'
import { getPlatformAdapter } from '@/platform'
import { SelectionArtifactModel } from '@/model/SelectionArtifact'
import { editsArrayFromMap, editsMapFromArray } from '@/model/manual-edits'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import type {
  FabricSetup,
  ManualStitchEdit,
  MaskConfig,
  ProcessingConfig,
  ReferencePlacement,
  SelectionArtifact,
  WorkflowStage,
} from '@/types'

const PROJECT_VERSION = 1
const RECENT_PROJECTS_KEY = 'magpie:recentProjects'
const RECENT_PROJECT_LIMIT = 8

interface SerializedSelection {
  id: string
  referenceId: string
  width: number
  height: number
  isDefault: boolean
  maskBase64: string
}

interface MagpieProjectFileV1 {
  version: typeof PROJECT_VERSION
  savedAt: string
  workflowStage: WorkflowStage
  sourceImage: {
    mime: 'image/png'
    width: number
    height: number
    dataBase64: string
  }
  fabricSetup: FabricSetup
  referencePlacement: ReferencePlacement | null
  processingConfig: ProcessingConfig
  maskConfig: MaskConfig
  selection: SerializedSelection | null
  manualEdits: ManualStitchEdit[]
}

export interface RecentProjectEntry {
  path: string
  name: string
  savedAt: string
}

export async function saveCurrentProjectToPath(path: string, workflowStage: WorkflowStage): Promise<void> {
  const platform = await getPlatformAdapter()
  const state = usePatternStore.getState()

  if (!state.originalImage) {
    throw new Error('No source image loaded. Upload an image before saving a project.')
  }

  const sourceImageBytes = await imageBitmapToPngBytes(state.originalImage)
  const project: MagpieProjectFileV1 = {
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    workflowStage,
    sourceImage: {
      mime: 'image/png',
      width: state.originalImage.width,
      height: state.originalImage.height,
      dataBase64: bytesToBase64(sourceImageBytes),
    },
    fabricSetup: state.fabricSetup,
    referencePlacement: state.referencePlacement,
    processingConfig: state.processingConfig,
    maskConfig: state.maskConfig,
    selection: serializeSelection(state.selection),
    manualEdits: editsArrayFromMap(state.manualEdits),
  }

  await platform.writeFile({
    path,
    contents: JSON.stringify(project),
  })
  rememberRecentProject(path, project.savedAt)
}

export async function loadProjectFromPath(path: string): Promise<void> {
  const platform = await getPlatformAdapter()
  const bytes = await platform.readFile(path)
  const raw = new TextDecoder().decode(bytes)
  const parsed = JSON.parse(raw) as Partial<MagpieProjectFileV1>

  if (parsed.version !== PROJECT_VERSION || !parsed.sourceImage || !parsed.processingConfig || !parsed.fabricSetup) {
    throw new Error('Unsupported or invalid Magpie project file.')
  }

  const sourceBytes = base64ToBytes(parsed.sourceImage.dataBase64)
  const sourceBitmap = await decodePngToImageBitmap(sourceBytes)
  const processingConfig = parsed.processingConfig
  const buildImage = normalizeImage(sourceBitmap, processingConfig.targetSize)
  const selectionImage = normalizeImageCapped(
    sourceBitmap,
    processingConfig.selectionWorkingSize,
    processingConfig.selectionMaxMegapixels
  )

  const referenceId = `ref_${Math.random().toString(36).slice(2, 9)}`
  const selection = deserializeSelection(parsed.selection ?? null, referenceId)
  const selectionForStore =
    selection && (selection.width !== selectionImage.width || selection.height !== selectionImage.height)
      ? SelectionArtifactModel.resampleTo(selection, selectionImage.width, selectionImage.height)
      : selection

  usePatternStore.setState((state) => {
    state.originalImage?.close()
    return {
      referenceId,
      originalImage: sourceBitmap,
      normalizedImage: buildImage,
      selectionWorkingImage: selectionImage,
      fabricSetup: parsed.fabricSetup!,
      referencePlacement: parsed.referencePlacement ?? null,
      selection: selectionForStore,
      maskConfig: parsed.maskConfig ?? state.maskConfig,
      pattern: null,
      manualEdits: editsMapFromArray(parsed.manualEdits ?? []),
      processingConfig: processingConfig,
      isProcessing: false,
      error: null,
    }
  })

  const workflowStage = parsed.workflowStage ?? 'Build'
  useUIStore.getState().setWorkflowStage(workflowStage)
  rememberRecentProject(path, new Date().toISOString())
}

export function getRecentProjects(): RecentProjectEntry[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(RECENT_PROJECTS_KEY)
    if (!raw) return []
    const entries = JSON.parse(raw) as RecentProjectEntry[]
    return entries
      .filter((entry) => typeof entry.path === 'string' && entry.path.length > 0)
      .slice(0, RECENT_PROJECT_LIMIT)
  } catch {
    return []
  }
}

export function removeRecentProject(path: string): void {
  if (typeof window === 'undefined') return
  const remaining = getRecentProjects().filter((entry) => entry.path !== path)
  window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(remaining))
}

function rememberRecentProject(path: string, savedAt: string): void {
  if (typeof window === 'undefined') return

  const name = fileNameFromPath(path)
  const existing = getRecentProjects().filter((entry) => entry.path !== path)
  const next: RecentProjectEntry[] = [{ path, name, savedAt }, ...existing].slice(0, RECENT_PROJECT_LIMIT)
  window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next))
}

function serializeSelection(selection: SelectionArtifact | null): SerializedSelection | null {
  if (!selection) return null
  return {
    id: selection.id,
    referenceId: selection.referenceId,
    width: selection.width,
    height: selection.height,
    isDefault: selection.isDefault,
    maskBase64: bytesToBase64(selection.mask),
  }
}

function deserializeSelection(selection: SerializedSelection | null, referenceId: string): SelectionArtifact | null {
  if (!selection) return null
  return {
    id: selection.id,
    referenceId,
    width: selection.width,
    height: selection.height,
    isDefault: selection.isDefault,
    mask: base64ToBytes(selection.maskBase64),
  }
}

async function imageBitmapToPngBytes(bitmap: ImageBitmap): Promise<Uint8Array> {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(bitmap.width, bitmap.height)
      : Object.assign(document.createElement('canvas'), {
        width: bitmap.width,
        height: bitmap.height,
      })
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!context) throw new Error('Failed to encode source image for project save.')
  context.drawImage(bitmap, 0, 0)

  if ('convertToBlob' in canvas) {
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return new Uint8Array(await blob.arrayBuffer())
  }

  const htmlCanvas = canvas as HTMLCanvasElement
  const blob = await new Promise<Blob>((resolve, reject) => {
    htmlCanvas.toBlob((created) => {
      if (!created) {
        reject(new Error('Failed to encode source image for project save.'))
        return
      }
      resolve(created)
    }, 'image/png')
  })
  return new Uint8Array(await blob.arrayBuffer())
}

async function decodePngToImageBitmap(bytes: Uint8Array): Promise<ImageBitmap> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const blob = new Blob([buffer], { type: 'image/png' })
  return createImageBitmap(blob)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function fileNameFromPath(path: string): string {
  const segments = path.split(/[\\/]/)
  return segments[segments.length - 1] || path
}
