import { create } from 'zustand'
import { Pattern } from '@/model/Pattern'
import type { ProcessingConfig, MaskConfig } from '@/types'

interface PatternState {
  originalImage: ImageBitmap | null
  normalizedImage: ImageData | null
  stitchMask: Uint8Array | null
  maskConfig: MaskConfig
  pattern: Pattern | null
  processingConfig: ProcessingConfig
  isProcessing: boolean
  error: string | null
  setOriginalImage: (image: ImageBitmap) => void
  setNormalizedImage: (image: ImageData) => void
  setStitchMask: (mask: Uint8Array | null) => void
  setMaskConfig: (config: Partial<MaskConfig>) => void
  setPattern: (pattern: Pattern | null) => void
  setProcessingConfig: (config: Partial<ProcessingConfig>) => void
  setIsProcessing: (isProcessing: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const usePatternStore = create<PatternState>((set) => ({
  originalImage: null,
  normalizedImage: null,
  stitchMask: null,
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
  setNormalizedImage: (image) => set({ normalizedImage: image, stitchMask: null }),
  setStitchMask: (mask) => set({ stitchMask: mask }),
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
        stitchMask: null,
        pattern: null,
        isProcessing: false,
        error: null,
      }
    }),
}))
