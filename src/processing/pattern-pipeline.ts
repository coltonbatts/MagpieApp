import type { ProcessingConfig } from '@/types'
import {
  createSrgb8ToLinearLut,
  linearRgbToOkLab,
  linearToSrgb8,
  okLabDistanceSqWeighted,
} from './color-spaces'

export interface QuantizedImageResult {
  width: number
  height: number
  labels: Uint16Array<ArrayBufferLike> // length = width * height
  paletteHex: string[] // index = label
  paletteOkLab: Float32Array // length = paletteHex.length * 3
}

const SRGB8_TO_LINEAR = createSrgb8ToLinearLut()

export function quantizeImageToPalette(
  image: ImageData,
  config: Pick<
    ProcessingConfig,
    'colorCount' | 'smoothingAmount' | 'simplifyAmount' | 'minRegionSize' | 'ditherMode'
  >
): QuantizedImageResult {
  const width = image.width
  const height = image.height
  const targetK = Math.max(1, Math.round(config.colorCount))

  const { linRgb, okLab } = extractLinearRgbAndOkLab(image)

  const smoothed = applyEdgePreservingSmoothing(
    linRgb,
    okLab,
    width,
    height,
    clamp01(config.smoothingAmount)
  )

  const initial = kmeansQuantizeOkLab(smoothed.okLab, width, height, targetK)
  let labels = initial.labels
  let centersOkLab = initial.centersOkLab

  const minRegionSize = Math.max(1, Math.round(config.minRegionSize))
  const simplifyAmount = clamp01(config.simplifyAmount)

  if (minRegionSize > 1) {
    removeSmallRegions(labels, width, height, centersOkLab, minRegionSize)
  }

  const labelSmoothIters = Math.round(simplifyAmount * 2)
  if (labelSmoothIters > 0) {
    smoothLabels(labels, width, height, smoothed.okLab, centersOkLab, labelSmoothIters, simplifyAmount)
  }

  const recomputed = recomputePaletteFromLabels(labels, smoothed.linRgb, width, height)
  labels = recomputed.labels

  let sorted = sortPaletteByLuminance(labels, recomputed.paletteLinRgb, width, height)
  if (config.ditherMode === 'bayer') {
    const ditheredLabels = applyBayerLumaDither(
      sorted.labels,
      width,
      height,
      smoothed.okLab,
      sorted.paletteOkLab,
      0.012
    )
    const ditherRecomputed = recomputePaletteFromLabels(ditheredLabels, smoothed.linRgb, width, height)
    sorted = sortPaletteByLuminance(ditherRecomputed.labels, ditherRecomputed.paletteLinRgb, width, height)
  }

  return {
    width,
    height,
    labels: sorted.labels,
    paletteHex: sorted.paletteHex,
    paletteOkLab: sorted.paletteOkLab,
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

function extractLinearRgbAndOkLab(image: ImageData): {
  linRgb: Float32Array
  okLab: Float32Array
} {
  const width = image.width
  const height = image.height
  const n = width * height
  const linRgb = new Float32Array(n * 3)
  const okLab = new Float32Array(n * 3)

  const data = image.data

  for (let i = 0; i < n; i += 1) {
    const idx = i * 4
    const a = data[idx + 3] / 255
    const r8 = Math.round(data[idx] * a + 255 * (1 - a))
    const g8 = Math.round(data[idx + 1] * a + 255 * (1 - a))
    const b8 = Math.round(data[idx + 2] * a + 255 * (1 - a))

    const r = SRGB8_TO_LINEAR[r8]
    const g = SRGB8_TO_LINEAR[g8]
    const b = SRGB8_TO_LINEAR[b8]

    const p3 = i * 3
    linRgb[p3] = r
    linRgb[p3 + 1] = g
    linRgb[p3 + 2] = b

    const [L, a2, b2] = linearRgbToOkLab(r, g, b)
    okLab[p3] = L
    okLab[p3 + 1] = a2
    okLab[p3 + 2] = b2
  }

  return { linRgb, okLab }
}

function applyEdgePreservingSmoothing(
  linRgb: Float32Array,
  okLab: Float32Array,
  width: number,
  height: number,
  amount: number
): { linRgb: Float32Array; okLab: Float32Array } {
  if (amount <= 0) return { linRgb, okLab }

  const passes = amount < 0.5 ? 1 : 2
  let currentLin = linRgb
  let currentOk = okLab

  const sigmaSpace = 1.0
  const spaceWeights = new Float32Array(9)
  let wi = 0
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const d2 = dx * dx + dy * dy
      spaceWeights[wi] = Math.exp(-d2 / (2 * sigmaSpace * sigmaSpace))
      wi += 1
    }
  }

  // OKLab L is roughly 0..1; tune sigmas accordingly.
  const sigmaL = lerp(0.010, 0.060, amount)
  const sigmaC = lerp(0.010, 0.090, amount)
  const inv2SigmaL2 = 1 / (2 * sigmaL * sigmaL)
  const inv2SigmaC2 = 1 / (2 * sigmaC * sigmaC)

  for (let pass = 0; pass < passes; pass += 1) {
    const outLin = new Float32Array(currentLin.length)

    for (let y = 0; y < height; y += 1) {
      const yOff = y * width
      for (let x = 0; x < width; x += 1) {
        const i = yOff + x
        const p3 = i * 3
        const L0 = currentOk[p3]
        const a0 = currentOk[p3 + 1]
        const b0 = currentOk[p3 + 2]

        let sumW = 0
        let sumR = 0
        let sumG = 0
        let sumB = 0

        let wj = 0
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = clampInt(y + dy, 0, height - 1)
          const yyOff = yy * width
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = clampInt(x + dx, 0, width - 1)
            const j = yyOff + xx
            const j3 = j * 3

            const dL = L0 - currentOk[j3]
            const da = a0 - currentOk[j3 + 1]
            const db = b0 - currentOk[j3 + 2]
            const dC2 = da * da + db * db

            const wColor = Math.exp(-(dL * dL) * inv2SigmaL2 - dC2 * inv2SigmaC2)
            const w = spaceWeights[wj] * wColor
            wj += 1

            sumW += w
            sumR += currentLin[j3] * w
            sumG += currentLin[j3 + 1] * w
            sumB += currentLin[j3 + 2] * w
          }
        }

        const invW = sumW > 0 ? 1 / sumW : 1
        outLin[p3] = sumR * invW
        outLin[p3 + 1] = sumG * invW
        outLin[p3 + 2] = sumB * invW
      }
    }

    const outOk = new Float32Array(currentOk.length)
    const n = width * height
    for (let i = 0; i < n; i += 1) {
      const p3 = i * 3
      const [L, a2, b2] = linearRgbToOkLab(outLin[p3], outLin[p3 + 1], outLin[p3 + 2])
      outOk[p3] = L
      outOk[p3 + 1] = a2
      outOk[p3 + 2] = b2
    }

    currentLin = outLin
    currentOk = outOk
  }

  return { linRgb: currentLin, okLab: currentOk }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clampInt(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

function kmeansQuantizeOkLab(
  okLab: Float32Array,
  width: number,
  height: number,
  k: number
): { labels: Uint16Array<ArrayBufferLike>; centersOkLab: Float32Array } {
  const n = width * height
  const wL = 1.35

  // Train on a deterministic subset for speed and stability.
  const maxTrain = 9000
  const stride = Math.max(1, Math.floor(n / Math.min(n, maxTrain)))
  const trainIndices: number[] = []
  for (let i = 0; i < n; i += stride) trainIndices.push(i)

  const centers = initCentersFarthestOkLab(okLab, trainIndices, k, wL)
  const assignments = new Uint16Array(trainIndices.length)

  const sums = new Float64Array(k * 3)
  const counts = new Uint32Array(k)
  const maxIter = 10

  for (let iter = 0; iter < maxIter; iter += 1) {
    sums.fill(0)
    counts.fill(0)
    let changed = 0

    for (let ti = 0; ti < trainIndices.length; ti += 1) {
      const i = trainIndices[ti]
      const p3 = i * 3
      const L = okLab[p3]
      const a = okLab[p3 + 1]
      const b = okLab[p3 + 2]

      let bestK = 0
      let bestD = Infinity
      for (let c = 0; c < k; c += 1) {
        const c3 = c * 3
        const d = okLabDistanceSqWeighted(
          L,
          a,
          b,
          centers[c3],
          centers[c3 + 1],
          centers[c3 + 2],
          wL
        )
        if (d < bestD) {
          bestD = d
          bestK = c
        }
      }

      if (assignments[ti] !== bestK) {
        assignments[ti] = bestK
        changed += 1
      }

      const s3 = bestK * 3
      sums[s3] += L
      sums[s3 + 1] += a
      sums[s3 + 2] += b
      counts[bestK] += 1
    }

    for (let c = 0; c < k; c += 1) {
      const count = counts[c]
      if (count === 0) continue
      const c3 = c * 3
      centers[c3] = sums[c3] / count
      centers[c3 + 1] = sums[c3 + 1] / count
      centers[c3 + 2] = sums[c3 + 2] / count
    }

    if (changed === 0) break
  }

  const labels = new Uint16Array(n)
  for (let i = 0; i < n; i += 1) {
    const p3 = i * 3
    const L = okLab[p3]
    const a = okLab[p3 + 1]
    const b = okLab[p3 + 2]
    let bestK = 0
    let bestD = Infinity
    for (let c = 0; c < k; c += 1) {
      const c3 = c * 3
      const d = okLabDistanceSqWeighted(L, a, b, centers[c3], centers[c3 + 1], centers[c3 + 2], wL)
      if (d < bestD) {
        bestD = d
        bestK = c
      }
    }
    labels[i] = bestK
  }

  return { labels, centersOkLab: centers }
}

function initCentersFarthestOkLab(
  okLab: Float32Array,
  trainIndices: number[],
  k: number,
  wL: number
): Float32Array {
  const centers = new Float32Array(k * 3)
  if (trainIndices.length === 0) return centers

  // First center: median L among training points (deterministic).
  const order = trainIndices.slice()
  order.sort((i1, i2) => okLab[i1 * 3] - okLab[i2 * 3])
  let first = order[Math.floor(order.length / 2)]

  centers[0] = okLab[first * 3]
  centers[1] = okLab[first * 3 + 1]
  centers[2] = okLab[first * 3 + 2]

  const minD = new Float64Array(trainIndices.length)
  for (let ti = 0; ti < trainIndices.length; ti += 1) {
    const i = trainIndices[ti]
    const p3 = i * 3
    minD[ti] = okLabDistanceSqWeighted(
      okLab[p3],
      okLab[p3 + 1],
      okLab[p3 + 2],
      centers[0],
      centers[1],
      centers[2],
      wL
    )
  }

  let chosen = 1
  while (chosen < k) {
    let bestTi = 0
    let bestD = -1
    for (let ti = 0; ti < minD.length; ti += 1) {
      const d = minD[ti]
      if (d > bestD) {
        bestD = d
        bestTi = ti
      }
    }

    const idx = trainIndices[bestTi]
    const p3 = idx * 3
    const c3 = chosen * 3
    centers[c3] = okLab[p3]
    centers[c3 + 1] = okLab[p3 + 1]
    centers[c3 + 2] = okLab[p3 + 2]
    chosen += 1

    // Update min distances to closest center.
    for (let ti = 0; ti < trainIndices.length; ti += 1) {
      const i = trainIndices[ti]
      const q3 = i * 3
      const d = okLabDistanceSqWeighted(
        okLab[q3],
        okLab[q3 + 1],
        okLab[q3 + 2],
        centers[c3],
        centers[c3 + 1],
        centers[c3 + 2],
        wL
      )
      if (d < minD[ti]) minD[ti] = d
    }
  }

  return centers
}

function removeSmallRegions(
  labels: Uint16Array<ArrayBufferLike>,
  width: number,
  height: number,
  centersOkLab: Float32Array,
  minRegionSize: number
) {
  const n = width * height
  const visited = new Uint8Array(n)
  const queue = new Int32Array(n) // reused; queue size bounded by region size

  for (let start = 0; start < n; start += 1) {
    if (visited[start]) continue
    visited[start] = 1

    const targetLabel = labels[start]
    let qh = 0
    let qt = 0
    queue[qt++] = start

    const region: number[] = [start]
    const neighborCounts = new Map<number, number>()
    while (qh < qt) {
      const idx = queue[qh++]
      const x = idx % width
      const y = Math.floor(idx / width)

      const neighbors = [
        idx - 1,
        idx + 1,
        idx - width,
        idx + width,
      ]

      for (const nb of neighbors) {
        if (nb < 0 || nb >= n) continue
        if (Math.abs((nb % width) - x) + Math.abs(Math.floor(nb / width) - y) !== 1) continue

        const lbl = labels[nb]
        if (lbl === targetLabel) {
          if (!visited[nb]) {
            visited[nb] = 1
            queue[qt++] = nb
            region.push(nb)
          }
        } else {
          neighborCounts.set(lbl, (neighborCounts.get(lbl) ?? 0) + 1)
        }
      }
    }

    if (region.length >= minRegionSize || neighborCounts.size === 0) continue

    const base3 = targetLabel * 3
    const meanL = centersOkLab[base3]
    const meana = centersOkLab[base3 + 1]
    const meanb = centersOkLab[base3 + 2]

    let bestLabel = -1
    let bestCount = -1
    let bestCost = Infinity
    const wL = 1.35

    for (const [lbl, count] of neighborCounts.entries()) {
      const c3 = lbl * 3
      const cost = okLabDistanceSqWeighted(
        meanL,
        meana,
        meanb,
        centersOkLab[c3],
        centersOkLab[c3 + 1],
        centersOkLab[c3 + 2],
        wL
      )
      if (count > bestCount || (count === bestCount && cost < bestCost)) {
        bestCount = count
        bestCost = cost
        bestLabel = lbl
      }
    }

    if (bestLabel >= 0) {
      for (const idx of region) labels[idx] = bestLabel
    }
  }
}

function smoothLabels(
  labels: Uint16Array<ArrayBufferLike>,
  width: number,
  height: number,
  pixelOkLab: Float32Array,
  centersOkLab: Float32Array,
  iterations: number,
  simplifyAmount: number
) {
  const n = width * height
  const wL = 1.35
  const allowError = lerp(0.0, 0.010, simplifyAmount)

  let current: Uint16Array<ArrayBufferLike> = labels
  let next: Uint16Array<ArrayBufferLike> = new Uint16Array(n)
  const uniqLabels = new Int32Array(9)
  const uniqCounts = new Int32Array(9)

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let y = 0; y < height; y += 1) {
      const yOff = y * width
      for (let x = 0; x < width; x += 1) {
        const i = yOff + x
        const currentLabel = current[i]

        // Count 3x3 neighbor labels.
        let uniqLen = 0
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = clampInt(y + dy, 0, height - 1)
          const yyOff = yy * width
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = clampInt(x + dx, 0, width - 1)
            const lbl = current[yyOff + xx]
            let found = -1
            for (let u = 0; u < uniqLen; u += 1) {
              if (uniqLabels[u] === lbl) {
                found = u
                break
              }
            }
            if (found >= 0) {
              uniqCounts[found] += 1
            } else {
              uniqLabels[uniqLen] = lbl
              uniqCounts[uniqLen] = 1
              uniqLen += 1
            }
          }
        }

        let bestLabel = currentLabel
        let bestCount = 0
        for (let u = 0; u < uniqLen; u += 1) {
          const lbl = uniqLabels[u]
          const c = uniqCounts[u]
          if (lbl === currentLabel) bestCount = c
        }
        for (let u = 0; u < uniqLen; u += 1) {
          const lbl = uniqLabels[u]
          const c = uniqCounts[u]
          if (c > bestCount) {
            bestCount = c
            bestLabel = lbl
          }
        }
        // reset counters for next pixel
        for (let u = 0; u < uniqLen; u += 1) uniqCounts[u] = 0

        if (bestLabel === currentLabel || bestCount < 5) {
          next[i] = currentLabel
          continue
        }

        const p3 = i * 3
        const L = pixelOkLab[p3]
        const a = pixelOkLab[p3 + 1]
        const b = pixelOkLab[p3 + 2]
        const cur3 = currentLabel * 3
        const best3 = bestLabel * 3
        const dCur = okLabDistanceSqWeighted(
          L,
          a,
          b,
          centersOkLab[cur3],
          centersOkLab[cur3 + 1],
          centersOkLab[cur3 + 2],
          wL
        )
        const dBest = okLabDistanceSqWeighted(
          L,
          a,
          b,
          centersOkLab[best3],
          centersOkLab[best3 + 1],
          centersOkLab[best3 + 2],
          wL
        )

        next[i] = dBest <= dCur + allowError ? bestLabel : currentLabel
      }
    }
    ;[current, next] = [next, current]
  }

  if (current !== labels) labels.set(current)
}

function recomputePaletteFromLabels(
  labels: Uint16Array<ArrayBufferLike>,
  linRgb: Float32Array,
  width: number,
  height: number
): {
  labels: Uint16Array<ArrayBufferLike>
  paletteLinRgb: Float32Array
} {
  const n = width * height
  let maxLabel = 0
  for (let i = 0; i < n; i += 1) if (labels[i] > maxLabel) maxLabel = labels[i]
  const k = maxLabel + 1

  const sums = new Float64Array(k * 3)
  const counts = new Uint32Array(k)

  for (let i = 0; i < n; i += 1) {
    const lbl = labels[i]
    const p3 = i * 3
    const s3 = lbl * 3
    sums[s3] += linRgb[p3]
    sums[s3 + 1] += linRgb[p3 + 1]
    sums[s3 + 2] += linRgb[p3 + 2]
    counts[lbl] += 1
  }

  // Compact away unused labels.
  const remap = new Int32Array(k)
  remap.fill(-1)
  let used = 0
  for (let i = 0; i < k; i += 1) {
    if (counts[i] > 0) {
      remap[i] = used
      used += 1
    }
  }

  const outLabels: Uint16Array<ArrayBufferLike> = new Uint16Array(n)
  for (let i = 0; i < n; i += 1) outLabels[i] = remap[labels[i]]

  const paletteLin = new Float32Array(used * 3)
  const outCounts = new Uint32Array(used)
  const outSums = new Float64Array(used * 3)
  for (let i = 0; i < k; i += 1) {
    const out = remap[i]
    if (out < 0) continue
    const i3 = i * 3
    const o3 = out * 3
    outSums[o3] += sums[i3]
    outSums[o3 + 1] += sums[i3 + 1]
    outSums[o3 + 2] += sums[i3 + 2]
    outCounts[out] += counts[i]
  }
  for (let o = 0; o < used; o += 1) {
    const c = outCounts[o] || 1
    const o3 = o * 3
    paletteLin[o3] = outSums[o3] / c
    paletteLin[o3 + 1] = outSums[o3 + 1] / c
    paletteLin[o3 + 2] = outSums[o3 + 2] / c
  }

  return { labels: outLabels, paletteLinRgb: paletteLin }
}

function sortPaletteByLuminance(
  labels: Uint16Array<ArrayBufferLike>,
  paletteLinRgb: Float32Array,
  width: number,
  height: number
): {
  labels: Uint16Array<ArrayBufferLike>
  paletteHex: string[]
  paletteOkLab: Float32Array
} {
  const n = width * height
  const k = paletteLinRgb.length / 3

  const paletteOk = new Float32Array(k * 3)
  const entries: Array<{ index: number; L: number }> = []
  for (let i = 0; i < k; i += 1) {
    const i3 = i * 3
    const [L, a, b] = linearRgbToOkLab(paletteLinRgb[i3], paletteLinRgb[i3 + 1], paletteLinRgb[i3 + 2])
    paletteOk[i3] = L
    paletteOk[i3 + 1] = a
    paletteOk[i3 + 2] = b
    entries.push({ index: i, L })
  }
  entries.sort((a, b) => a.L - b.L)

  const remap = new Int32Array(k)
  for (let i = 0; i < entries.length; i += 1) remap[entries[i].index] = i

  const outLabels: Uint16Array<ArrayBufferLike> = new Uint16Array(n)
  for (let i = 0; i < n; i += 1) outLabels[i] = remap[labels[i]]

  const outHex: string[] = new Array(k)
  const outOk = new Float32Array(k * 3)

  for (let i = 0; i < entries.length; i += 1) {
    const src = entries[i].index
    const src3 = src * 3
    const dst3 = i * 3
    outOk[dst3] = paletteOk[src3]
    outOk[dst3 + 1] = paletteOk[src3 + 1]
    outOk[dst3 + 2] = paletteOk[src3 + 2]
    const r8 = linearToSrgb8(paletteLinRgb[src3])
    const g8 = linearToSrgb8(paletteLinRgb[src3 + 1])
    const b8 = linearToSrgb8(paletteLinRgb[src3 + 2])
    outHex[i] = rgb8ToHex(r8, g8, b8)
  }

  return { labels: outLabels, paletteHex: outHex, paletteOkLab: outOk }
}

function rgb8ToHex(r: number, g: number, b: number): string {
  const to2 = (v: number) => v.toString(16).padStart(2, '0').toUpperCase()
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

function applyBayerLumaDither(
  labels: Uint16Array<ArrayBufferLike>,
  width: number,
  height: number,
  pixelOkLab: Float32Array,
  paletteOkLab: Float32Array,
  strength: number
): Uint16Array<ArrayBufferLike> {
  // 4x4 Bayer matrix (0..15). We dither L only (value-preserving).
  const bayer4 = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5,
  ]
  const n = width * height
  const k = paletteOkLab.length / 3
  const out: Uint16Array<ArrayBufferLike> = new Uint16Array(n)
  const wL = 1.35

  for (let y = 0; y < height; y += 1) {
    const yOff = y * width
    const by = (y & 3) * 4
    for (let x = 0; x < width; x += 1) {
      const i = yOff + x
      const p3 = i * 3
      const t = bayer4[by + (x & 3)] / 15 // 0..1
      const L = pixelOkLab[p3] + (t - 0.5) * strength
      const a = pixelOkLab[p3 + 1]
      const b = pixelOkLab[p3 + 2]

      let best = labels[i]
      let bestD = Infinity
      for (let c = 0; c < k; c += 1) {
        const c3 = c * 3
        const d = okLabDistanceSqWeighted(
          L,
          a,
          b,
          paletteOkLab[c3],
          paletteOkLab[c3 + 1],
          paletteOkLab[c3 + 2],
          wL
        )
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      out[i] = best
    }
  }

  return out
}
