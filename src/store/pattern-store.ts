import { create } from 'zustand'
import { Pattern } from '@/model/Pattern'
import { PROCESSING } from '@/lib/constants'
import {
  applyManualEditsToPattern,
  editsArrayFromMap,
  mergeManualEdits,
} from '@/model/manual-edits'
import type {
  BuildArtifact,
  FabricSetup,
  ManualStitchEdit,
  ManualStitchEdits,
  ProcessingConfig,
  MaskConfig,
  ReferencePlacement,
  SelectionArtifact,
  MagicWandConfig,
  RefinementConfig,
} from '@/types'
import { SelectionArtifactModel } from '@/model/SelectionArtifact'

export interface PatternState {
  referenceId: string | null
  originalImage: ImageBitmap | null
  normalizedImage: ImageData | null // Build working resolution
  selectionWorkingImage: ImageData | null // SelectStage working resolution
  fabricSetup: FabricSetup
  referencePlacement: ReferencePlacement | null
  compositionLocked: boolean
  selection: SelectionArtifact | null
  maskConfig: MaskConfig
  magicWandConfig: MagicWandConfig
  selectionMode: 'replace' | 'add' | 'subtract'
  refinementConfig: RefinementConfig
  selectionWorkspaceId: string | null
  pattern: Pattern | null
  basePattern: Pattern | null
  buildArtifact: BuildArtifact | null
  buildStatus: 'idle' | 'building' | 'ready' | 'error'
  buildError: string | null
  buildLockHash: string | null
  hoverRegionId: number | null
  activeRegionId: number | null
  doneRegionIds: number[]
  doneRegionLockHash: string | null
  manualEdits: ManualStitchEdits
  manualEditTool: 'paint' | 'fabric'
  processingConfig: ProcessingConfig
  isProcessing: boolean
  error: string | null
  setOriginalImage: (image: ImageBitmap) => void
  setSourceImages: (buildImage: ImageData, selectionImage: ImageData) => void
  setFabricSetup: (config: Partial<FabricSetup>) => void
  setReferencePlacement: (placement: ReferencePlacement | null) => void
  setCompositionLocked: (locked: boolean) => void
  setSelection: (selection: SelectionArtifact | null) => void
  setMaskConfig: (config: Partial<MaskConfig>) => void
  setMagicWandConfig: (config: Partial<MagicWandConfig>) => void
  setSelectionMode: (mode: 'replace' | 'add' | 'subtract') => void
  setRefinementConfig: (config: Partial<RefinementConfig>) => void
  setSelectionWorkspaceId: (id: string | null) => void
  setPattern: (pattern: Pattern | null) => void
  setBuildArtifact: (artifact: BuildArtifact | null, status?: PatternState['buildStatus']) => void
  setBuildStatus: (status: PatternState['buildStatus'], error?: string | null) => void
  setHoverRegionId: (id: number | null) => void
  setActiveRegionId: (id: number | null) => void
  toggleRegionDone: (id: number) => void
  setDoneRegionIds: (ids: number[], lockHash: string | null) => void
  setManualEdits: (edits: ManualStitchEdit[]) => void
  applyManualEdits: (edits: ManualStitchEdit[]) => void
  clearManualEdits: () => void
  setManualEditTool: (tool: 'paint' | 'fabric') => void
  setProcessingConfig: (config: Partial<ProcessingConfig>) => void
  setIsProcessing: (isProcessing: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const usePatternStore = create<PatternState>((set) => ({
  referenceId: null,
  originalImage: null,
  normalizedImage: null,
  selectionWorkingImage: null,
  fabricSetup: {
    type: 'linen',
    textureIntensity: 0.5,
    count: 14,
    color: { r: 245, g: 245, b: 220 },
    hoop: {
      presetId: 'round-254',
      label: 'Round 10"',
      shape: 'round',
      widthMm: 254,
      heightMm: 254,
      marginMm: 10,
    },
  },
  referencePlacement: null,
  compositionLocked: false,
  selection: null,
  maskConfig: {
    brushSize: 20,
    opacity: 0.5,
  },
  magicWandConfig: {
    tolerance: 15,
    edgeStop: 30,
  },
  selectionMode: 'replace',
  refinementConfig: {
    strength: 20,
  },
  selectionWorkspaceId: null,
  pattern: null,
  basePattern: null,
  buildArtifact: null,
  buildStatus: 'idle',
  buildError: null,
  buildLockHash: null,
  hoverRegionId: null,
  activeRegionId: null,
  doneRegionIds: [],
  doneRegionLockHash: null,
  manualEdits: {},
  manualEditTool: 'paint',
  processingConfig: {
    colorCount: 20,
    ditherMode: 'none',
    targetSize: PROCESSING.DEFAULT_TARGET_SIZE,
    selectionWorkingSize: PROCESSING.DEFAULT_SELECTION_WORKING_SIZE,
    selectionMaxMegapixels: PROCESSING.DEFAULT_SELECTION_MAX_MEGAPIXELS,
    useDmcPalette: false,
    smoothingAmount: 0.25,
    simplifyAmount: 0.15,
    minRegionSize: 3,
    fabricColor: { r: 245, g: 245, b: 220 }, // Light Linen
    stitchThreshold: 0.1,
    organicPreview: false,
  },
  isProcessing: false,
  error: null,
  setOriginalImage: (image) =>
    set((state) => {
      state.originalImage?.close()
      return { originalImage: image }
    }),
  setSourceImages: (buildImage, selectionImage) => {
    const newReferenceId = `ref_${Math.random().toString(36).substring(2, 9)}`
    set({
      normalizedImage: buildImage,
      selectionWorkingImage: selectionImage,
      referenceId: newReferenceId,
      selection: null,
      basePattern: null,
      pattern: null,
      buildArtifact: null,
      buildStatus: 'idle',
      buildError: null,
      buildLockHash: null,
      hoverRegionId: null,
      activeRegionId: null,
      doneRegionIds: [],
      doneRegionLockHash: null,
      manualEdits: {},
      compositionLocked: false,
    })
  },
  setFabricSetup: (config) =>
    set((state) => {
      if (state.compositionLocked) {
        return {}
      }
      const nextFabricSetup: FabricSetup = {
        ...state.fabricSetup,
        ...config,
        hoop: {
          ...state.fabricSetup.hoop,
          ...(config.hoop ?? {}),
        },
      }
      return {
        fabricSetup: nextFabricSetup,
        processingConfig: {
          ...state.processingConfig,
          fabricColor: nextFabricSetup.color,
        },
      }
    }),
  setReferencePlacement: (referencePlacement) =>
    set((state) => {
      if (state.compositionLocked) {
        return {}
      }
      return { referencePlacement }
    }),
  setCompositionLocked: (compositionLocked) => set({ compositionLocked }),
  setSelection: (selection) => set((state) => {
    if (selection && state.selectionWorkingImage && state.referenceId) {
      if (process.env.NODE_ENV === 'development') {
        SelectionArtifactModel.assertValid(
          selection,
          state.selectionWorkingImage.width,
          state.selectionWorkingImage.height,
          state.referenceId
        )
      }
    }
    return {
      selection
    }
  }),
  setMaskConfig: (config) =>
    set((state) => ({
      maskConfig: { ...state.maskConfig, ...config },
    })),
  setMagicWandConfig: (config) =>
    set((state) => ({
      magicWandConfig: { ...state.magicWandConfig, ...config },
    })),
  setSelectionMode: (selectionMode) => set({ selectionMode }),
  setRefinementConfig: (config) =>
    set((state) => ({
      refinementConfig: { ...state.refinementConfig, ...config },
    })),
  setSelectionWorkspaceId: (selectionWorkspaceId) => set({ selectionWorkspaceId }),
  setPattern: (pattern) =>
    set((state) => ({
      basePattern: pattern,
      pattern: pattern ? applyManualEditsToPattern(pattern, editsArrayFromMap(state.manualEdits)) : pattern,
      buildArtifact: null,
      buildStatus: 'idle',
      buildError: null,
      buildLockHash: null,
      hoverRegionId: null,
      activeRegionId: null,
    })),
  setBuildArtifact: (artifact, status = artifact ? 'ready' : 'idle') =>
    set((state) => {
      const nextLockHash = artifact?.lockHash ?? null
      const sourceDoneIds = state.doneRegionLockHash === nextLockHash ? state.doneRegionIds : []
      const validDoneIds = artifact
        ? sourceDoneIds.filter((id) => id > 0 && id <= artifact.regions.length)
        : []
      return {
        buildArtifact: artifact,
        buildStatus: status,
        buildError: null,
        buildLockHash: nextLockHash,
        doneRegionIds: validDoneIds,
        doneRegionLockHash: nextLockHash,
        hoverRegionId: artifact && state.hoverRegionId && state.hoverRegionId <= artifact.regions.length ? state.hoverRegionId : null,
        activeRegionId: artifact && state.activeRegionId && state.activeRegionId <= artifact.regions.length ? state.activeRegionId : null,
      }
    }),
  setBuildStatus: (buildStatus, error = null) => set({ buildStatus, buildError: error }),
  setHoverRegionId: (hoverRegionId) => set({ hoverRegionId }),
  setActiveRegionId: (activeRegionId) => set({ activeRegionId }),
  toggleRegionDone: (id) =>
    set((state) => {
      if (!state.buildArtifact || id <= 0 || id > state.buildArtifact.regions.length) return {}
      const next = new Set(state.doneRegionIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return {
        doneRegionIds: Array.from(next).sort((a, b) => a - b),
        doneRegionLockHash: state.buildArtifact.lockHash,
      }
    }),
  setDoneRegionIds: (ids, lockHash) =>
    set((state) => {
      const artifact = state.buildArtifact
      const usable = artifact && artifact.lockHash === lockHash
        ? ids.filter((id) => id > 0 && id <= artifact.regions.length)
        : []
      return {
        doneRegionIds: usable,
        doneRegionLockHash: lockHash,
      }
    }),
  setManualEdits: (edits) =>
    set((state) => {
      const manualEdits = mergeManualEdits({}, edits)
      return {
        manualEdits,
        pattern: state.basePattern ? applyManualEditsToPattern(state.basePattern, editsArrayFromMap(manualEdits)) : state.pattern,
      }
    }),
  applyManualEdits: (edits) =>
    set((state) => {
      const manualEdits = mergeManualEdits(state.manualEdits, edits)
      return {
        manualEdits,
        pattern: state.basePattern ? applyManualEditsToPattern(state.basePattern, editsArrayFromMap(manualEdits)) : state.pattern,
      }
    }),
  clearManualEdits: () =>
    set((state) => ({
      manualEdits: {},
      pattern: state.basePattern,
    })),
  setManualEditTool: (manualEditTool) => set({ manualEditTool }),
  setProcessingConfig: (config) =>
    set((state) => ({
      processingConfig: { ...state.processingConfig, ...config },
    })),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setError: (error) => set({ error }),
  reset: () =>
    set((state) => {
      state.originalImage?.close()
      return {
        originalImage: null,
        normalizedImage: null,
        selectionWorkingImage: null,
        referenceId: null,
        referencePlacement: null,
        compositionLocked: false,
        selection: null,
        basePattern: null,
        pattern: null,
        buildArtifact: null,
        buildStatus: 'idle',
        buildError: null,
        buildLockHash: null,
        hoverRegionId: null,
        activeRegionId: null,
        doneRegionIds: [],
        doneRegionLockHash: null,
        manualEdits: {},
        manualEditTool: 'paint',
        isProcessing: false,
        error: null,
      }
    }),
}))

export function selectIsAppBusy(state: PatternState): boolean {
  return state.isProcessing || state.buildStatus === 'building'
}
