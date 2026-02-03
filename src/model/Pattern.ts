import type { LegendEntry, Stitch } from '@/types'

export class Pattern {
  stitches: Stitch[]
  width: number
  height: number

  constructor(stitches: Stitch[], width: number, height: number) {
    this.stitches = stitches
    this.width = width
    this.height = height
  }

  getLegend(): LegendEntry[] {
    const counts = new Map<string, number>()
    const dmcInfo = new Map<string, { name: string; hex: string }>()

    this.stitches.forEach((stitch) => {
      counts.set(stitch.dmcCode, (counts.get(stitch.dmcCode) || 0) + 1)
      if (!dmcInfo.has(stitch.dmcCode)) {
        dmcInfo.set(stitch.dmcCode, {
          name: stitch.dmcCode, // TODO: lookup actual DMC name
          hex: stitch.hex,
        })
      }
    })

    return Array.from(counts.entries())
      .map(([dmcCode, stitchCount]) => ({
        dmcCode,
        name: dmcInfo.get(dmcCode)!.name,
        hex: dmcInfo.get(dmcCode)!.hex,
        stitchCount,
        markerReused: false, // TODO: detect marker reuse
      }))
      .sort((a, b) => b.stitchCount - a.stitchCount)
  }

  getStitchCount(dmcCode: string): number {
    return this.stitches.filter((s) => s.dmcCode === dmcCode).length
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

    return new Pattern(stitches, size, size)
  }

  // Day 2 preview: create a pattern directly from normalized image pixels.
  static fromImageData(image: ImageData, colorCount: number): Pattern {
    const stitches: Stitch[] = []
    const binsPerChannel = Math.max(1, Math.round(Math.cbrt(Math.max(1, colorCount))))
    const step = Math.max(1, Math.floor(256 / binsPerChannel))
    const markers = ['S', 'O', 'T', '*', 'D', 'X', '+', '#', '%', '@']
    const colorMap = new Map<string, { code: string; marker: string }>()
    let nextIndex = 0

    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const idx = (y * image.width + x) * 4
        const r = bucket(image.data[idx], step)
        const g = bucket(image.data[idx + 1], step)
        const b = bucket(image.data[idx + 2], step)
        const hex = toHex(r, g, b)

        if (!colorMap.has(hex)) {
          const marker = markers[nextIndex % markers.length]
          colorMap.set(hex, { code: `DMC-${nextIndex}`, marker })
          nextIndex += 1
        }

        const mapped = colorMap.get(hex)!
        stitches.push({
          x,
          y,
          dmcCode: mapped.code,
          marker: mapped.marker,
          hex,
        })
      }
    }

    return new Pattern(stitches, image.width, image.height)
  }
}

function bucket(value: number, step: number): number {
  const clamped = Math.max(0, Math.min(255, value))
  return Math.min(255, Math.floor(clamped / step) * step)
}

function toHex(r: number, g: number, b: number): string {
  const toPart = (value: number) => value.toString(16).padStart(2, '0').toUpperCase()
  return `#${toPart(r)}${toPart(g)}${toPart(b)}`
}
