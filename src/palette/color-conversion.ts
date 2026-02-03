import type { LABColor, RGBColor } from '@/types'

/**
 * Convert RGB color to LAB color space (CIE L*a*b*)
 * LAB is perceptually uniform - equal distances = equal perceived color differences
 *
 * @param rgb RGB color with values 0-255
 * @returns LAB color (L: 0-100, a: -128 to 127, b: -128 to 127)
 */
export function rgbToLab(rgb: RGBColor): LABColor {
  // Step 1: Normalize RGB to 0-1
  let r = rgb.r / 255
  let g = rgb.g / 255
  let b = rgb.b / 255

  // Step 2: Apply gamma correction (sRGB → linear RGB)
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92

  // Step 3: Convert to XYZ color space (D65 illuminant)
  // Using sRGB → XYZ conversion matrix
  let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
  let z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041

  // Step 4: Normalize by D65 white point
  x /= 0.95047
  y /= 1.00000
  z /= 1.08883

  // Step 5: Apply LAB transformation function
  const f = (t: number) => {
    return t > 0.008856 ? Math.pow(t, 1 / 3) : (7.787 * t + 16 / 116)
  }

  const fx = f(x)
  const fy = f(y)
  const fz = f(z)

  // Step 6: Calculate LAB values
  const L = 116 * fy - 16
  const a = 500 * (fx - fy)
  const bValue = 200 * (fy - fz)

  return { L, a, b: bValue }
}

/**
 * Convert LAB color to RGB color space
 * Useful for displaying LAB colors or debugging
 *
 * @param lab LAB color
 * @returns RGB color with values 0-255
 */
export function labToRgb(lab: LABColor): RGBColor {
  // Step 1: Convert LAB to XYZ
  const fy = (lab.L + 16) / 116
  const fx = lab.a / 500 + fy
  const fz = fy - lab.b / 200

  // Inverse LAB transformation
  const finv = (t: number) => {
    return t > 0.206897 ? Math.pow(t, 3) : (t - 16 / 116) / 7.787
  }

  let x = finv(fx) * 0.95047
  let y = finv(fy) * 1.00000
  let z = finv(fz) * 1.08883

  // Step 2: Convert XYZ to linear RGB
  let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314
  let g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560
  let b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252

  // Step 3: Apply gamma correction (linear RGB → sRGB)
  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g
  b = b > 0.0031308 ? 1.055 * Math.pow(b, 1 / 2.4) - 0.055 : 12.92 * b

  // Step 4: Clamp to 0-255 range
  return {
    r: Math.max(0, Math.min(255, Math.round(r * 255))),
    g: Math.max(0, Math.min(255, Math.round(g * 255))),
    b: Math.max(0, Math.min(255, Math.round(b * 255))),
  }
}

/**
 * Convert hex color string to RGB
 *
 * @param hex Hex color string (e.g., "#FF0000" or "FF0000")
 * @returns RGB color
 */
export function hexToRgb(hex: string): RGBColor {
  const cleaned = hex.replace('#', '')
  const r = parseInt(cleaned.substring(0, 2), 16)
  const g = parseInt(cleaned.substring(2, 4), 16)
  const b = parseInt(cleaned.substring(4, 6), 16)
  return { r, g, b }
}

/**
 * Convert RGB color to hex string
 *
 * @param rgb RGB color
 * @returns Hex string (e.g., "#FF0000")
 */
export function rgbToHex(rgb: RGBColor): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)))
    return clamped.toString(16).padStart(2, '0').toUpperCase()
  }
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

/**
 * Convert hex color directly to LAB (convenience function)
 */
export function hexToLab(hex: string): LABColor {
  return rgbToLab(hexToRgb(hex))
}
