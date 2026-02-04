import type { Pattern } from '@/model/Pattern'
import type { BuildArtifact, BuildRegion, GridPoint } from '@/types'

// Stage 4 RegionGraph is deterministic for a given locked pattern input:
// IDs and adjacency are stable across runs, and lockHash is order-independent.
// This mirrors the same connected-component intent used by Rust PDF regions,
// but is kept in TS for Build-stage picking/highlighting performance.
interface MutableRegion extends Omit<BuildRegion, 'id'> {
  pixels: number[]
}

function fnv1aHashString(seed: number, value: string): number {
  let hash = seed >>> 0
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

export function computeBuildLockHash(pattern: Pattern): string {
  let hash = 0x811c9dc5
  hash = fnv1aHashString(hash, `${pattern.width}x${pattern.height}`)
  hash = fnv1aHashString(hash, `sel:${pattern.selection?.id ?? 'none'}`)
  const raster = new Array<string>(pattern.width * pattern.height).fill('Fabric|#FFFFFF')
  for (const stitch of pattern.stitches) {
    if (stitch.x < 0 || stitch.y < 0 || stitch.x >= pattern.width || stitch.y >= pattern.height) continue
    raster[stitch.y * pattern.width + stitch.x] = `${stitch.dmcCode}|${stitch.hex}`
  }
  for (let i = 0; i < raster.length; i += 1) {
    hash = fnv1aHashString(hash, raster[i])
  }
  return hash.toString(16)
}

function colorKey(code: string, hex: string): string {
  return `${code.trim().toUpperCase()}|${hex.trim().toUpperCase()}`
}

function isFabric(code: string): boolean {
  return code.toLowerCase() === 'fabric'
}

function pickLabelPoint(width: number, pixels: number[]): GridPoint | null {
  if (pixels.length === 0) return null
  let sumX = 0
  let sumY = 0
  for (let i = 0; i < pixels.length; i += 1) {
    const idx = pixels[i]
    sumX += idx % width
    sumY += Math.floor(idx / width)
  }
  const meanX = sumX / pixels.length
  const meanY = sumY / pixels.length

  let best = pixels[0]
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < pixels.length; i += 1) {
    const idx = pixels[i]
    const x = idx % width
    const y = Math.floor(idx / width)
    const dx = x - meanX
    const dy = y - meanY
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      best = idx
      bestDist = dist
    }
  }

  return { x: best % width, y: Math.floor(best / width) }
}

function ensureLabelPoint(
  candidate: GridPoint | null,
  pixelRegionId: Uint32Array,
  width: number,
  regionId: number,
  pixels: number[]
): GridPoint | null {
  if (candidate) {
    const idx = candidate.y * width + candidate.x
    if (idx >= 0 && idx < pixelRegionId.length && pixelRegionId[idx] === regionId) {
      return candidate
    }
  }

  for (let i = 0; i < pixels.length; i += 1) {
    const idx = pixels[i]
    if (pixelRegionId[idx] === regionId) {
      return { x: idx % width, y: Math.floor(idx / width) }
    }
  }
  return null
}

function normalizeColorKeyOrder(pattern: Pattern): Array<{ key: string; dmcCode: string; hex: string }> {
  const byKey = new Map<string, { key: string; dmcCode: string; hex: string }>()
  const legend = pattern.getLegend()
  for (const entry of legend) {
    if (isFabric(entry.dmcCode)) continue
    const key = colorKey(entry.dmcCode, entry.hex)
    if (byKey.has(key)) continue
    byKey.set(key, {
      key,
      dmcCode: entry.dmcCode.trim().toUpperCase(),
      hex: entry.hex.trim().toUpperCase(),
    })
  }

  for (const stitch of pattern.stitches) {
    if (isFabric(stitch.dmcCode)) continue
    const key = colorKey(stitch.dmcCode, stitch.hex)
    if (byKey.has(key)) continue
    byKey.set(key, {
      key,
      dmcCode: stitch.dmcCode.trim().toUpperCase(),
      hex: stitch.hex.trim().toUpperCase(),
    })
  }

  return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key))
}

// Stage 4 region pipeline:
// 1) Map stitches to deterministic color indices.
// 2) Flood-fill connected components (4-neighbor) per color.
// 3) Sort components and assign stable region IDs.
// 4) Build fast lookup buffers used for picking/highlighting.
export function buildArtifactFromPattern(pattern: Pattern): BuildArtifact {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : 0
  const width = pattern.width
  const height = pattern.height
  const total = width * height
  const colorByPixel = new Int32Array(total).fill(-1)

  const colorIndexByKey = new Map<string, number>()
  const colorKeyByIndex: string[] = []
  const dmcCodeByIndex: string[] = []
  const hexByIndex: string[] = []

  const orderedColors = normalizeColorKeyOrder(pattern)
  for (let i = 0; i < orderedColors.length; i += 1) {
    const entry = orderedColors[i]
    colorIndexByKey.set(entry.key, i)
    colorKeyByIndex.push(entry.key)
    dmcCodeByIndex.push(entry.dmcCode)
    hexByIndex.push(entry.hex)
  }

  for (const stitch of pattern.stitches) {
    if (isFabric(stitch.dmcCode)) continue
    if (stitch.x < 0 || stitch.y < 0 || stitch.x >= width || stitch.y >= height) continue
    const key = colorKey(stitch.dmcCode, stitch.hex)
    let colorIndex = colorIndexByKey.get(key)
    if (colorIndex === undefined) {
      colorIndex = colorIndexByKey.size
      colorIndexByKey.set(key, colorIndex)
      colorKeyByIndex.push(key)
      dmcCodeByIndex.push(stitch.dmcCode)
      hexByIndex.push(stitch.hex)
    }
    colorByPixel[stitch.y * width + stitch.x] = colorIndex
  }

  const visited = new Uint8Array(total)
  const queue = new Int32Array(total)
  const rawRegions: MutableRegion[] = []

  for (let start = 0; start < total; start += 1) {
    const colorIndex = colorByPixel[start]
    if (colorIndex < 0 || visited[start] !== 0) continue

    let qHead = 0
    let qTail = 0
    queue[qTail++] = start
    visited[start] = 1

    const pixels: number[] = []
    let x0 = width
    let y0 = height
    let x1 = -1
    let y1 = -1

    while (qHead < qTail) {
      const idx = queue[qHead++]
      pixels.push(idx)
      const x = idx % width
      const y = Math.floor(idx / width)
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y

      if (x > 0) {
        const left = idx - 1
        if (visited[left] === 0 && colorByPixel[left] === colorIndex) {
          visited[left] = 1
          queue[qTail++] = left
        }
      }
      if (x + 1 < width) {
        const right = idx + 1
        if (visited[right] === 0 && colorByPixel[right] === colorIndex) {
          visited[right] = 1
          queue[qTail++] = right
        }
      }
      if (y > 0) {
        const up = idx - width
        if (visited[up] === 0 && colorByPixel[up] === colorIndex) {
          visited[up] = 1
          queue[qTail++] = up
        }
      }
      if (y + 1 < height) {
        const down = idx + width
        if (visited[down] === 0 && colorByPixel[down] === colorIndex) {
          visited[down] = 1
          queue[qTail++] = down
        }
      }
    }

    rawRegions.push({
      colorIndex,
      colorKey: colorKeyByIndex[colorIndex],
      dmcCode: dmcCodeByIndex[colorIndex],
      hex: hexByIndex[colorIndex],
      bbox: { x0, y0, x1, y1 },
      area: pixels.length,
      pixels,
    })
  }

  rawRegions.sort((a, b) => (
    a.colorIndex - b.colorIndex
    || b.area - a.area
    || a.bbox.y0 - b.bbox.y0
    || a.bbox.x0 - b.bbox.x0
  ))

  const pixelRegionId = new Uint32Array(total)
  const regions: BuildRegion[] = []
  const labelPointByRegionId: Array<GridPoint | null> = [null]
  const regionsByColor = Array.from({ length: colorIndexByKey.size }, () => [] as number[])
  const outlineSegmentsByRegionId = Array.from({ length: rawRegions.length + 1 }, () => null as number[] | null)
  const allBoundarySegments: number[] = []

  for (let i = 0; i < rawRegions.length; i += 1) {
    const raw = rawRegions[i]
    const id = i + 1
    regions.push({
      id,
      colorIndex: raw.colorIndex,
      colorKey: raw.colorKey,
      dmcCode: raw.dmcCode,
      hex: raw.hex,
      bbox: raw.bbox,
      area: raw.area,
    })
    regionsByColor[raw.colorIndex].push(id)
    for (let p = 0; p < raw.pixels.length; p += 1) {
      pixelRegionId[raw.pixels[p]] = id
    }
    labelPointByRegionId[id] = ensureLabelPoint(
      pickLabelPoint(width, raw.pixels),
      pixelRegionId,
      width,
      id,
      raw.pixels
    )
  }

  const adjacencySets = Array.from({ length: regions.length + 1 }, () => new Set<number>())
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width
    for (let x = 0; x < width; x += 1) {
      const idx = rowOffset + x
      const regionId = pixelRegionId[idx]
      if (regionId === 0) continue
      const regionSegments = outlineSegmentsByRegionId[regionId] ?? (outlineSegmentsByRegionId[regionId] = [])
      const x0 = x
      const y0 = y
      const x1 = x + 1
      const y1 = y + 1
      if (x + 1 < width) {
        const right = pixelRegionId[idx + 1]
        if (right !== 0 && right !== regionId) {
          adjacencySets[regionId].add(right)
          adjacencySets[right].add(regionId)
        }
        if (right !== regionId) {
          allBoundarySegments.push(x1, y0, x1, y1)
          regionSegments.push(x1, y0, x1, y1)
        }
      } else {
        allBoundarySegments.push(x1, y0, x1, y1)
        regionSegments.push(x1, y0, x1, y1)
      }
      if (y + 1 < height) {
        const down = pixelRegionId[idx + width]
        if (down !== 0 && down !== regionId) {
          adjacencySets[regionId].add(down)
          adjacencySets[down].add(regionId)
        }
        if (down !== regionId) {
          allBoundarySegments.push(x0, y1, x1, y1)
          regionSegments.push(x0, y1, x1, y1)
        }
      } else {
        allBoundarySegments.push(x0, y1, x1, y1)
        regionSegments.push(x0, y1, x1, y1)
      }
      if (x === 0) {
        allBoundarySegments.push(x0, y0, x0, y1)
        regionSegments.push(x0, y0, x0, y1)
      }
      if (y === 0) {
        allBoundarySegments.push(x0, y0, x1, y0)
        regionSegments.push(x0, y0, x1, y0)
      }
    }
  }
  const adjacency = adjacencySets.map((set) => Array.from(set).sort((a, b) => a - b))

  if (import.meta.env.DEV && typeof performance !== 'undefined') {
    const tookMs = performance.now() - startedAt
    if (tookMs > 18) {
      console.info('[BuildArtifact] slow build', {
        tookMs: Math.round(tookMs * 100) / 100,
        width,
        height,
        regions: regions.length,
      })
    }
  }

  return {
    lockHash: computeBuildLockHash(pattern),
    width,
    height,
    regions,
    pixelRegionId,
    regionsByColor,
    labelPointByRegionId,
    adjacency,
    allBoundarySegments,
    outlineSegmentsByRegionId,
  }
}
