import type { LABColor } from '@/types'

/**
 * Delta-E CIE76 - Simple Euclidean distance in LAB space
 * Fast and good enough for most use cases.
 * Lower values = more similar colors (0 = identical)
 *
 * @param lab1 First LAB color
 * @param lab2 Second LAB color
 * @returns Distance value (0 = identical, higher = more different)
 */
export function deltaE76(lab1: LABColor, lab2: LABColor): number {
  const dL = lab1.L - lab2.L
  const da = lab1.a - lab2.a
  const db = lab1.b - lab2.b
  return Math.sqrt(dL * dL + da * da + db * db)
}

/**
 * Legacy export for backwards compatibility
 */
export const deltaE = deltaE76

/**
 * Delta-E CIE94 - Improved perceptual accuracy over CIE76
 * Better for textiles and thread colors.
 * About 2x slower than CIE76 but more accurate.
 *
 * @param lab1 First LAB color
 * @param lab2 Second LAB color
 * @returns Distance value (0 = identical, higher = more different)
 */
export function deltaE94(lab1: LABColor, lab2: LABColor): number {
  const dL = lab1.L - lab2.L
  const da = lab1.a - lab2.a
  const db = lab1.b - lab2.b

  const C1 = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b)
  const C2 = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b)
  const dC = C1 - C2

  const dH2 = da * da + db * db - dC * dC
  const dH = dH2 > 0 ? Math.sqrt(dH2) : 0

  // Weighting factors for textiles (kL=2, K1=0.048, K2=0.014)
  const kL = 2.0
  const kC = 1.0
  const kH = 1.0
  const K1 = 0.048
  const K2 = 0.014

  const sL = 1.0
  const sC = 1.0 + K1 * C1
  const sH = 1.0 + K2 * C1

  const dE = Math.sqrt(
    Math.pow(dL / (kL * sL), 2) +
      Math.pow(dC / (kC * sC), 2) +
      Math.pow(dH / (kH * sH), 2)
  )

  return dE
}

/**
 * Delta-E CMC (l:c) - Color Measurement Committee formula
 * Excellent balance of accuracy and performance for thread matching.
 * l:c ratio controls lightness vs chroma importance.
 *
 * @param lab1 First LAB color
 * @param lab2 Second LAB color
 * @param l Lightness weight (2.0 for perceptibility, 1.0 for acceptability)
 * @param c Chroma weight (typically 1.0)
 * @returns Distance value (0 = identical, higher = more different)
 */
export function deltaECMC(
  lab1: LABColor,
  lab2: LABColor,
  l: number = 2.0,
  c: number = 1.0
): number {
  const dL = lab1.L - lab2.L
  const da = lab1.a - lab2.a
  const db = lab1.b - lab2.b

  const C1 = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b)
  const C2 = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b)
  const dC = C1 - C2

  const dH2 = da * da + db * db - dC * dC
  const dH = dH2 > 0 ? Math.sqrt(dH2) : 0

  // Calculate hue angle for lab1
  const H1 = Math.atan2(lab1.b, lab1.a) * (180 / Math.PI)
  const H1_deg = H1 < 0 ? H1 + 360 : H1

  // Calculate F factor
  const F = Math.sqrt(Math.pow(C1, 4) / (Math.pow(C1, 4) + 1900))

  // Calculate T factor based on hue
  let T: number
  if (H1_deg >= 164 && H1_deg <= 345) {
    T = 0.56 + Math.abs(0.2 * Math.cos((H1_deg + 168) * (Math.PI / 180)))
  } else {
    T = 0.36 + Math.abs(0.4 * Math.cos((H1_deg + 35) * (Math.PI / 180)))
  }

  // Calculate weighting functions
  const sL = lab1.L < 16 ? 0.511 : (0.040975 * lab1.L) / (1 + 0.01765 * lab1.L)
  const sC = (0.0638 * C1) / (1 + 0.0131 * C1) + 0.638
  const sH = sC * (F * T + 1 - F)

  const dE = Math.sqrt(
    Math.pow(dL / (l * sL), 2) + Math.pow(dC / (c * sC), 2) + Math.pow(dH / sH, 2)
  )

  return dE
}

/**
 * Helper: Determine if two colors are perceptually similar
 * Using Delta-E thresholds:
 * - 0-1: Not perceptible by human eyes
 * - 1-2: Perceptible through close observation
 * - 2-10: Perceptible at a glance
 * - 11-49: Colors are more similar than opposite
 * - 50+: Colors are completely different
 *
 * @param lab1 First LAB color
 * @param lab2 Second LAB color
 * @param threshold Maximum Delta-E for "similar" (default 2.3)
 * @returns true if colors are perceptually similar
 */
export function areSimilarColors(
  lab1: LABColor,
  lab2: LABColor,
  threshold: number = 2.3
): boolean {
  return deltaECMC(lab1, lab2) <= threshold
}

/**
 * Find the closest color from a palette
 * Uses Delta-E CMC by default for best thread matching accuracy
 *
 * @param target Target LAB color to match
 * @param palette Array of LAB colors to search
 * @param metric Distance metric to use (default: CMC)
 * @returns Index of closest color in palette
 */
export function findClosestColorIndex(
  target: LABColor,
  palette: LABColor[],
  metric: 'CIE76' | 'CIE94' | 'CMC' = 'CMC'
): number {
  let minDistance = Infinity
  let closestIndex = 0

  const distanceFunc =
    metric === 'CIE76' ? deltaE76 : metric === 'CIE94' ? deltaE94 : deltaECMC

  palette.forEach((color, index) => {
    const distance = distanceFunc(target, color)
    if (distance < minDistance) {
      minDistance = distance
      closestIndex = index
    }
  })

  return closestIndex
}
