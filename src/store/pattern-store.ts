import { create } from 'zustand'
import { Pattern } from '@/model/Pattern'
import type { ProcessingConfig, MaskConfig, SelectionArtifact } from '@/types'
import { SelectionArtifactModel } from '@/model/SelectionArtifact'

interface PatternState {
  referenceId: string | null
  originalImage: ImageBitmap | null
  normalizedImage: ImageData | null
  selection: SelectionArtifact | null
  maskConfig: MaskConfig
  pattern: Pattern | null
  processingConfig: ProcessingConfig
  isProcessing: boolean
  error: string | null
  setOriginalImage: (image: ImageBitmap) => void
  setNormalizedImage: (image: ImageData) => void
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
  selection: null,
  maskConfig: {
    brushSize: 20,
    opacity: 0.5,
  },
  pattern: null,
  processingConfig: {
    colorCount: 20,
    ditherMode: 'none',
    targetSize: 150,
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
  setNormalizedImage: (image) => {
    const newReferenceId = `ref_${Math.random().toString(36).substring(2, 9)}`
    set({
      normalizedImage: image,
      referenceId: newReferenceId,
      selection: null
    })
  },
  setSelection: (selection) => set((state) => {
    if (selection && state.normalizedImage && state.referenceId) {
      if (process.env.NODE_ENV === 'development') {
        SelectionArtifactModel.assertValid(
          selection,
          state.normalizedImage.width,
          state.normalizedImage.height,
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
        referenceId: null,
        selection: null,
        pattern: null,
        isProcessing: false,
        error: null,
      }
    }),
}))
