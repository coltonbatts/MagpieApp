import { create } from 'zustand'
import { Pattern } from '@/model/Pattern'
import { PROCESSING } from '@/lib/constants'
import type {
  FabricSetup,
  ProcessingConfig,
  MaskConfig,
  ReferencePlacement,
  SelectionArtifact,
} from '@/types'
import { SelectionArtifactModel } from '@/model/SelectionArtifact'

interface PatternState {
  referenceId: string | null
  originalImage: ImageBitmap | null
  normalizedImage: ImageData | null // Build working resolution
  selectionWorkingImage: ImageData | null // SelectStage working resolution
  fabricSetup: FabricSetup
  referencePlacement: ReferencePlacement | null
  selection: SelectionArtifact | null
  maskConfig: MaskConfig
  pattern: Pattern | null
  processingConfig: ProcessingConfig
  isProcessing: boolean
  error: string | null
  setOriginalImage: (image: ImageBitmap) => void
  setSourceImages: (buildImage: ImageData, selectionImage: ImageData) => void
  setFabricSetup: (config: Partial<FabricSetup>) => void
  setReferencePlacement: (placement: ReferencePlacement | null) => void
  setSelection: (selection: SelectionArtifact | null) => void
  setMaskConfig: (config: Partial<MaskConfig>) => void
  setPattern: (pattern: Pattern | null) => void
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
    texture: 'natural',
    count: 14,
    color: { r: 245, g: 245, b: 220 },
    hoop: {
      presetId: 'round-150',
      label: 'Round 150mm',
      shape: 'round',
      widthMm: 150,
      heightMm: 150,
    },
  },
  referencePlacement: null,
  selection: null,
  maskConfig: {
    brushSize: 20,
    opacity: 0.5,
  },
  pattern: null,
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
    })
  },
  setFabricSetup: (config) =>
    set((state) => {
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
  setReferencePlacement: (referencePlacement) => set({ referencePlacement }),
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
  setPattern: (pattern) => set({ pattern }),
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
        selection: null,
        pattern: null,
        isProcessing: false,
        error: null,
      }
    }),
}))
