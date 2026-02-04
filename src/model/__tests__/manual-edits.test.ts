import { describe, expect, it } from 'vitest'
import { Pattern } from '../Pattern'
import { applyManualEditsToPattern, mergeManualEdits } from '../manual-edits'
import type { ManualStitchEdit } from '../../types'

function buildPattern(): Pattern {
  return new Pattern([
    { x: 0, y: 0, dmcCode: '310', marker: 'S', hex: '#000000' },
    { x: 1, y: 0, dmcCode: '321', marker: 'O', hex: '#CE1938' },
    { x: 0, y: 1, dmcCode: '699', marker: 'T', hex: '#136C00' },
    { x: 1, y: 1, dmcCode: '796', marker: 'D', hex: '#123071' },
  ], 2, 2)
}

describe('manual edits merge and apply', () => {
  it('applies paint and fabric edits by coordinate', () => {
    const pattern = buildPattern()
    const next = applyManualEditsToPattern(pattern, [
      { x: 1, y: 0, mode: 'paint', dmcCode: '666', marker: 'X', hex: '#EC2130' },
      { x: 0, y: 1, mode: 'fabric' },
    ])

    expect(next.stitches[1]).toMatchObject({ dmcCode: '666', marker: 'X', hex: '#EC2130' })
    expect(next.stitches[2]).toMatchObject({ dmcCode: 'Fabric', marker: '', hex: '#FFFFFF' })
  })

  it('keeps last edit when same cell is overwritten', () => {
    const edits: ManualStitchEdit[] = [
      { x: 0, y: 0, mode: 'paint', dmcCode: '666', marker: 'X', hex: '#EC2130' },
      { x: 0, y: 0, mode: 'fabric' },
    ]
    const merged = mergeManualEdits({}, edits)
    expect(merged['0:0']).toEqual({ x: 0, y: 0, mode: 'fabric' })
  })

  it('does not mutate source stitches', () => {
    const pattern = buildPattern()
    const originalFirst = { ...pattern.stitches[0] }
    const next = applyManualEditsToPattern(pattern, [{ x: 0, y: 0, mode: 'fabric' }])

    expect(next).not.toBe(pattern)
    expect(pattern.stitches[0]).toEqual(originalFirst)
  })

  it('returns original pattern when edits are out of bounds', () => {
    const pattern = buildPattern()
    const next = applyManualEditsToPattern(pattern, [{ x: 99, y: 99, mode: 'fabric' }])
    expect(next).toBe(pattern)
  })
})
