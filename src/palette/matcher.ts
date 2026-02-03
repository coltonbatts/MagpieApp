import type {
  DMCColor,
  DmcMetadata,
  LABColor,
  PaletteMappingEntry,
  RGBColor,
} from '@/types'
import { DMC_COLORS } from './dmc-colors'
import { deltaE76, deltaECMC, deltaE94 } from './color-distance'
import { hexToRgb, rgbToLab } from './color-conversion'

/**
 * Match a LAB color to the closest DMC thread color
 * Uses Delta-E CMC by default for best perceptual accuracy
 *
 * @param color LAB color to match
 * @param excludedCodes Optional array of DMC codes to exclude from matching
 * @param metric Distance metric to use (default: CMC)
 * @returns Closest DMC color match
 */
export function matchToDMC(
  color: LABColor,
  excludedCodes: string[] = [],
  metric: 'CIE76' | 'CIE94' | 'CMC' = 'CMC'
): DMCColor {
  // Filter out excluded colors
  const palette = excludedCodes.length > 0
    ? DMC_COLORS.filter((c) => !excludedCodes.includes(c.code))
    : DMC_COLORS

  if (palette.length === 0) {
    throw new Error('Cannot match to DMC: palette is empty after exclusions')
  }

  // Select distance function
  const distanceFunc =
    metric === 'CIE76' ? deltaE76 : metric === 'CIE94' ? deltaE94 : deltaECMC

  // Find closest color
  let minDistance = Infinity
  let closestColor = palette[0]

  palette.forEach((dmc) => {
    const dmcLab: LABColor = { L: dmc.lab[0], a: dmc.lab[1], b: dmc.lab[2] }
    const distance = distanceFunc(color, dmcLab)

    if (distance < minDistance) {
      minDistance = distance
      closestColor = dmc
    }
  })

  return closestColor
}

/**
 * Match an RGB color to the closest DMC thread color
 * Convenience wrapper that converts RGB to LAB first
 *
 * @param rgb RGB color to match
 * @param excludedCodes Optional array of DMC codes to exclude
 * @param metric Distance metric to use
 * @returns Closest DMC color match
 */
export function matchRGBToDMC(
  rgb: RGBColor,
  excludedCodes: string[] = [],
  metric: 'CIE76' | 'CIE94' | 'CMC' = 'CMC'
): DMCColor {
  const lab = rgbToLab(rgb)
  return matchToDMC(lab, excludedCodes, metric)
}

export interface DmcValuePreservingWeights {
  wL: number
  wC: number
}

/**
 * Match a LAB color to DMC with extra emphasis on preserving luminance/value.
 *
 * Cost = wL * |ΔL| + wC * sqrt(Δa^2 + Δb^2)
 */
export function matchToDmcPreserveValue(
  color: LABColor,
  excludedCodes: string[] = [],
  weights: DmcValuePreservingWeights = { wL: 2.0, wC: 1.0 }
): DMCColor {
  const palette = excludedCodes.length > 0
    ? DMC_COLORS.filter((c) => !excludedCodes.includes(c.code))
    : DMC_COLORS

  if (palette.length === 0) {
    throw new Error('Cannot match to DMC: palette is empty after exclusions')
  }

  let best = palette[0]
  let bestCost = Infinity

  palette.forEach((dmc) => {
    const dL = Math.abs(color.L - dmc.lab[0])
    const da = color.a - dmc.lab[1]
    const db = color.b - dmc.lab[2]
    const dC = Math.sqrt(da * da + db * db)
    const cost = weights.wL * dL + weights.wC * dC
    if (cost < bestCost) {
      bestCost = cost
      best = dmc
    }
  })

  return best
}

/**
 * Match multiple LAB colors to DMC at once (optimized for batch processing)
 *
 * @param colors Array of LAB colors to match
 * @param excludedCodes Optional array of DMC codes to exclude
 * @param metric Distance metric to use
 * @returns Array of matched DMC colors
 */
export function batchMatchToDMC(
  colors: LABColor[],
  excludedCodes: string[] = [],
  metric: 'CIE76' | 'CIE94' | 'CMC' = 'CMC'
): DMCColor[] {
  return colors.map((color) => matchToDMC(color, excludedCodes, metric))
}

export interface DmcPaletteMappingResult {
  mappedPalette: string[]
  dmcMetadataByMappedHex: Record<string, DmcMetadata>
  mappingTable: PaletteMappingEntry[]
  originalToMapped: Record<string, string>
}

export function mapPaletteToDmc(
  palette: string[],
  _metric: 'CIE76' | 'CIE94' | 'CMC' = 'CMC',
  weights: DmcValuePreservingWeights = { wL: 2.0, wC: 1.0 }
): DmcPaletteMappingResult {
  const uniquePalette = Array.from(
    new Set(palette.map((hex) => normalizeHex(hex)))
  )
  const dmcMetadataByMappedHex: Record<string, DmcMetadata> = {}
  const mappingTable: PaletteMappingEntry[] = []
  const originalToMapped: Record<string, string> = {}
  const mappedPaletteSet = new Set<string>()

  uniquePalette.forEach((originalHex) => {
    const dmc = matchToDmcPreserveValue(rgbToLab(hexToRgb(originalHex)), [], weights)
    const mappedHex = normalizeHex(dmc.hex)
    const dmcMetadata: DmcMetadata = {
      code: dmc.code,
      name: dmc.name,
      hex: mappedHex,
    }

    originalToMapped[originalHex] = mappedHex
    dmcMetadataByMappedHex[mappedHex] = dmcMetadata
    mappedPaletteSet.add(mappedHex)
    mappingTable.push({
      originalHex,
      mappedHex,
      dmc: dmcMetadata,
    })
  })

  const mappedPalette = Array.from(mappedPaletteSet)
  mappedPalette.sort((a, b) => rgbToLab(hexToRgb(a)).L - rgbToLab(hexToRgb(b)).L)

  return {
    mappedPalette,
    dmcMetadataByMappedHex,
    mappingTable,
    originalToMapped,
  }
}

/**
 * Get the N closest DMC colors to a target color
 * Useful for showing alternatives or color suggestions
 *
 * @param color LAB color to match
 * @param count Number of closest colors to return
 * @param excludedCodes Optional array of DMC codes to exclude
 * @param metric Distance metric to use
 * @returns Array of closest DMC colors with their distances
 */
export function getClosestDMCColors(
  color: LABColor,
  count: number = 5,
  excludedCodes: string[] = [],
  metric: 'CIE76' | 'CIE94' | 'CMC' = 'CMC'
): Array<{ color: DMCColor; distance: number }> {
  const palette = excludedCodes.length > 0
    ? DMC_COLORS.filter((c) => !excludedCodes.includes(c.code))
    : DMC_COLORS

  const distanceFunc =
    metric === 'CIE76' ? deltaE76 : metric === 'CIE94' ? deltaE94 : deltaECMC

  // Calculate distances for all colors
  const results = palette.map((dmc) => {
    const dmcLab: LABColor = { L: dmc.lab[0], a: dmc.lab[1], b: dmc.lab[2] }
    const distance = distanceFunc(color, dmcLab)
    return { color: dmc, distance }
  })

  // Sort by distance and return top N
  return results.sort((a, b) => a.distance - b.distance).slice(0, count)
}

/**
 * Check if a LAB color is within acceptable range of a DMC color
 * Useful for quality checks and validation
 *
 * @param color LAB color to check
 * @param dmcCode DMC color code to compare against
 * @param threshold Maximum acceptable Delta-E distance (default 2.3)
 * @returns true if color is close enough to DMC color
 */
export function isCloseToAMC(
  color: LABColor,
  dmcCode: string,
  threshold: number = 2.3
): boolean {
  const dmc = DMC_COLORS.find((c) => c.code === dmcCode)
  if (!dmc) return false

  const dmcLab: LABColor = { L: dmc.lab[0], a: dmc.lab[1], b: dmc.lab[2] }
  const distance = deltaECMC(color, dmcLab)

  return distance <= threshold
}

/**
 * Create a reduced DMC palette by filtering to N colors with maximum coverage
 * Uses k-means-like approach to select colors that cover the color space well
 *
 * @param targetCount Target number of colors in reduced palette
 * @returns Array of DMC colors providing good color space coverage
 */
export function createReducedDMCPalette(targetCount: number): DMCColor[] {
  if (targetCount >= DMC_COLORS.length) return [...DMC_COLORS]
  if (targetCount <= 0) return []

  // Start with common base colors
  const selected: DMCColor[] = [
    DMC_COLORS.find((c) => c.code === 'White')!,
    DMC_COLORS.find((c) => c.code === '310')!, // Black
    DMC_COLORS.find((c) => c.code === '666')!, // Red
    DMC_COLORS.find((c) => c.code === '700')!, // Green
    DMC_COLORS.find((c) => c.code === '797')!, // Blue
    DMC_COLORS.find((c) => c.code === '973')!, // Yellow
  ].filter(Boolean)

  // Add remaining colors by maximizing minimum distance to already selected colors
  const remaining = DMC_COLORS.filter((c) => !selected.includes(c))

  while (selected.length < targetCount && remaining.length > 0) {
    let maxMinDistance = -1
    let bestColor: DMCColor | null = null

    // Find color with maximum minimum distance to selected colors
    remaining.forEach((candidate) => {
      const candidateLab: LABColor = {
        L: candidate.lab[0],
        a: candidate.lab[1],
        b: candidate.lab[2],
      }

      const minDistance = Math.min(
        ...selected.map((sel) => {
          const selLab: LABColor = { L: sel.lab[0], a: sel.lab[1], b: sel.lab[2] }
          return deltaECMC(candidateLab, selLab)
        })
      )

      if (minDistance > maxMinDistance) {
        maxMinDistance = minDistance
        bestColor = candidate
      }
    })

    if (bestColor) {
      selected.push(bestColor)
      const index = remaining.indexOf(bestColor)
      remaining.splice(index, 1)
    } else {
      break
    }
  }

  return selected
}

/**
 * Export full DMC palette for external use
 */
export { DMC_COLORS } from './dmc-colors'

function normalizeHex(hex: string): string {
  return hex.startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`
}
