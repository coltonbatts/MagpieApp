import type { Pattern } from '@/model/Pattern'
import type { ProcessingConfig, RGBColor } from '@/types'
import { getProcessedPaths, Point, Path } from '@/processing/vectorize'
import { linearRgbToOkLab, okLabDistanceSqWeighted } from '@/processing/color-spaces'

export function generatePatternSVG(pattern: Pattern, config: ProcessingConfig): string {
    if (!pattern.labels || !pattern.paletteHex) {
        return '<svg></svg>'
    }

    const { labels, paletteHex, width, height } = pattern
    const legend = pattern.getLegend({ fabricConfig: config })

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

    // 4. Group paths by DMC
    const pathsByDmc = new Map<string, Path[]>()
    paths.forEach(path => {
        if (path.isFabric) return
        // path.label is the index into palette. 
        const code = legend[path.label]?.dmcCode ?? `Color ${path.label + 1}`
        const existing = pathsByDmc.get(code) || []
        existing.push(path)
        pathsByDmc.set(code, existing)
    })

    // 5. Build SVG
    const svgLines: string[] = []
    svgLines.push(`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`)
    svgLines.push(`  <desc>Magpie DMC-Forward Layered Export</desc>`)

    // Outer border
    svgLines.push(`  <rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#eee" stroke-width="0.5" />`)

    pathsByDmc.forEach((dmcPaths, code) => {
        const pathLabel = dmcPaths[0].label
        const hex = paletteHex[pathLabel] ?? '#000000'
        svgLines.push(`  <g id="dmc-${code.replace(/\s+/g, '-')}" data-dmc="${code}">`)

        dmcPaths.forEach((path: Path) => {
            const d = path.points.map((p: Point, j: number) => `${j === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + ' Z'
            // Use filled shapes for "paint-by-number" feel
            svgLines.push(`    <path d="${d}" fill="${hex}" stroke="${hex}" stroke-width="0.1" opacity="0.8" />`)

            // Centered DMC Label
            if (path.points.length > 8) {
                const center = getBoundingBoxCenter(path.points)
                svgLines.push(`    <text x="${center.x.toFixed(2)}" y="${center.y.toFixed(2)}" font-family="monospace" font-weight="black" font-size="2" text-anchor="middle" alignment-baseline="middle" fill="white" style="text-shadow: 0 0 2px black;">${code}</text>`)
            }
        })

        svgLines.push(`  </g>`)
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
