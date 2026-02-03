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
})
