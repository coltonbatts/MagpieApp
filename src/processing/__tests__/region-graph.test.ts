import { describe, expect, it } from 'vitest'
import { Pattern } from '@/model/Pattern'
import type { Stitch } from '@/types'
import { buildArtifactFromPattern } from '@/processing/region-graph'

function patternFromRows(rows: string[]): Pattern {
  const height = rows.length
  const width = rows[0]?.length ?? 0
  const stitches: Stitch[] = []
  const colorByToken: Record<string, { code: string; hex: string }> = {
    A: { code: 'RAW-1', hex: '#D62828' },
    B: { code: 'RAW-2', hex: '#277DA1' },
    C: { code: 'RAW-3', hex: '#43AA8B' },
    D: { code: 'RAW-4', hex: '#6A4C93' },
    '.': { code: 'Fabric', hex: '#FFFFFF' },
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const token = rows[y][x]
      const color = colorByToken[token]
      stitches.push({
        x,
        y,
        dmcCode: color.code,
        hex: color.hex,
        marker: token === '.' ? '' : token,
      })
    }
  }

  return new Pattern(stitches, width, height)
}

function patternFromRowsReversed(rows: string[]): Pattern {
  const base = patternFromRows(rows)
  return new Pattern([...base.stitches].reverse(), base.width, base.height)
}

describe('buildArtifactFromPattern', () => {
  it('assigns deterministic stable region IDs', () => {
    const pattern = patternFromRows([
      'AA.BB',
      'A..B.',
      'A.CC.',
      '..C.A',
    ])

    const a = buildArtifactFromPattern(pattern)
    const b = buildArtifactFromPattern(pattern)

    expect(a.lockHash).toBe(b.lockHash)
    expect(a.regions).toEqual(b.regions)
    expect(Array.from(a.pixelRegionId)).toEqual(Array.from(b.pixelRegionId))
    expect(a.regions.map((region) => ({ id: region.id, color: region.colorIndex, area: region.area }))).toEqual([
      { id: 1, color: 0, area: 4 },
      { id: 2, color: 0, area: 1 },
      { id: 3, color: 1, area: 3 },
      { id: 4, color: 2, area: 3 },
    ])
  })

  it('keeps region IDs stable even when stitch iteration order differs', () => {
    const rows = [
      'AA.BB',
      'A..B.',
      'A.CC.',
      '..C.A',
    ]
    const forward = buildArtifactFromPattern(patternFromRows(rows))
    const reversed = buildArtifactFromPattern(patternFromRowsReversed(rows))

    expect(forward.regions).toEqual(reversed.regions)
    expect(Array.from(forward.pixelRegionId)).toEqual(Array.from(reversed.pixelRegionId))
    expect(forward.regionsByColor).toEqual(reversed.regionsByColor)
    expect(forward.lockHash).toBe(reversed.lockHash)
  })

  it('builds a correct pixelRegionId lookup grid', () => {
    const pattern = patternFromRows([
      'A.A',
      'AAA',
      '..B',
    ])
    const artifact = buildArtifactFromPattern(pattern)
    const rows = []
    for (let y = 0; y < artifact.height; y += 1) {
      const row = []
      for (let x = 0; x < artifact.width; x += 1) {
        row.push(artifact.pixelRegionId[y * artifact.width + x])
      }
      rows.push(row)
    }

    expect(rows).toEqual([
      [1, 0, 1],
      [1, 1, 1],
      [0, 0, 2],
    ])
  })

  it('keeps label point inside region on a ring-like shape', () => {
    const artifact = buildArtifactFromPattern(patternFromRows([
      'AAAAA',
      'A...A',
      'A...A',
      'A...A',
      'AAAAA',
    ]))
    const region = artifact.regions[0]
    const point = artifact.labelPointByRegionId?.[region.id]
    expect(point).toBeTruthy()
    const idx = point!.y * artifact.width + point!.x
    expect(artifact.pixelRegionId[idx]).toBe(region.id)
  })

  it('computes deterministic symmetric adjacency', () => {
    const artifact = buildArtifactFromPattern(patternFromRows([
      'AABB',
      'AABB',
      'CCDD',
      'CCDD',
    ]))
    const adjacency = artifact.adjacency ?? []

    // Region ordering by color index then area -> A:1 B:2 C:3 D:4
    expect(adjacency[1]).toEqual([2, 3])
    expect(adjacency[2]).toEqual([1, 4])
    expect(adjacency[3]).toEqual([1, 4])
    expect(adjacency[4]).toEqual([2, 3])

    for (let regionId = 1; regionId < adjacency.length; regionId += 1) {
      for (const neighbor of adjacency[regionId]) {
        expect(adjacency[neighbor]).toContain(regionId)
      }
      const sorted = [...adjacency[regionId]].sort((a, b) => a - b)
      expect(adjacency[regionId]).toEqual(sorted)
    }
  })
})
