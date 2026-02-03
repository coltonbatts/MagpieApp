import { SelectionArtifact } from '@/types'

/**
 * SelectionArtifactModel
 *
 * This represents the authoritative logic for managing the SelectionArtifact contract.
 *
 * INVARIANTS:
 * 1. Dimensions (width/height) MUST match the ReferenceImage exactly.
 * 2. referenceId MUST match the currently active image ID.
 * 3. mask.length MUST exactly equal width * height.
 */
export const SelectionArtifactModel = {
    /**
     * Generates a deterministic "Select All" mask for a new reference image.
     */
    createDefault(width: number, height: number, referenceId: string): SelectionArtifact {
        const mask = new Uint8Array(width * height).fill(1)
        return {
            id: `sel_${Math.random().toString(36).substring(2, 9)}`,
            referenceId,
            mask,
            width,
            height,
            isDefault: true,
        }
    },

    /**
     * Creates a modified copy of a selection, ensuring it remains tied to the correct reference.
     */
    updateMask(prev: SelectionArtifact, newMask: Uint8Array): SelectionArtifact {
        this.assertValidMask(newMask, prev.width, prev.height)

        return {
            ...prev,
            id: `sel_${Math.random().toString(36).substring(2, 9)}`, // New version ID
            mask: newMask,
            isDefault: false,
        }
    },

    /**
     * Asserts that a selection is compatible with the given image context.
     * Throws if contract invariants are violated.
     */
    assertValid(selection: SelectionArtifact, expectedWidth: number, expectedHeight: number, expectedReferenceId: string) {
        if (selection.width !== expectedWidth || selection.height !== expectedHeight) {
            throw new Error(
                `[SelectionContract] Dimension mismatch! Selection is ${selection.width}x${selection.height}, but Reference is ${expectedWidth}x${expectedHeight}`
            )
        }
        if (selection.referenceId !== expectedReferenceId) {
            throw new Error(
                `[SelectionContract] ReferenceId mismatch! Selection belongs to ${selection.referenceId}, but current Reference is ${expectedReferenceId}`
            )
        }
        SelectionArtifactModel.assertValidMask(selection.mask, selection.width, selection.height)
    },

    /**
     * Helper for persistence. Note that Uint8Array requires conversion for standard JSON.
     */
    toJSON(selection: SelectionArtifact) {
        return {
            ...selection,
            mask: Array.from(selection.mask),
            _version: 1, // Contract versioning
        }
    },

    fromJSON(data: any): SelectionArtifact {
        return {
            ...data,
            mask: new Uint8Array(data.mask),
        }
    },

    assertValidMask(mask: Uint8Array, width: number, height: number) {
        if (mask.length !== width * height) {
            throw new Error(
                `[SelectionContract] Mask buffer size mismatch! Expected ${width * height}, got ${mask.length}`
            )
        }
    },

    /**
     * Dev-only consistency check for Pattern consumers.
     * Confirms that stitch counts match mask coverage expectations.
     */
    validateConsistency(selection: SelectionArtifact, stitchCount: number, totalPixels: number) {
        if (!import.meta.env.DEV) return

        const maskStitchCount = selection.mask.reduce((acc, val) => acc + val, 0)
        // If selection is present, stitch count should generally align with mask count
        // Note: Some stitches might be further filtered by fabric threshold, so we check for "not more than"
        if (stitchCount > maskStitchCount) {
            console.warn(`[SelectionContract] Consistency Warning: Pattern has ${stitchCount} stitches, but mask only allows ${maskStitchCount}`)
        } else {
            console.log(`[SelectionContract] Consistency check passed: ${stitchCount} stitches (Mask allows ${maskStitchCount}, Total pixels: ${totalPixels})`)
        }
    }
}
