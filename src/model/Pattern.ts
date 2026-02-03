import type { DmcMetadata, LegendEntry, PaletteMappingEntry, ProcessingConfig, Stitch, RGBColor, SelectionArtifact } from '@/types'
import { mapPaletteToDmc } from '@/palette/matcher'
import { quantizeImageToPalette } from '@/processing/pattern-pipeline'
import { linearRgbToOkLab, okLabDistanceSqWeighted } from '@/processing/color-spaces'
import { SelectionArtifactModel } from '@/model/SelectionArtifact'

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
  labels: Uint16Array | null
  paletteHex: string[] | null
  referenceId: string | null
  selection: SelectionArtifact | null

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
      labels?: Uint16Array | null
      paletteHex?: string[] | null
      referenceId?: string | null
      selection?: SelectionArtifact | null
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
    this.labels = options?.labels ?? null
    this.paletteHex = options?.paletteHex ?? null
    this.referenceId = options?.referenceId ?? null
    this.selection = options?.selection ?? null
  }

  getLegend(options?: { fabricConfig?: { fabricColor: RGBColor, stitchThreshold: number } }): LegendEntry[] {
    const counts = new Map<string, number>()
    const isMappedToDmc = this.activePaletteMode === 'dmc'
    const totalStitches = this.stitches.length || 1
    const originalsByMappedHex = new Map<string, string[]>()

    this.mappingTable.forEach((entry) => {
      const originals = originalsByMappedHex.get(entry.mappedHex) ?? []
      originals.push(entry.originalHex)
      originalsByMappedHex.set(entry.mappedHex, originals)
    })

    const fabricIndices = this.getFabricIndices(options?.fabricConfig)

    this.stitches.forEach((stitch, i) => {
      // If mask exists and this pixel is not masked, it's fabric
      const isExplicitFabric = this.selection?.mask && this.selection.mask[i] === 0
      const stitchHex = normalizeHex(stitch.hex)

      if (!isExplicitFabric) {
        counts.set(stitchHex, (counts.get(stitchHex) || 0) + 1)
      }
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

    const legend: LegendEntry[] = orderedHexes
      .map((hex) => {
        const stitchCount = counts.get(hex) ?? 0
        const dmc = this.dmcMetadataByMappedHex[hex]
        const mappedFromCount = mappedFromCountByHex.get(hex) ?? 0
        const mappedFromHexes = mappedFromHexesByHex.get(hex) ?? []

        const isFabric = fabricIndices.has(this.rawPalette.indexOf(hex))

        return {
          dmcCode: isFabric ? 'Fabric' : (dmc?.code ?? this.stitches.find((s) => normalizeHex(s.hex) === hex)?.dmcCode ?? hex),
          name: isFabric ? 'Fabric (no stitch)' : (dmc?.name ?? 'Quantized Color'),
          hex,
          rawHex: isMappedToDmc ? hex : hex,
          mappedHex: isMappedToDmc ? hex : null,
          isMappedToDmc: isFabric ? false : isMappedToDmc,
          coverage: stitchCount / totalStitches,
          stitchCount,
          markerReused: false,
          mappedFromCount: isMappedToDmc ? mappedFromCount : undefined,
          mappedFromHexes: isMappedToDmc ? mappedFromHexes : undefined,
        }
      })

    // Add a virtual entry for Fabric if there are masked-out pixels
    const totalCountedStitches = Array.from(counts.values()).reduce((a, b) => a + b, 0)
    if (totalCountedStitches < totalStitches) {
      const fabricCount = totalStitches - totalCountedStitches
      legend.push({
        dmcCode: 'Fabric',
        name: 'Fabric (no stitch)',
        hex: '#FFFFFF', // Dummy hex, will be replaced by fabric color in viewer
        rawHex: '#FFFFFF',
        mappedHex: null,
        isMappedToDmc: false,
        coverage: fabricCount / totalStitches,
        stitchCount: fabricCount,
        markerReused: false
      })
    }

    return legend
  }

  private getFabricIndices(config?: { fabricColor: RGBColor, stitchThreshold: number }): Set<number> {
    const fabricIndices = new Set<number>()
    if (!config || !this.paletteHex) return fabricIndices

    const fabricOkLab = linearRgbToOkLab(srgbToLinear(config.fabricColor.r), srgbToLinear(config.fabricColor.g), srgbToLinear(config.fabricColor.b))
    const thresholdSq = config.stitchThreshold * config.stitchThreshold

    this.rawPalette.forEach((hex, idx) => {
      const rgb = hexToRgb(hex)
      const lab = linearRgbToOkLab(srgbToLinear(rgb.r), srgbToLinear(rgb.g), srgbToLinear(rgb.b))
      const distSq = okLabDistanceSqWeighted(lab[0], lab[1], lab[2], fabricOkLab[0], fabricOkLab[1], fabricOkLab[2], 1.35)
      if (distSq < thresholdSq) fabricIndices.add(idx)
    })
    return fabricIndices
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
      labels: this.labels,
      paletteHex: mapping.mappedPalette || this.paletteHex,
      referenceId: this.referenceId,
      selection: this.selection,
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

  static fromImageData(image: ImageData, config: ProcessingConfig, selection?: SelectionArtifact | null): Pattern {
    if (selection && selection.referenceId) {
      if (process.env.NODE_ENV === 'development') {
        SelectionArtifactModel.assertValid(selection, image.width, image.height, selection.referenceId)
      }
    }

    const mask = selection?.mask
    const { labels, paletteHex } = quantizeImageToPalette(image, {
      colorCount: config.colorCount,
      ditherMode: config.ditherMode,
      smoothingAmount: config.smoothingAmount,
      simplifyAmount: config.simplifyAmount,
      minRegionSize: config.minRegionSize,
    }, mask)

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

        // Use mask to force non-stitched pixels to fabric
        const isFabric = mask && mask[i] === 0
        const hex = isFabric ? '#FFFFFF00' : (rawPalette[paletteIndex] ?? '#000000')

        stitches.push({
          x,
          y,
          dmcCode: isFabric ? 'Fabric' : `RAW-${paletteIndex + 1}`,
          marker: isFabric ? '' : (markerByPaletteIndex[paletteIndex] ?? markers[0]),
          hex: isFabric ? '#FFFFFF' : hex,
        })
      }
    }

    if (selection && selection.referenceId) {
      if (process.env.NODE_ENV === 'development') {
        SelectionArtifactModel.assertValid(selection, image.width, image.height, selection.referenceId)
        SelectionArtifactModel.validateConsistency(selection, stitches.filter(s => s.dmcCode !== 'Fabric').length, image.width * image.height)
      }
    }

    return new Pattern(stitches, image.width, image.height, {
      rawPalette,
      mappedPalette: null,
      activePaletteMode: 'raw',
      labels,
      paletteHex: rawPalette,
      referenceId: selection?.referenceId ?? null,
      selection,
    })
  }
}

function uniqueHexesFromStitches(stitches: Stitch[]): string[] {
  return Array.from(new Set(stitches.map((stitch) => normalizeHex(stitch.hex))))
}

function normalizeHex(hex: string): string {
  return hex.startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

function srgbToLinear(v: number): number {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
