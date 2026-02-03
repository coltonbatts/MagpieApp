import type { Pattern } from '@/model/Pattern'
import type { ProcessingConfig, RGBColor } from '@/types'
import { getProcessedPaths, Point, Path } from '@/processing/vectorize'
import { linearRgbToOkLab, okLabDistanceSqWeighted } from '@/processing/color-spaces'

export function generatePatternSVG(pattern: Pattern, config: ProcessingConfig): string {
    if (!pattern.labels || !pattern.paletteHex) {
        return '<svg></svg>'
    }

    const { labels, paletteHex, width, height } = pattern

    // 1. Identify fabric indices
    const fabricLabels = new Set<number>()
    const fabricOkLab = rgbToOkLab(config.fabricColor)
    const thresholdSq = config.stitchThreshold * config.stitchThreshold

    paletteHex.forEach((hex, idx) => {
        const lab = hexToOkLab(hex)
        const distSq = okLabDistanceSqWeighted(
            lab[0], lab[1], lab[2],
            fabricOkLab[0], fabricOkLab[1], fabricOkLab[2],
            1.35
        )
        if (distSq < thresholdSq) {
            fabricLabels.add(idx)
        }
    })

    // 2. Vectorize + Simplify and Smooth
    const paths = getProcessedPaths(labels, width, height, fabricLabels, {
        simplify: 0.4,
        smooth: 3,
        manualMask: pattern.selection?.mask
    })

    // 4. Build SVG
    const svgLines: string[] = []
    svgLines.push(`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`)

    // Outer border
    svgLines.push(`  <rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#ccc" stroke-width="0.5" />`)

    paths.forEach((path: Path) => {
        if (path.isFabric) return // Skip outlining fabric regions

        const d = path.points.map((p: Point, j: number) => `${j === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + ' Z'
        svgLines.push(`  <path d="${d}" fill="none" stroke="black" stroke-width="0.2" />`)

        // Label placement
        if (path.points.length > 5) {
            const center = getBoundingBoxCenter(path.points)
            // Only label if it's likely inside (this is a heuristic, real max-inscribed-circle would be better)
            svgLines.push(`  <text x="${center.x.toFixed(2)}" y="${center.y.toFixed(2)}" font-family="Arial" font-size="1.5" text-anchor="middle" alignment-baseline="middle" fill="black">${path.label + 1}</text>`)
        }
    })

    svgLines.push('</svg>')
    return svgLines.join('\n')
}

function getBoundingBoxCenter(points: Point[]): Point {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of points) {
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
        if (p.x > maxX) maxX = p.x
        if (p.y > maxY) maxY = p.y
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

function rgbToOkLab(rgb: RGBColor): [number, number, number] {
    return linearRgbToOkLab(srgbToLinear(rgb.r), srgbToLinear(rgb.g), srgbToLinear(rgb.b))
}

function hexToOkLab(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return rgbToOkLab({ r, g, b })
}

function srgbToLinear(v: number): number {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
