/**
 * Unified pattern processing API that automatically uses native Rust processing
 * on desktop (Tauri) and falls back to JavaScript processing on web.
 *
 * This provides a single entry point for pattern generation regardless of platform.
 */

import { invoke } from '@tauri-apps/api/core'
import type { ProcessingConfig, SelectionArtifact, Stitch } from '@/types'
import { Pattern } from '@/model/Pattern'
import type { NativePatternResult, NativeProcessingConfig } from './native-types'

/** Check if running in Tauri desktop environment */
export function isNativeAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Convert frontend config to native format */
function toNativeConfig(config: ProcessingConfig): NativeProcessingConfig {
  return {
    color_count: config.colorCount,
    use_dmc_palette: config.useDmcPalette,
    smoothing_amount: config.smoothingAmount,
    simplify_amount: config.simplifyAmount,
    min_region_size: config.minRegionSize,
  }
}

/** Convert ImageData to PNG bytes for efficient IPC */
async function imageDataToBytes(imageData: ImageData): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas context')

  ctx.putImageData(imageData, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

/** Convert native result to Pattern model */
function nativeResultToPattern(
  result: NativePatternResult,
  selection?: SelectionArtifact | null
): Pattern {
  const stitches: Stitch[] = result.stitches.map((s) => ({
    x: s.x,
    y: s.y,
    dmcCode: s.dmc_code,
    marker: s.marker,
    hex: s.hex,
  }))

  const dmcMetadataByMappedHex: Record<string, { code: string; name: string; hex: string }> = {}
  const mappingTable = result.color_mappings.map((m) => {
    dmcMetadataByMappedHex[m.mapped_hex] = {
      code: m.dmc.code,
      name: m.dmc.name,
      hex: m.dmc.hex,
    }
    return {
      originalHex: m.original_hex,
      mappedHex: m.mapped_hex,
      dmc: { code: m.dmc.code, name: m.dmc.name, hex: m.dmc.hex },
    }
  })

  return new Pattern(stitches, result.width, result.height, {
    rawPalette: result.palette,
    mappedPalette: result.dmc_palette,
    activePaletteMode: 'dmc',
    mappingTable,
    dmcMetadataByMappedHex,
    labels: null,
    paletteHex: result.dmc_palette,
    referenceId: selection?.referenceId ?? null,
    selection: selection ?? null,
  })
}

export interface ProcessPatternOptions {
  /** Image data to process */
  image: ImageData

  /** Processing configuration */
  config: ProcessingConfig

  /** Optional selection/mask */
  selection?: SelectionArtifact | null

  /** Force JavaScript processing even on desktop */
  forceJavaScript?: boolean
}

export interface ProcessPatternResult {
  /** The generated pattern */
  pattern: Pattern

  /** Processing time in milliseconds */
  processingTimeMs: number

  /** Whether native processing was used */
  usedNative: boolean
}

/**
 * Process an image into an embroidery pattern.
 *
 * Automatically uses native Rust processing on desktop (Tauri) for maximum
 * performance, with fallback to JavaScript processing on web.
 *
 * On an M-series Mac, native processing is typically 5-10x faster than JavaScript
 * for large images due to rayon parallelization and native SIMD operations.
 */
export async function processPattern(
  options: ProcessPatternOptions
): Promise<ProcessPatternResult> {
  const { image, config, selection, forceJavaScript = false } = options

  const useNative = isNativeAvailable() && !forceJavaScript

  if (useNative) {
    try {
      const startTime = performance.now()
      const imageBytes = await imageDataToBytes(image)
      const nativeConfig = toNativeConfig(config)

      const result = await invoke<NativePatternResult>('process_embroidery_pattern', {
        imageBytes,
        config: nativeConfig,
        mask: selection?.mask ?? null,
      })

      const pattern = nativeResultToPattern(result, selection)
      const totalTime = performance.now() - startTime

      console.log(
        `[Native] Processed ${image.width}x${image.height} image in ${result.processing_time_ms}ms (total ${totalTime.toFixed(0)}ms including IPC)`
      )

      return {
        pattern,
        processingTimeMs: result.processing_time_ms,
        usedNative: true,
      }
    } catch (err) {
      console.warn('Native processing failed, falling back to JavaScript:', err)
      // Fall through to JavaScript processing
    }
  }

  // JavaScript fallback
  const startTime = performance.now()
  let pattern = Pattern.fromImageData(image, config, selection)

  if (config.useDmcPalette) {
    pattern = pattern.withDmcPaletteMapping()
  }

  const processingTimeMs = performance.now() - startTime

  console.log(
    `[JavaScript] Processed ${image.width}x${image.height} image in ${processingTimeMs.toFixed(0)}ms`
  )

  return {
    pattern,
    processingTimeMs,
    usedNative: false,
  }
}

/**
 * Process a File directly (more efficient than loading to ImageData first)
 */
export async function processPatternFromFile(
  file: File,
  config: ProcessingConfig,
  mask?: Uint8Array | null
): Promise<ProcessPatternResult> {
  if (isNativeAvailable()) {
    try {
      const imageBytes = new Uint8Array(await file.arrayBuffer())
      const nativeConfig = toNativeConfig(config)

      const result = await invoke<NativePatternResult>('process_embroidery_pattern', {
        imageBytes,
        config: nativeConfig,
        mask: mask ?? null,
      })

      const pattern = nativeResultToPattern(result)

      return {
        pattern,
        processingTimeMs: result.processing_time_ms,
        usedNative: true,
      }
    } catch (err) {
      console.warn('Native processing failed, falling back to JavaScript:', err)
    }
  }

  // JavaScript fallback: need to load as ImageData first
  const bitmap = await createImageBitmap(file)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas context')

  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)

  return processPattern({
    image: imageData,
    config,
    selection: mask
      ? {
        id: 'temp',
        referenceId: 'temp',
        mask,
        width: bitmap.width,
        height: bitmap.height,
        isDefault: false,
      }
      : null,
    forceJavaScript: true,
  })
}
