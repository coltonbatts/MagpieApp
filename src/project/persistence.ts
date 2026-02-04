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
  ManualStitchEditMode,
  WorkflowStage,
} from '@/types'

const PROJECT_VERSION = 1
const RECENT_PROJECTS_KEY = 'magpie:recentProjects'
const RECENT_PROJECT_LIMIT = 8
const LARGE_IMAGE_WARNING_BYTES = 8 * 1024 * 1024

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
  createdAt: string
  savedAt: string
  appVersion?: string
  workflowStage: WorkflowStage
  sourceImage: {
    mime: 'image/png'
    width: number
    height: number
    dataBase64: string
  }
  fabricSetup: FabricSetup
  referencePlacement: ReferencePlacement | null
  compositionLocked: boolean
  processingConfig: ProcessingConfig
  maskConfig: MaskConfig
  selection: SerializedSelection | null
  manualEdits: ManualStitchEdit[]
  manualEditTool: ManualStitchEditMode
  buildDoneRegionIds: number[]
  buildDoneRegionHash: string | null
}

export interface RecentProjectEntry {
  path: string
  name: string
  savedAt: string
}

export interface SaveProjectResult {
  warning?: string
}

export async function saveCurrentProjectToPath(path: string, workflowStage: WorkflowStage): Promise<SaveProjectResult> {
  const platform = await getPlatformAdapter()
  const state = usePatternStore.getState()

  if (!state.originalImage) {
    throw new Error('No source image loaded. Upload an image before saving a project.')
  }

  const sourceImageBytes = await imageBitmapToPngBytes(state.originalImage)
  const project = createProjectFile({
    workflowStage,
    sourceImage: {
      mime: 'image/png',
      width: state.originalImage.width,
      height: state.originalImage.height,
      dataBase64: bytesToBase64(sourceImageBytes),
    },
    fabricSetup: state.fabricSetup,
    referencePlacement: state.referencePlacement,
    compositionLocked: state.compositionLocked,
    processingConfig: state.processingConfig,
    maskConfig: state.maskConfig,
    selection: serializeSelection(state.selection),
    manualEdits: editsArrayFromMap(state.manualEdits),
    manualEditTool: state.manualEditTool,
    buildDoneRegionIds: state.doneRegionIds,
    buildDoneRegionHash: state.doneRegionLockHash,
  })

  await platform.writeFile({
    path,
    contents: stringifyProjectFile(project),
  })
  rememberRecentProject(path, project.savedAt)

  if (sourceImageBytes.byteLength > LARGE_IMAGE_WARNING_BYTES) {
    return {
      warning: 'Project saved, but embedded source image is large. Expect a larger .magpie file.',
    }
  }

  return {}
}

export async function loadProjectFromPath(path: string): Promise<void> {
  try {
    const platform = await getPlatformAdapter()
    const bytes = await platform.readFile(path)
    const raw = new TextDecoder().decode(bytes)
    const parsed = parseAndMigrateProjectFile(raw)

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
        fabricSetup: parsed.fabricSetup,
        referencePlacement: parsed.referencePlacement ?? null,
        compositionLocked: parsed.compositionLocked,
        selection: selectionForStore,
        maskConfig: parsed.maskConfig ?? state.maskConfig,
        basePattern: null,
        pattern: null,
        manualEdits: editsMapFromArray(parsed.manualEdits ?? []),
        manualEditTool: parsed.manualEditTool ?? 'paint',
        doneRegionIds: Array.isArray(parsed.buildDoneRegionIds) ? parsed.buildDoneRegionIds : [],
        doneRegionLockHash: typeof parsed.buildDoneRegionHash === 'string' ? parsed.buildDoneRegionHash : null,
        processingConfig: processingConfig,
        isProcessing: false,
        error: null,
      }
    })

    const workflowStage = parsed.workflowStage ?? 'Build'
    useUIStore.getState().setWorkflowStage(workflowStage, { acknowledge: false, source: 'system' })
    rememberRecentProject(path, new Date().toISOString())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown project load failure.'
    throw new Error(message.startsWith('Could not open project:') ? message : `Could not open project: ${message}`)
  }
}

export async function getRecentProjectsPruned(): Promise<RecentProjectEntry[]> {
  const platform = await getPlatformAdapter()
  const entries = getRecentProjects()
  if (!platform.isDesktop || entries.length === 0) return entries

  const kept: RecentProjectEntry[] = []
  let removedAny = false
  for (const entry of entries) {
    if (await platform.fileExists(entry.path)) {
      kept.push(entry)
    } else {
      removedAny = true
    }
  }
  if (removedAny && typeof window !== 'undefined') {
    window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(kept))
  }
  return kept
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

export function createProjectFile(input: Omit<MagpieProjectFileV1, 'version' | 'createdAt' | 'savedAt' | 'appVersion'>): MagpieProjectFileV1 {
  const now = new Date().toISOString()
  const appVersion = import.meta.env.VITE_APP_VERSION as string | undefined
  return {
    version: PROJECT_VERSION,
    createdAt: now,
    savedAt: new Date().toISOString(),
    appVersion,
    ...input,
  }
}

export function stringifyProjectFile(project: MagpieProjectFileV1): string {
  return JSON.stringify(project)
}

export function parseAndMigrateProjectFile(raw: string): MagpieProjectFileV1 {
  let parsedUnknown: unknown
  try {
    parsedUnknown = JSON.parse(raw)
  } catch {
    throw new Error('Could not open project: file is not valid JSON.')
  }

  return migrateProjectFile(parsedUnknown)
}

function rememberRecentProject(path: string, savedAt: string): void {
  if (typeof window === 'undefined') return

  const name = fileNameFromPath(path)
  const existing = getRecentProjects().filter((entry) => entry.path !== path)
  const next: RecentProjectEntry[] = [{ path, name, savedAt }, ...existing].slice(0, RECENT_PROJECT_LIMIT)
  window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next))
}

export function migrateProjectFile(project: unknown): MagpieProjectFileV1 {
  if (!project || typeof project !== 'object') {
    throw new Error('Could not open project: expected a JSON object.')
  }

  const value = project as Partial<MagpieProjectFileV1> & { version?: unknown }
  if (value.version === PROJECT_VERSION) {
    return validateProjectFileV1(value)
  }

  if (typeof value.version !== 'number') {
    throw new Error('Could not open project: missing version metadata.')
  }

  // Migration stub for future versions.
  throw new Error(`Project version ${value.version} is not supported by this build yet.`)
}

function validateProjectFileV1(project: Partial<MagpieProjectFileV1>): MagpieProjectFileV1 {
  if (!project.sourceImage || !project.processingConfig || !project.fabricSetup) {
    throw new Error('Could not open project: required fields are missing.')
  }
  if (project.sourceImage.mime !== 'image/png' || typeof project.sourceImage.dataBase64 !== 'string') {
    throw new Error('Could not open project: source image payload is invalid.')
  }

  return {
    version: PROJECT_VERSION,
    createdAt: project.createdAt ?? project.savedAt ?? new Date().toISOString(),
    savedAt: project.savedAt ?? new Date().toISOString(),
    appVersion: project.appVersion,
    workflowStage: project.workflowStage ?? 'Build',
    sourceImage: project.sourceImage,
    fabricSetup: project.fabricSetup,
    referencePlacement: project.referencePlacement ?? null,
    compositionLocked:
      typeof project.compositionLocked === 'boolean'
        ? project.compositionLocked
        : (project.workflowStage === 'Build' || project.workflowStage === 'Export'),
    processingConfig: project.processingConfig,
    maskConfig: project.maskConfig ?? {
      brushSize: 20,
      opacity: 0.5,
    },
    selection: project.selection ?? null,
    manualEdits: Array.isArray(project.manualEdits) ? project.manualEdits : [],
    manualEditTool: project.manualEditTool === 'fabric' ? 'fabric' : 'paint',
    buildDoneRegionIds: Array.isArray(project.buildDoneRegionIds)
      ? project.buildDoneRegionIds.filter((id): id is number => Number.isInteger(id) && id > 0)
      : [],
    buildDoneRegionHash: typeof project.buildDoneRegionHash === 'string' ? project.buildDoneRegionHash : null,
  }
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
