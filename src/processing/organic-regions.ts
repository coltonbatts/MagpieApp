import { findConnectedComponents } from './label-map'
import { okLabDistanceSqWeighted, linearRgbToOkLab } from './color-spaces'
import type { RGBColor } from '@/types'

export interface OrganicRegionResult {
    labels: Uint16Array
    isFabric: Uint8Array // 1 if fabric, 0 if stitch (per component ID)
}

export function processOrganicRegions(
    labels: Uint16Array,
    width: number,
    height: number,
    paletteHex: string[],
    fabricColor: RGBColor,
    _threshold: number,
    _minRegionSize: number
): { labels: Uint16Array; fabricLabel: number } {
    // 1. Find connected components
    let { regionColors } = findConnectedComponents(labels, width, height)

    // 2. Classify regions as FABRIC or STITCH
    const fabricOkLab = linearRgbToOkLab(
        srgbToLinear(fabricColor.r),
        srgbToLinear(fabricColor.g),
        srgbToLinear(fabricColor.b)
    )

    regionColors.forEach((colorIdx, _componentId) => {
      const hex = paletteHex[colorIdx]
      const rgb = hexToRgb(hex)
      const lab = linearRgbToOkLab(srgbToLinear(rgb.r), srgbToLinear(rgb.g), srgbToLinear(rgb.b))

      okLabDistanceSqWeighted(
        lab[0], lab[1], lab[2],
        fabricOkLab[0], fabricOkLab[1], fabricOkLab[2],
        1.35 // wL
      )
        // Classification logic would go here if we were re-mapping
    })

    return {
        labels,
        fabricLabel: -1 // To be handled by the caller
    }
}

function hexToRgb(hex: string): RGBColor {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return { r, g, b }
}

function srgbToLinear(v: number): number {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
