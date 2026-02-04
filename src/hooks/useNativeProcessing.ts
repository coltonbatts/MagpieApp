/**
 * Hook for native Rust-based embroidery pattern processing.
 *
 * This hook provides a bridge between the React frontend and the Tauri/Rust backend
 * for high-performance image processing. On desktop (Tauri), it offloads the heavy
 * computation to native Rust with rayon parallelization. On web, it falls back to
 * the JavaScript implementation.
 */

import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ProcessingConfig, SelectionArtifact, Stitch } from '@/types'
import { Pattern } from '@/model/Pattern'
import type {
  NativePatternResult,
  NativeProcessingConfig,
  NativeStitch,
} from '@/processing/native-types'

/** Check if running in Tauri desktop environment */
function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Convert frontend ProcessingConfig to native config format */
function toNativeConfig(config: ProcessingConfig): NativeProcessingConfig {
  return {
    color_count: config.colorCount,
    use_dmc_palette: config.useDmcPalette,
    smoothing_amount: config.smoothingAmount,
    simplify_amount: config.simplifyAmount,
    min_region_size: config.minRegionSize,
  }
}

/** Convert native stitch to frontend Stitch format */
function convertStitch(native: NativeStitch): Stitch {
  return {
    x: native.x,
    y: native.y,
    dmcCode: native.dmc_code,
    marker: native.marker,
    hex: native.hex,
  }
}

/** Convert ImageData to raw bytes for IPC */
async function imageDataToBytes(imageData: ImageData): Promise<Uint8Array> {
  // Create a canvas to encode the image
  const canvas = new OffscreenCanvas(imageData.width, imageData.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas context')

  ctx.putImageData(imageData, 0, 0)

  // Encode as PNG for lossless transfer
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

/** Convert File to raw bytes */
async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

export interface UseNativeProcessingResult {
  /** Whether native processing is available (Tauri desktop) */
  isAvailable: boolean

  /** Whether processing is currently in progress */
  isProcessing: boolean

  /** Last processing time in milliseconds */
  processingTimeMs: number | null

  /** Last error message if processing failed */
  error: string | null

  /**
   * Process an image using native Rust backend.
   * Returns a Pattern instance compatible with the existing frontend.
   */
  processImage: (
    imageData: ImageData,
    config: ProcessingConfig,
    selection?: SelectionArtifact | null
  ) => Promise<Pattern | null>

  /**
   * Process an image file using native Rust backend.
   * Useful when the image is already loaded as a File object.
   */
  processFile: (
    file: File,
    config: ProcessingConfig,
    mask?: Uint8Array | null
  ) => Promise<Pattern | null>

  /**
   * Process an image from a file path using native Rust backend.
   * Most efficient when the image is already on disk.
   */
  processPath: (
    filePath: string,
    config: ProcessingConfig,
    mask?: Uint8Array | null
  ) => Promise<Pattern | null>
}

export function useNativeProcessing(): UseNativeProcessingResult {
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isAvailable = isTauriEnvironment()

  const convertResultToPattern = useCallback(
    (result: NativePatternResult, selection?: SelectionArtifact | null): Pattern => {
      const stitches = result.stitches.map(convertStitch)

      // Build DMC metadata map
      const dmcMetadataByMappedHex: Record<string, { code: string; name: string; hex: string }> = {}
      for (const mapping of result.color_mappings) {
        dmcMetadataByMappedHex[mapping.mapped_hex] = {
          code: mapping.dmc.code,
          name: mapping.dmc.name,
          hex: mapping.dmc.hex,
        }
      }

      // Build mapping table
      const mappingTable = result.color_mappings.map((m) => ({
        originalHex: m.original_hex,
        mappedHex: m.mapped_hex,
        dmc: {
          code: m.dmc.code,
          name: m.dmc.name,
          hex: m.dmc.hex,
        },
      }))

      return new Pattern(stitches, result.width, result.height, {
        rawPalette: result.palette,
        mappedPalette: result.dmc_palette,
        activePaletteMode: 'dmc',
        mappingTable,
        dmcMetadataByMappedHex,
        labels: null, // Not needed when stitches are already computed
        paletteHex: result.dmc_palette,
        referenceId: selection?.referenceId ?? null,
        selection: selection ?? null,
      })
    },
    []
  )

  const processImage = useCallback(
    async (
      imageData: ImageData,
      config: ProcessingConfig,
      selection?: SelectionArtifact | null
    ): Promise<Pattern | null> => {
      if (!isAvailable) {
        setError('Native processing not available (not running in Tauri)')
        return null
      }

      setIsProcessing(true)
      setError(null)

      try {
        const imageBytes = await imageDataToBytes(imageData)
        const nativeConfig = toNativeConfig(config)


        const result = await invoke<NativePatternResult>('process_embroidery_pattern', {
          imageBytes,
          config: nativeConfig,
          mask: selection?.mask ?? null,
        })

        setProcessingTimeMs(result.processing_time_ms)
        return convertResultToPattern(result, selection)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        console.error('Native processing failed:', err)
        return null
      } finally {
        setIsProcessing(false)
      }
    },
    [isAvailable, convertResultToPattern]
  )

  const processFile = useCallback(
    async (
      file: File,
      config: ProcessingConfig,
      mask?: Uint8Array | null
    ): Promise<Pattern | null> => {
      if (!isAvailable) {
        setError('Native processing not available (not running in Tauri)')
        return null
      }

      setIsProcessing(true)
      setError(null)

      try {
        const imageBytes = await fileToBytes(file)
        const nativeConfig = toNativeConfig(config)

        const result = await invoke<NativePatternResult>('process_embroidery_pattern', {
          imageBytes,
          config: nativeConfig,
          mask: mask ?? null,
        })

        setProcessingTimeMs(result.processing_time_ms)
        return convertResultToPattern(result)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        console.error('Native processing failed:', err)
        return null
      } finally {
        setIsProcessing(false)
      }
    },
    [isAvailable, convertResultToPattern]
  )

  const processPath = useCallback(
    async (
      filePath: string,
      config: ProcessingConfig,
      mask?: Uint8Array | null
    ): Promise<Pattern | null> => {
      if (!isAvailable) {
        setError('Native processing not available (not running in Tauri)')
        return null
      }

      setIsProcessing(true)
      setError(null)

      try {
        const nativeConfig = toNativeConfig(config)

        const result = await invoke<NativePatternResult>('process_embroidery_pattern_from_file', {
          filePath,
          config: nativeConfig,
          mask: mask ? Array.from(mask) : null,
        })

        setProcessingTimeMs(result.processing_time_ms)
        return convertResultToPattern(result)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        console.error('Native processing failed:', err)
        return null
      } finally {
        setIsProcessing(false)
      }
    },
    [isAvailable, convertResultToPattern]
  )

  return {
    isAvailable,
    isProcessing,
    processingTimeMs,
    error,
    processImage,
    processFile,
    processPath,
  }
}
