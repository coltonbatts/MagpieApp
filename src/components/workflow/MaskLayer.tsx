import React, { useEffect, useRef, useCallback } from 'react'
import type { ReferencePlacement, MaskConfig, MagicWandConfig } from '@/types'
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
    onMaskChange: (newMask: Uint8Array) => void
    onCommit: (newMask: Uint8Array) => void
}

/**
 * High-performance Masking Layer.
 * Renders the reference image with a Rubylith (red tint) overlay on unselected areas.
 * Handles mouse/touch painting logic.
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
    onMaskChange,
    onCommit
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

        // 1. Draw original working image
        ctx.clearRect(0, 0, width, height)
        ctx.putImageData(image, 0, 0)

        // 2. Create Rubylith (red tint) overlay for unselected (mask[i] === 0) areas
        const maskData = ctx.createImageData(width, height)
        const currentMask = maskCopyRef.current

        for (let i = 0; i < currentMask.length; i++) {
            const idx = i * 4
            // If mask is 0, it's NOT selected (fabric area). Tint it red.
            if (currentMask[i] === 0) {
                maskData.data[idx] = 220
                maskData.data[idx + 1] = 38
                maskData.data[idx + 2] = 38
                maskData.data[idx + 3] = 200 // Semi-opaque red
            } else {
                // Selected (stitch area). Keep it clear.
                maskData.data[idx + 3] = 0
            }
        }

        // 3. Composite the overlay with the user-defined opacity
        const overlayCanvas = document.createElement('canvas')
        overlayCanvas.width = width
        overlayCanvas.height = height
        overlayCanvas.getContext('2d')?.putImageData(maskData, 0, 0)

        ctx.save()
        ctx.globalAlpha = config.opacity
        ctx.drawImage(overlayCanvas, 0, 0)
        ctx.restore()

        // 4. Subtle brush preview (not implemented here for simplicity, but could be added)

    }, [image, config.opacity])

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
