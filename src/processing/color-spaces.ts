export function createSrgb8ToLinearLut(): Float32Array {
  const lut = new Float32Array(256)
  for (let i = 0; i < 256; i += 1) {
    const v = i / 255
    lut[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return lut
}

export function linearToSrgb8(linear: number): number {
  const clamped = Math.max(0, Math.min(1, linear))
  const srgb =
    clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(srgb * 255)))
}

// OKLab: https://bottosson.github.io/posts/oklab/
export function linearRgbToOkLab(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
  const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_

  return [L, a, b2]
}

export function okLabToLinearRgb(
  L: number,
  a: number,
  b: number
): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const b2 = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

  return [r, g, b2]
}

export function okLabDistanceSqWeighted(
  L1: number,
  a1: number,
  b1: number,
  L2: number,
  a2: number,
  b2: number,
  wL: number
): number {
  const dL = (L1 - L2) * wL
  const da = a1 - a2
  const db = b1 - b2
  return dL * dL + da * da + db * db
}

