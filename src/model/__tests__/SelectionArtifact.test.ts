import { describe, it, expect } from 'vitest'
import { SelectionArtifactModel } from '../SelectionArtifact'

describe('SelectionArtifactModel', () => {
    const width = 10
    const height = 10
    const refId = 'test-ref-1'

    it('createDefault produces a valid "Select All" mask', () => {
        const sel = SelectionArtifactModel.createDefault(width, height, refId)

        expect(sel.width).toBe(width)
        expect(sel.height).toBe(height)
        expect(sel.referenceId).toBe(refId)
        expect(sel.mask.length).toBe(width * height)
        expect(sel.isDefault).toBe(true)

        // Should be all 1s
        const allOnes = sel.mask.every(v => v === 1)
        expect(allOnes).toBe(true)
    })

    it('assertValid passes for correct dimensions and ref', () => {
        const sel = SelectionArtifactModel.createDefault(width, height, refId)
        expect(() => {
            SelectionArtifactModel.assertValid(sel, width, height, refId)
        }).not.toThrow()
    })

    it('assertValid fails on dimension mismatch', () => {
        const sel = SelectionArtifactModel.createDefault(width, height, refId)
        expect(() => {
            SelectionArtifactModel.assertValid(sel, width + 1, height, refId)
        }).toThrow(/Dimension mismatch/)
    })

    it('assertValid fails on referenceId mismatch', () => {
        const sel = SelectionArtifactModel.createDefault(width, height, refId)
        expect(() => {
            SelectionArtifactModel.assertValid(sel, width, height, 'other-ref')
        }).toThrow(/ReferenceId mismatch/)
    })

    it('assertValid fails on mask length mismatch', () => {
        const sel = SelectionArtifactModel.createDefault(width, height, refId)
        sel.mask = new Uint8Array(5) // Corrupt it
        expect(() => {
            SelectionArtifactModel.assertValid(sel, width, height, refId)
        }).toThrow(/Mask buffer size mismatch/)
    })

    it('updateMask creates a new version with non-default status', () => {
        const sel = SelectionArtifactModel.createDefault(width, height, refId)
        const nextMask = new Uint8Array(width * height).fill(0)
        const updated = SelectionArtifactModel.updateMask(sel, nextMask)

        expect(updated.id).not.toBe(sel.id)
        expect(updated.isDefault).toBe(false)
        expect(updated.mask).toBe(nextMask)
        expect(updated.referenceId).toBe(refId)
    })

    it('resampleMaskNearest deterministically downsamples and upsamples', () => {
        const source4x4 = new Uint8Array([
            1, 1, 0, 0,
            1, 1, 0, 0,
            0, 0, 1, 1,
            0, 0, 1, 1,
        ])

        const down2x2 = SelectionArtifactModel.resampleMaskNearest(source4x4, 4, 4, 2, 2)
        expect(Array.from(down2x2)).toEqual([
            1, 0,
            0, 1,
        ])

        const up4x4 = SelectionArtifactModel.resampleMaskNearest(down2x2, 2, 2, 4, 4)
        expect(Array.from(up4x4)).toEqual([
            1, 1, 0, 0,
            1, 1, 0, 0,
            0, 0, 1, 1,
            0, 0, 1, 1,
        ])
    })

    it('resampleTo creates a build-compatible selection that still passes contract checks', () => {
        const workingSelection = SelectionArtifactModel.createDefault(8, 6, refId)
        const buildSelection = SelectionArtifactModel.resampleTo(workingSelection, 4, 3)

        expect(buildSelection.referenceId).toBe(refId)
        expect(buildSelection.width).toBe(4)
        expect(buildSelection.height).toBe(3)
        expect(buildSelection.mask.length).toBe(12)

        expect(() => {
            SelectionArtifactModel.assertValid(buildSelection, 4, 3, refId)
        }).not.toThrow()
    })

    it('resampleTo preserves select-all intent for default selections', () => {
        const workingSelection = SelectionArtifactModel.createDefault(8, 6, refId)
        const buildSelection = SelectionArtifactModel.resampleTo(workingSelection, 4, 3)
        expect(buildSelection.isDefault).toBe(true)
        expect(Array.from(buildSelection.mask)).toEqual(new Array(12).fill(1))
    })

    it('resampleMaskNearest fallback keeps sparse selections from collapsing to empty', () => {
        const sparse4x4 = new Uint8Array([
            1, 0, 1, 0,
            0, 0, 0, 0,
            1, 0, 1, 0,
            0, 0, 0, 0,
        ])

        const down2x2 = SelectionArtifactModel.resampleMaskNearest(sparse4x4, 4, 4, 2, 2)
        expect(Array.from(down2x2)).toEqual([
            1, 1,
            1, 1,
        ])
    })
})
