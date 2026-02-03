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
  targetSize: number // shortest side in pixels
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
