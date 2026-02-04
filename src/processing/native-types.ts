/**
 * TypeScript interfaces matching the Rust embroidery processing structs.
 * These types are used for IPC communication with the Tauri backend.
 */

/** DMC thread metadata */
export interface NativeDmcMetadata {
  code: string
  name: string
  hex: string
}

/** A single stitch in the pattern grid */
export interface NativeStitch {
  x: number
  y: number
  dmc_code: string
  marker: string
  hex: string
}

/** Color mapping from original to DMC */
export interface NativeColorMapping {
  original_hex: string
  mapped_hex: string
  dmc: NativeDmcMetadata
}

/** Legend entry with stitch statistics */
export interface NativeLegendEntry {
  dmc_code: string
  name: string
  hex: string
  stitch_count: number
  coverage: number
}

/** Complete pattern result from native processing */
export interface NativePatternResult {
  width: number
  height: number
  stitches: NativeStitch[]
  palette: string[]
  dmc_palette: string[]
  legend: NativeLegendEntry[]
  color_mappings: NativeColorMapping[]
  total_stitches: number
  processing_time_ms: number
}

/** Processing configuration for native backend */
export interface NativeProcessingConfig {
  color_count: number
  use_dmc_palette: boolean
  smoothing_amount: number
  simplify_amount: number
  min_region_size: number
}

/** Default processing configuration */
export const DEFAULT_NATIVE_CONFIG: NativeProcessingConfig = {
  color_count: 16,
  use_dmc_palette: true,
  smoothing_amount: 0.3,
  simplify_amount: 0.2,
  min_region_size: 4,
}
