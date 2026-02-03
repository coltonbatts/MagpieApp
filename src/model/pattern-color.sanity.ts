import { Pattern } from './Pattern'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[Magpie][PatternColorSanity] ${message}`)
  }
}

function hexToRgb8(hex: string): [number, number, number] {
  const cleaned = hex.startsWith('#') ? hex.slice(1) : hex
  assert(cleaned.length === 6, `Invalid hex color: ${hex}`)
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  return [r, g, b]
}

export function runPatternColorSanityTest() {
  const width = 4
  const height = 4
  const data = new Uint8ClampedArray(width * height * 4)

  // 4 deterministic colors (include non-0/128 values and strong blue).
  const colors: Array<[number, number, number]> = [
    [12, 34, 200],
    [250, 10, 180],
    [20, 240, 30],
    [200, 180, 5],
  ]

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const quadrant = (x < 2 ? 0 : 1) + (y < 2 ? 0 : 2)
      const [r, g, b] = colors[quadrant]
      const idx = (y * width + x) * 4
      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
      data[idx + 3] = 255
    }
  }

  const image = { width, height, data } as unknown as ImageData
  const pattern = Pattern.fromImageData(image, {
    colorCount: 4,
    ditherMode: 'none',
    targetSize: 4,
    useDmcPalette: false,
    smoothingAmount: 0,
    simplifyAmount: 0,
    minRegionSize: 1,
  })

  const palette = pattern.rawPalette
  assert(palette.length >= 3, `Expected palette size >= 3, got ${palette.length}`)

  const channelValues = new Set<number>()
  let hasBlue = false
  let hasRed = false
  let hasGreen = false

  palette.forEach((hex) => {
    const [r, g, b] = hexToRgb8(hex)
    channelValues.add(r)
    channelValues.add(g)
    channelValues.add(b)
    if (b >= 120) hasBlue = true
    if (r >= 120) hasRed = true
    if (g >= 120) hasGreen = true
  })

  assert(hasBlue, `Expected at least one palette color with strong blue; palette=${palette.join(', ')}`)
  assert(hasRed, `Expected at least one palette color with strong red; palette=${palette.join(', ')}`)
  assert(hasGreen, `Expected at least one palette color with strong green; palette=${palette.join(', ')}`)

  const nonCollapsed = Array.from(channelValues).some((v) => v !== 0 && v !== 128)
  assert(nonCollapsed, `Palette channel values appear collapsed to {0,128}; palette=${palette.join(', ')}`)

  console.info('[Magpie][PatternColorSanity] PASS', { palette })
}

