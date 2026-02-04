import { invoke } from '@tauri-apps/api/core'
import { normalizeImage, normalizeImageCapped } from '@/processing/image-utils'
import { getPlatformAdapter } from '@/platform'
import { editsArrayFromMap, editsMapFromArray } from '@/model/manual-edits'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import type { ProjectDocument, ProjectStateV1, ManifestEntry, SerializedSelection } from './types'

export async function getAllProjects(): Promise<ManifestEntry[]> {
  return invoke<ManifestEntry[]>('get_all_projects')
}

export async function loadProject(projectId: string): Promise<ProjectDocument> {
  return invoke<ProjectDocument>('load_project', { projectId })
}

export async function saveProject(project: ProjectDocument): Promise<void> {
  await invoke('save_project', { project })
}

export function captureProjectState(): ProjectStateV1 {
  const patternState = usePatternStore.getState()
  const uiState = useUIStore.getState()

  return {
    version: 1,
    workflow_stage: uiState.workflowStage,
    fabric_setup: patternState.fabricSetup,
    reference_placement: patternState.referencePlacement,
    composition_locked: patternState.compositionLocked,
    processing_config: patternState.processingConfig,
    mask_config: patternState.maskConfig,
    magic_wand_config: patternState.magicWandConfig,
    refinement_config: patternState.refinementConfig,
    selection: serializeSelection(patternState.selection),
    manual_edits: editsArrayFromMap(patternState.manualEdits),
    manual_edit_tool: patternState.manualEditTool,
    done_region_ids: patternState.doneRegionIds,
    done_region_lock_hash: patternState.doneRegionLockHash,
  }
}

export async function hydrateProjectFromDocument(project: ProjectDocument): Promise<void> {
  const platform = await getPlatformAdapter()
  const sourceBytes = await platform.readFile(project.reference_image_path)
  const blobBytes = new Uint8Array(sourceBytes)
  const sourceBlob = new Blob([blobBytes], { type: guessMimeType(project.reference_image_path) })
  const sourceFile = new File([sourceBlob], fileNameFromPath(project.reference_image_path), {
    type: sourceBlob.type,
  })
  const sourceBitmap = await createImageBitmap(sourceFile)

  const state = project.state
  const processingConfig = state.processing_config
  const buildImage = normalizeImage(sourceBitmap, processingConfig.targetSize)
  const selectionImage = normalizeImageCapped(
    sourceBitmap,
    processingConfig.selectionWorkingSize,
    processingConfig.selectionMaxMegapixels
  )

  const referenceId = `ref_${Math.random().toString(36).slice(2, 9)}`
  const selection = deserializeSelection(state.selection, referenceId)

  usePatternStore.setState((current) => {
    current.originalImage?.close()
    return {
      referenceId,
      originalImage: sourceBitmap,
      normalizedImage: buildImage,
      selectionWorkingImage: selectionImage,
      fabricSetup: state.fabric_setup,
      referencePlacement: state.reference_placement,
      compositionLocked: state.composition_locked,
      processingConfig: state.processing_config,
      maskConfig: state.mask_config,
      magicWandConfig: state.magic_wand_config,
      refinementConfig: state.refinement_config,
      selection,
      manualEdits: editsMapFromArray(state.manual_edits),
      manualEditTool: state.manual_edit_tool,
      doneRegionIds: state.done_region_ids,
      doneRegionLockHash: state.done_region_lock_hash,
      basePattern: null,
      pattern: null,
      buildArtifact: null,
      buildStatus: 'idle',
      buildError: null,
      buildLockHash: null,
      hoverRegionId: null,
      activeRegionId: null,
      error: null,
    }
  })

  useUIStore.getState().setWorkflowStage(state.workflow_stage, { acknowledge: false, source: 'system' })
}

function serializeSelection(selection: ReturnType<typeof usePatternStore.getState>['selection']): SerializedSelection | null {
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

function deserializeSelection(selection: SerializedSelection | null, referenceId: string) {
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
  return segments[segments.length - 1] || 'reference-image'
}

function guessMimeType(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}
