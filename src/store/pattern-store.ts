import { create } from 'zustand'
import { Pattern } from '@/model/Pattern'
import type { ProcessingConfig } from '@/types'

interface PatternState {
  originalImage: ImageBitmap | null
  normalizedImage: ImageData | null
  pattern: Pattern | null
  processingConfig: ProcessingConfig
  isProcessing: boolean
  error: string | null
  setOriginalImage: (image: ImageBitmap) => void
  setNormalizedImage: (image: ImageData) => void
  setPattern: (pattern: Pattern) => void
  setProcessingConfig: (config: Partial<ProcessingConfig>) => void
  setIsProcessing: (isProcessing: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const usePatternStore = create<PatternState>((set) => ({
  originalImage: null,
  normalizedImage: null,
  pattern: null,
  processingConfig: {
    colorCount: 20,
    ditherMode: 'none',
    targetSize: 150,
  },
  isProcessing: false,
  error: null,
  setOriginalImage: (image) =>
    set((state) => {
      state.originalImage?.close()
      return { originalImage: image }
    }),
  setNormalizedImage: (image) => set({ normalizedImage: image }),
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
        pattern: null,
        isProcessing: false,
        error: null,
      }
    }),
}))
