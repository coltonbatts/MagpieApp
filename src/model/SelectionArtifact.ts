import { SelectionArtifact } from '@/types'

/**
 * SelectionArtifactModel
 *
 * This represents the authoritative logic for managing the SelectionArtifact contract.
 *
 * INVARIANTS:
 * 1. Dimensions (width/height) MUST match the active selection working image.
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
     * Deterministically resamples a binary selection mask to a new grid.
     * Uses nearest-neighbor to preserve hard mask edges.
     */
    resampleTo(selection: SelectionArtifact, targetWidth: number, targetHeight: number): SelectionArtifact {
        const width = Math.max(1, Math.floor(targetWidth))
        const height = Math.max(1, Math.floor(targetHeight))
        this.assertValidMask(selection.mask, selection.width, selection.height)

        if (selection.isDefault) {
            return {
                ...selection,
                id: `${selection.id}_rs_${width}x${height}`,
                width,
                height,
                mask: new Uint8Array(width * height).fill(1),
            }
        }

        if (selection.width === width && selection.height === height) {
            return selection
        }

        const resampled = this.resampleMaskNearest(
            selection.mask,
            selection.width,
            selection.height,
            width,
            height
        )

        return {
            ...selection,
            id: `${selection.id}_rs_${width}x${height}`,
            width,
            height,
            mask: resampled,
        }
    },

    resampleMaskNearest(
        mask: Uint8Array,
        sourceWidth: number,
        sourceHeight: number,
        targetWidth: number,
        targetHeight: number
    ): Uint8Array {
        const srcW = Math.max(1, Math.floor(sourceWidth))
        const srcH = Math.max(1, Math.floor(sourceHeight))
        const dstW = Math.max(1, Math.floor(targetWidth))
        const dstH = Math.max(1, Math.floor(targetHeight))
        this.assertValidMask(mask, srcW, srcH)

        const sourceSelected = countSelected(mask)
        const isDownsampling = srcW > dstW || srcH > dstH
        const result = resampleNearest(
            mask,
            srcW,
            srcH,
            dstW,
            dstH,
            isDownsampling ? 'center' : 'origin'
        )

        if (!isDownsampling || sourceSelected === 0 || countSelected(result) > 0) {
            return result
        }

        // Fallback alignment for pathological downsample alignments that can erase sparse selections.
        return resampleNearest(mask, srcW, srcH, dstW, dstH, 'origin')
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

function resampleNearest(
    mask: Uint8Array,
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number,
    alignment: 'center' | 'origin'
): Uint8Array {
    const result = new Uint8Array(targetWidth * targetHeight)
    const scaleX = sourceWidth / targetWidth
    const scaleY = sourceHeight / targetHeight

    for (let y = 0; y < targetHeight; y += 1) {
        const srcY = alignment === 'center'
            ? Math.max(0, Math.min(sourceHeight - 1, Math.floor((y + 0.5) * scaleY - 0.5)))
            : Math.max(0, Math.min(sourceHeight - 1, Math.floor(y * scaleY)))
        const srcYOff = srcY * sourceWidth
        const dstYOff = y * targetWidth
        for (let x = 0; x < targetWidth; x += 1) {
            const srcX = alignment === 'center'
                ? Math.max(0, Math.min(sourceWidth - 1, Math.floor((x + 0.5) * scaleX - 0.5)))
                : Math.max(0, Math.min(sourceWidth - 1, Math.floor(x * scaleX)))
            const srcValue = mask[srcYOff + srcX]
            result[dstYOff + x] = srcValue > 0 ? 1 : 0
        }
    }

    return result
}

function countSelected(mask: Uint8Array): number {
    let selected = 0
    for (let i = 0; i < mask.length; i += 1) {
        if (mask[i] > 0) selected += 1
    }
    return selected
}
