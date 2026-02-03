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

export interface LegendEntry {
  dmcCode: string
  name: string
  hex: string
  stitchCount: number
  markerReused: boolean
}

export interface ProcessingConfig {
  colorCount: number
  ditherMode: 'none' | 'bayer' | 'floyd-steinberg'
  targetSize: number // shortest side in pixels
}

export interface ViewerConfig {
  showGrid: boolean
  showMarkers: boolean
  zoomMin: number
  zoomMax: number
}

export interface ExportOptions {
  format: 'pdf' | 'png-clean' | 'png-marked' | 'svg'
  pageSize?: 'A4' | 'A3' | 'Letter'
  includeMarkers?: boolean
  includeGrid?: boolean
}
