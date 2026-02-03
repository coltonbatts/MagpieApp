import type { DmcMetadata, LegendEntry, PaletteMappingEntry, ProcessingConfig, Stitch } from '@/types'
import { mapPaletteToDmc } from '@/palette/matcher'
import { quantizeImageToPalette } from '@/processing/pattern-pipeline'

// Pattern is the immutable stitch-grid output of quantization:
// one stitch per pixel in the normalized source image.
export class Pattern {
  stitches: Stitch[]
  width: number
  height: number
  rawPalette: string[]
  mappedPalette: string[] | null
  activePaletteMode: 'raw' | 'dmc'
  mappingTable: PaletteMappingEntry[]
  dmcMetadataByMappedHex: Record<string, DmcMetadata>

  constructor(
    stitches: Stitch[],
    width: number,
    height: number,
    options?: {
      rawPalette?: string[]
      mappedPalette?: string[] | null
      activePaletteMode?: 'raw' | 'dmc'
      mappingTable?: PaletteMappingEntry[]
      dmcMetadataByMappedHex?: Record<string, DmcMetadata>
    }
  ) {
    this.stitches = stitches
    this.width = width
    this.height = height
    this.rawPalette = options?.rawPalette ?? uniqueHexesFromStitches(stitches)
    this.mappedPalette = options?.mappedPalette ?? null
    this.activePaletteMode = options?.activePaletteMode ?? 'raw'
    this.mappingTable = options?.mappingTable ?? []
    this.dmcMetadataByMappedHex = options?.dmcMetadataByMappedHex ?? {}
  }

  getLegend(): LegendEntry[] {
    const counts = new Map<string, number>()
    const isMappedToDmc = this.activePaletteMode === 'dmc'
    const totalStitches = this.stitches.length || 1
    const originalsByMappedHex = new Map<string, string[]>()

    this.mappingTable.forEach((entry) => {
      const originals = originalsByMappedHex.get(entry.mappedHex) ?? []
      originals.push(entry.originalHex)
      originalsByMappedHex.set(entry.mappedHex, originals)
    })

    this.stitches.forEach((stitch) => {
      const stitchHex = normalizeHex(stitch.hex)
      counts.set(stitchHex, (counts.get(stitchHex) || 0) + 1)
    })

    const mappedFromCountByHex = new Map<string, number>()
    const mappedFromHexesByHex = new Map<string, string[]>()
    originalsByMappedHex.forEach((originals, mappedHex) => {
      const uniqueOriginals = Array.from(new Set(originals))
      mappedFromCountByHex.set(mappedHex, uniqueOriginals.length)
      mappedFromHexesByHex.set(mappedHex, uniqueOriginals)
    })

    const paletteOrder = (this.activePaletteMode === 'dmc' ? this.mappedPalette : this.rawPalette) ?? []
    const orderedHexes = paletteOrder.length
      ? paletteOrder.map((hex) => normalizeHex(hex)).filter((hex) => counts.has(hex))
      : Array.from(counts.keys())

    return orderedHexes
      .map((hex) => {
        const stitchCount = counts.get(hex) ?? 0
        const dmc = this.dmcMetadataByMappedHex[hex]
        const mappedFromCount = mappedFromCountByHex.get(hex) ?? 0
        const mappedFromHexes = mappedFromHexesByHex.get(hex) ?? []

        return {
          dmcCode: dmc?.code ?? this.stitches.find((s) => normalizeHex(s.hex) === hex)?.dmcCode ?? hex,
          name: dmc?.name ?? 'Quantized Color',
          hex,
          rawHex: isMappedToDmc ? hex : hex,
          mappedHex: isMappedToDmc ? hex : null,
          isMappedToDmc,
          coverage: stitchCount / totalStitches,
          stitchCount,
          markerReused: false, // TODO: detect marker reuse
          mappedFromCount: isMappedToDmc ? mappedFromCount : undefined,
          mappedFromHexes: isMappedToDmc ? mappedFromHexes : undefined,
        }
      })
  }

  getStitchCount(dmcCode: string): number {
    return this.stitches.filter((s) => s.dmcCode === dmcCode).length
  }

  withDmcPaletteMapping(): Pattern {
    const mapping = mapPaletteToDmc(this.rawPalette)
    const mappedStitches = this.stitches.map((stitch) => {
      const originalHex = normalizeHex(stitch.hex)
      const mappedHex = mapping.originalToMapped[originalHex] ?? originalHex
      const dmc = mapping.dmcMetadataByMappedHex[mappedHex]

      return {
        ...stitch,
        hex: mappedHex,
        dmcCode: dmc?.code ?? stitch.dmcCode,
      }
    })

    return new Pattern(mappedStitches, this.width, this.height, {
      rawPalette: this.rawPalette,
      mappedPalette: mapping.mappedPalette,
      activePaletteMode: 'dmc',
      mappingTable: mapping.mappingTable,
      dmcMetadataByMappedHex: mapping.dmcMetadataByMappedHex,
    })
  }

  // Generate mock pattern for testing
  static createMock(size: number = 10): Pattern {
    const stitches: Stitch[] = []
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF']
    const markers = ['S', 'O', 'T', '*', 'D']

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const colorIndex = Math.floor(Math.random() * colors.length)
        stitches.push({
          x,
          y,
          dmcCode: `DMC-${colorIndex}`,
          marker: markers[colorIndex],
          hex: colors[colorIndex],
        })
      }
    }

    return new Pattern(stitches, size, size, {
      rawPalette: colors,
    })
  }

  // `image` is expected to be normalized upstream to the target stitch grid size.
  // If source alpha exists, we composite against white so transparent pixels are deterministic.
  static fromImageData(image: ImageData, colorCount: number): Pattern
  static fromImageData(image: ImageData, config: ProcessingConfig): Pattern
  static fromImageData(image: ImageData, arg: number | ProcessingConfig): Pattern {
    const config: ProcessingConfig =
      typeof arg === 'number'
        ? {
            colorCount: arg,
            ditherMode: 'none',
            targetSize: Math.min(image.width, image.height),
            useDmcPalette: false,
            smoothingAmount: 0,
            simplifyAmount: 0,
            minRegionSize: 1,
          }
        : arg

    const { labels, paletteHex } = quantizeImageToPalette(image, {
      colorCount: config.colorCount,
      ditherMode: config.ditherMode,
      smoothingAmount: config.smoothingAmount,
      simplifyAmount: config.simplifyAmount,
      minRegionSize: config.minRegionSize,
    })

    const stitches: Stitch[] = []
    const markers = ['S', 'O', 'T', '*', 'D', 'X', '+', '#', '%', '@']
    const rawPalette = paletteHex
    const markerByPaletteIndex = new Array(rawPalette.length)
      .fill(null)
      .map((_, index) => markers[index % markers.length])

    for (let y = 0; y < image.height; y += 1) {
      const yOff = y * image.width
      for (let x = 0; x < image.width; x += 1) {
        const i = yOff + x
        const paletteIndex = labels[i]
        const hex = rawPalette[paletteIndex] ?? '#000000'
        stitches.push({
          x,
          y,
          dmcCode: `RAW-${paletteIndex + 1}`,
          marker: markerByPaletteIndex[paletteIndex] ?? markers[0],
          hex,
        })
      }
    }

    return new Pattern(stitches, image.width, image.height, {
      rawPalette,
      mappedPalette: null,
      activePaletteMode: 'raw',
    })
  }
}

function uniqueHexesFromStitches(stitches: Stitch[]): string[] {
  return Array.from(new Set(stitches.map((stitch) => normalizeHex(stitch.hex))))
}

function normalizeHex(hex: string): string {
  return hex.startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`
}
