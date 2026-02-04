import React, { useEffect, useRef, useCallback } from 'react'
import type { ReferencePlacement, MaskConfig, MagicWandConfig, RGBColor } from '@/types'
import { invoke } from '@tauri-apps/api/core'

interface MaskLayerProps {
    image: ImageData
    mask: Uint8Array
    placement: ReferencePlacement
    config: MaskConfig
    tool: 'brush' | 'eraser' | 'magic'
    magicWandConfig?: MagicWandConfig
    selectionWorkspaceId?: string | null
    selectionMode?: 'replace' | 'add' | 'subtract'
    fabricColor?: RGBColor
    onMaskChange: (newMask: Uint8Array) => void
    onCommit: (newMask: Uint8Array) => void
    onPointerSample?: (sample: { x: number; y: number }) => void
}

/**
 * High-performance Masking Layer.
 * Renders the reference image with fabric color showing through unselected areas.
 * This gives a true preview: selected areas show the reference (what will be stitched),
 * unselected areas show fabric (what will remain as fabric).
 */
export function MaskLayer({
    image,
    mask,
    placement,
    config,
    tool,
    magicWandConfig,
    selectionWorkspaceId,
    selectionMode = 'replace',
    fabricColor = { r: 245, g: 245, b: 220 }, // Default light linen
    onMaskChange,
    onCommit,
    onPointerSample
}: MaskLayerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const maskCopyRef = useRef<Uint8Array>(new Uint8Array(mask))
    const isDrawing = useRef(false)

    // Sync if mask prop changes externally (e.g. Invert, Clear All)
    useEffect(() => {
        // Only update if it's truly a different buffer (not our own local edit)
        if (mask.buffer !== maskCopyRef.current.buffer || mask.length !== maskCopyRef.current.length) {
            maskCopyRef.current = new Uint8Array(mask)
            render()
        }
    }, [mask])

    const render = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const { width, height } = image
        if (canvas.width !== width) {
            canvas.width = width
            canvas.height = height
        }

        ctx.clearRect(0, 0, width, height)
        const currentMask = maskCopyRef.current
        const imageData = ctx.createImageData(width, height)
        const imagePixels = image.data

        // Render pixel by pixel:
        // - Selected areas (mask[i] === 1): Show reference image (what will be stitched)
        // - Unselected areas (mask[i] === 0): Show fabric color (what will remain)
        for (let i = 0; i < currentMask.length; i++) {
            const idx = i * 4
            
            if (currentMask[i] === 1) {
                // Selected: Show reference image (what you're keeping/stitching)
                imageData.data[idx] = imagePixels[idx]
                imageData.data[idx + 1] = imagePixels[idx + 1]
                imageData.data[idx + 2] = imagePixels[idx + 2]
                imageData.data[idx + 3] = imagePixels[idx + 3]
            } else {
                // Unselected: Show fabric color (what will remain as fabric)
                // Blend fabric with a subtle red tint to indicate "removal"
                const removalTint = 0.15 // How much red tint to add
                const fabricBlend = 1 - removalTint
                
                imageData.data[idx] = Math.min(255, fabricColor.r * fabricBlend + 220 * removalTint)
                imageData.data[idx + 1] = Math.min(255, fabricColor.g * fabricBlend + 38 * removalTint)
                imageData.data[idx + 2] = Math.min(255, fabricColor.b * fabricBlend + 38 * removalTint)
                imageData.data[idx + 3] = 255
            }
        }

        ctx.putImageData(imageData, 0, 0)

        // Add subtle red border on edges between selected/unselected areas
        // This helps distinguish "removed" areas while still showing fabric color
        if (config.opacity > 0.1) {
            ctx.save()
            ctx.globalAlpha = config.opacity * 0.4
            ctx.fillStyle = 'rgba(220, 38, 38, 0.3)'
            
            // Only draw borders at edges (more efficient than checking every pixel)
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = y * width + x
                    if (currentMask[idx] === 0) {
                        // Check if this unselected pixel borders a selected pixel
                        const hasSelectedNeighbor = 
                            (x > 0 && currentMask[(y * width + (x - 1))] === 1) ||
                            (x < width - 1 && currentMask[(y * width + (x + 1))] === 1) ||
                            (y > 0 && currentMask[((y - 1) * width + x)] === 1) ||
                            (y < height - 1 && currentMask[((y + 1) * width + x)] === 1)
                        
                        if (hasSelectedNeighbor) {
                            ctx.fillRect(x, y, 1, 1)
                        }
                    }
                }
            }
            ctx.restore()
        }

    }, [image, config.opacity, fabricColor])

    useEffect(() => {
        render()
    }, [render])

    const handlePointerDown = async (e: React.PointerEvent) => {
        if (tool === 'magic') {
            await handleMagicWandClick(e)
            return
        }
        isDrawing.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        handlePointerUpdate(e)
    }

    const handleMagicWandClick = async (e: React.PointerEvent) => {
        const canvas = canvasRef.current
        if (!canvas || !magicWandConfig || !selectionWorkspaceId) return

        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height

        const x = Math.floor((e.clientX - rect.left) * scaleX)
        const y = Math.floor((e.clientY - rect.top) * scaleY)

        try {
            const resultMask = await invoke<number[]>('magic_wand_click_command', {
                workspaceId: selectionWorkspaceId,
                params: {
                    seed_x: x,
                    seed_y: y,
                    tolerance: magicWandConfig.tolerance,
                    edge_stop: magicWandConfig.edgeStop
                }
            })

            const newMask = new Uint8Array(maskCopyRef.current.length)
            const resultArr = new Uint8Array(resultMask)

            if (selectionMode === 'replace') {
                newMask.set(resultArr)
            } else if (selectionMode === 'add') {
                for (let i = 0; i < newMask.length; i++) {
                    newMask[i] = maskCopyRef.current[i] | resultArr[i]
                }
            } else if (selectionMode === 'subtract') {
                for (let i = 0; i < newMask.length; i++) {
                    newMask[i] = maskCopyRef.current[i] & (resultArr[i] === 1 ? 0 : 1)
                }
            }

            maskCopyRef.current = newMask
            render()
            onMaskChange(newMask)
            onCommit(newMask)
        } catch (err) {
            console.error('Magic Wand failed:', err)
        }
    }

    const handlePointerUpdate = (e: React.PointerEvent) => {
        if (!isDrawing.current) return

        const canvas = canvasRef.current
        if (!canvas) return

        const rect = canvas.getBoundingClientRect()
        // Calculate coordinates in the source image space
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height

        const x = (e.clientX - rect.left) * scaleX
        const y = (e.clientY - rect.top) * scaleY
        onPointerSample?.({
            x: Math.floor(x),
            y: Math.floor(y),
        })

        applyBrush(x, y)
        render()
    }

    const applyBrush = (cx: number, cy: number) => {
        const { width, height } = image
        // The brush size is in "display pixels" relative to the hoop, but we need it in "image pixels"
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return

        const imageToDisplayScale = width / rect.width
        const radius = (config.brushSize * imageToDisplayScale) / 2

        const currentMask = maskCopyRef.current
        const val = tool === 'brush' ? 1 : 0

        const rSq = radius * radius
        let changed = false

        for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(height, Math.ceil(cy + radius)); y++) {
            for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(width, Math.ceil(cx + radius)); x++) {
                const dx = x - cx
                const dy = y - cy
                if (dx * dx + dy * dy <= rSq) {
                    const idx = y * width + x
                    if (currentMask[idx] !== val) {
                        currentMask[idx] = val
                        changed = true
                    }
                }
            }
        }

        if (changed) {
            // Optional: emit change immediately if we want preview outside
        }
    }

    const handlePointerUp = (e: React.PointerEvent) => {
        if (isDrawing.current) {
            isDrawing.current = false
            e.currentTarget.releasePointerCapture(e.pointerId)
            // Emit final mask state to parent/store
            const finalMask = new Uint8Array(maskCopyRef.current)
            onMaskChange(finalMask)
            onCommit(finalMask)
        }
    }

    const canvasStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${placement.x * 100}%`,
        top: `${placement.y * 100}%`,
        width: `${placement.width * 100}%`,
        height: `${placement.height * 100}%`,
        imageRendering: 'crisp-edges',
        cursor: 'crosshair'
    }

    return (
        <canvas
            ref={canvasRef}
            style={canvasStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerUpdate}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="touch-none"
        />
    )
}
