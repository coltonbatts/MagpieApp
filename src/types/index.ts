// Core type definitions used across the app

export interface RGBColor {
  r: number
  g: number
  b: number
}

export interface LABColor {
  L: number
  a: number
  b: number
}

export interface DMCColor {
  code: string
  name: string
  hex: string
  rgb: [number, number, number]
  lab: [number, number, number] // Precomputed
}

export interface Stitch {
  x: number
  y: number
  dmcCode: string
  marker: string
  hex: string
}

export interface DmcMetadata {
  code: string
  name: string
  hex: string
}

export interface PaletteMappingEntry {
  originalHex: string
  mappedHex: string
  dmc: DmcMetadata
}

export interface LegendEntry {
  dmcCode: string
  name: string
  hex: string
  rawHex: string
  mappedHex: string | null
  isMappedToDmc: boolean
  coverage: number
  stitchCount: number
  markerReused: boolean
  mappedFromCount?: number
  mappedFromHexes?: string[]
}

export interface ProcessingConfig {
  colorCount: number
  ditherMode: 'none' | 'bayer' | 'floyd-steinberg'
  targetSize: number // shortest side in pixels for Build quantization
  selectionWorkingSize: number // shortest side in pixels for SelectStage editing
  selectionMaxMegapixels: number // hard cap to protect memory during selection
  useDmcPalette: boolean
  smoothingAmount: number // 0..1
  simplifyAmount: number // 0..1
  minRegionSize: number // pixels (connected component size)
  fabricColor: RGBColor
  stitchThreshold: number // 0..1 (distance to fabric color)
  organicPreview: boolean
}

export interface ViewerConfig {
  showGrid: boolean
  showMarkers: boolean
  showFabric: boolean
  showOutlines: boolean
  showLabels: boolean
  zoomMin: number
  zoomMax: number
}

export interface ExportOptions {
  format: 'pdf' | 'png-clean' | 'png-marked' | 'svg'
  pageSize?: 'A4' | 'A3' | 'Letter'
  includeMarkers?: boolean
  includeGrid?: boolean
  includeLegend?: boolean
  stitchSizePx?: number
}
export type WorkflowStage = 'Fabric' | 'Reference' | 'Select' | 'Build' | 'Export'

export type HoopShape = 'round' | 'oval' | 'square'

export interface HoopConfig {
  presetId: string
  label: string
  shape: HoopShape
  widthMm: number
  heightMm: number
  marginMm: number
}

export interface FabricSetup {
  type: 'linen' | 'cotton' | 'muslin' | 'aida' | 'evenweave'
  textureIntensity: number // 0..1
  count: number // 10..40 (coarse to fine)
  color: RGBColor
  hoop: HoopConfig
}

export interface ReferencePlacement {
  x: number
  y: number
  width: number
  height: number
}

export interface MaskConfig {
  brushSize: number
  opacity: number
}

export interface MagicWandConfig {
  tolerance: number
  edgeStop: number
}

export interface RefinementConfig {
  strength: number // 0..100
}

/**
 * SelectionArtifact is the definitive representation of WHAT is being stitched.
 * It is produced in SelectStage and consumed by Build/Export.
 */
export interface SelectionArtifact {
  id: string // Unique ID for this selection version
  referenceId: string // Must match the source image ID
  mask: Uint8Array
  width: number
  height: number
  isDefault: boolean // True if it's the initial "select all" mask
}

export type ManualStitchEditMode = 'paint' | 'fabric'

export interface ManualStitchEdit {
  x: number
  y: number
  mode: ManualStitchEditMode
  hex?: string
  dmcCode?: string
  marker?: string
}

export type ManualStitchEdits = Record<string, ManualStitchEdit>

export interface GridPoint {
  x: number
  y: number
}

export interface PatternRegion {
  id: number
  number: number
  colorIndex: number
  colorKey: string
  dmcCode: string
  hex: string
  area: number
  minX: number
  minY: number
  centroidX: number
  centroidY: number
  loops: GridPoint[][]
}

export interface RegionBBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface BuildRegion {
  id: number
  colorIndex: number
  colorKey: string
  dmcCode: string
  hex: string
  bbox: RegionBBox
  area: number
}

export interface BuildArtifact {
  lockHash: string
  width: number
  height: number
  regions: BuildRegion[]
  pixelRegionId: Uint32Array
  regionsByColor: number[][]
  labelPointByRegionId?: Array<GridPoint | null>
  adjacency?: number[][]
  allBoundarySegments?: number[]
  outlineSegmentsByRegionId?: Array<number[] | null>
}
