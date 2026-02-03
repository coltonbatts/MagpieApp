import type { Pattern } from '@/model/Pattern'

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

export function logNormalizedImageDebug(image: ImageData) {
  const n = image.width * image.height
  const data = image.data

  let minR = 255,
    maxR = 0,
    minG = 255,
    maxG = 0,
    minB = 255,
    maxB = 0

  for (let i = 0; i < n; i += 1) {
    const idx = i * 4
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]
    if (r < minR) minR = r
    if (r > maxR) maxR = r
    if (g < minG) minG = g
    if (g > maxG) maxG = g
    if (b < minB) minB = b
    if (b > maxB) maxB = b
  }

  const sampleCount = Math.min(20, n)
  const stride = Math.max(1, Math.floor(n / sampleCount))
  const samples: Array<{ x: number; y: number; r: number; g: number; b: number; a: number }> = []
  for (let i = 0; i < n && samples.length < sampleCount; i += stride) {
    const idx = i * 4
    const x = i % image.width
    const y = Math.floor(i / image.width)
    samples.push({
      x,
      y,
      r: clampByte(data[idx]),
      g: clampByte(data[idx + 1]),
      b: clampByte(data[idx + 2]),
      a: clampByte(data[idx + 3]),
    })
  }

  console.info('[Magpie][ColorDebug] normalizedImage RGB range', {
    width: image.width,
    height: image.height,
    min: { r: minR, g: minG, b: minB },
    max: { r: maxR, g: maxG, b: maxB },
  })
  console.info('[Magpie][ColorDebug] normalizedImage sample pixels (20)', samples)
}

export function logPatternPaletteDebug(pattern: Pattern) {
  const unique = Array.from(new Set(pattern.rawPalette.map((h) => normalizeHex(h))))
  console.info('[Magpie][ColorDebug] quantized unique palette hexes', unique)
}

function normalizeHex(hex: string): string {
  return hex.startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`
}

