import { useEffect, useRef, useState, useCallback } from 'react'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { SelectionArtifactModel } from '@/model/SelectionArtifact'

export function SelectStage() {
    const { normalizedImage, referenceId, selection, setSelection, maskConfig, setMaskConfig } = usePatternStore()
    const { setWorkflowStage } = useUIStore()
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [tool, setTool] = useState<'brush' | 'eraser'>('brush')

    // Performance refs: avoid React state chugging during mouse move
    const maskRef = useRef<Uint8Array | null>(null)
    const isDirtyRef = useRef(false)
    const offscreenOverlayRef = useRef<HTMLCanvasElement | null>(null)

    // Sync store selection to local ref if IDs mismatch (e.g. initial load or undo/redo)
    useEffect(() => {
        if (selection && (!maskRef.current || selection.mask !== maskRef.current)) {
            // Only update from store if it's a "remote" change (not our own draw)
            maskRef.current = new Uint8Array(selection.mask)
            isDirtyRef.current = true
        }
    }, [selection])

    // Initialize selection if it doesn't exist
    useEffect(() => {
        if (normalizedImage && referenceId && !selection) {
            setSelection(SelectionArtifactModel.createDefault(
                normalizedImage.width,
                normalizedImage.height,
                referenceId
            ))
        }
    }, [normalizedImage, referenceId, selection, setSelection])

    // Pre-calculate the dimming overlay whenever dimensions or mask opacity change
    useEffect(() => {
        if (!normalizedImage) return
        const { width, height } = normalizedImage
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.fillStyle = `rgba(0,0,0,${0.3 * (1 - maskConfig.opacity)})`
            ctx.fillRect(0, 0, width, height)
        }
        offscreenOverlayRef.current = canvas
        isDirtyRef.current = true
    }, [normalizedImage, maskConfig.opacity])

    const drawMask = useCallback(() => {
        const canvas = canvasRef.current
        const mask = maskRef.current
        if (!canvas || !normalizedImage || !mask) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const { width, height } = normalizedImage
        if (canvas.width !== width) {
            canvas.width = width
            canvas.height = height
        }

        // 1. Draw original image
        ctx.putImageData(normalizedImage, 0, 0)

        // 2. Draw mask overlay (Blue tint for stitched area)
        const maskImgData = ctx.createImageData(width, height)
        const alpha = Math.round(maskConfig.opacity * 255)

        for (let i = 0; i < mask.length; i++) {
            const isMasked = mask[i] === 1
            const idx = i * 4
            if (isMasked) {
                maskImgData.data[idx] = 0
                maskImgData.data[idx + 1] = 120
                maskImgData.data[idx + 2] = 255
                maskImgData.data[idx + 3] = alpha
            } else {
                maskImgData.data[idx + 3] = 0
            }
        }

        // Put mask overlay
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = width
        tempCanvas.height = height
        tempCanvas.getContext('2d')?.putImageData(maskImgData, 0, 0)
        ctx.drawImage(tempCanvas, 0, 0)

        // 3. Draw semi-transparent dimming over fabric area
        if (offscreenOverlayRef.current) {
            ctx.save()
            // Draw the full dimming overlay
            ctx.drawImage(offscreenOverlayRef.current, 0, 0)

            // Now REMOVE the dimming where mask is 1 (destination-out)
            ctx.globalCompositeOperation = 'destination-out'
            const clearData = ctx.createImageData(width, height)
            for (let i = 0; i < mask.length; i++) {
                if (mask[i] === 1) clearData.data[i * 4 + 3] = 255
            }
            const clearCanvas = document.createElement('canvas')
            clearCanvas.width = width
            clearCanvas.height = height
            clearCanvas.getContext('2d')?.putImageData(clearData, 0, 0)
            ctx.drawImage(clearCanvas, 0, 0)

            ctx.restore()
        }

        isDirtyRef.current = false
    }, [normalizedImage, maskConfig.opacity])

    // rAF loop for smooth rendering
    useEffect(() => {
        let frameId: number
        const loop = () => {
            if (isDirtyRef.current) {
                drawMask()
            }
            frameId = requestAnimationFrame(loop)
        }
        frameId = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(frameId)
    }, [drawMask])

    const handlePointerUpdate = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !normalizedImage || !selection || !maskRef.current) return

        const canvas = canvasRef.current
        if (!canvas) return

        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height

        const x = Math.floor((e.clientX - rect.left) * scaleX)
        const y = Math.floor((e.clientY - rect.top) * scaleY)

        const radius = Math.max(1, Math.floor(maskConfig.brushSize / (rect.width / canvas.width) / 2))
        const mask = maskRef.current
        const val = tool === 'brush' ? 1 : 0
        const width = canvas.width
        const height = canvas.height

        let changed = false
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const distSq = dx * dx + dy * dy
                if (distSq <= radius * radius) {
                    const nx = x + dx
                    const ny = y + dy
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const idx = ny * width + nx
                        if (mask[idx] !== val) {
                            mask[idx] = val
                            changed = true
                        }
                    }
                }
            }
        }

        if (changed) {
            isDirtyRef.current = true
        }
    }

    const commitMask = () => {
        if (maskRef.current && selection) {
            setSelection(SelectionArtifactModel.updateMask(selection, new Uint8Array(maskRef.current)))
        }
    }

    const handleAutoSubject = () => {
        if (!normalizedImage || !selection) return
        const { width, height } = normalizedImage
        const newMask = new Uint8Array(width * height).fill(0)
        for (let y = Math.floor(height * 0.2); y < height * 0.8; y++) {
            for (let x = Math.floor(width * 0.2); x < width * 0.8; x++) {
                newMask[y * width + x] = 1
            }
        }
        maskRef.current = newMask
        isDirtyRef.current = true
        commitMask()
    }

    const handleInvert = () => {
        if (!maskRef.current) return
        const mask = maskRef.current
        for (let i = 0; i < mask.length; i++) {
            mask[i] = mask[i] === 1 ? 0 : 1
        }
        isDirtyRef.current = true
        commitMask()
    }

    if (!normalizedImage) return null

    return (
        <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar Controls */}
                <div className="w-64 bg-white border-r border-gray-200 p-6 flex flex-col space-y-6">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Tools</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setTool('brush')}
                                className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${tool === 'brush' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500 hover:border-gray-200'
                                    }`}
                            >
                                <div className="text-xl mb-1">🖌️</div>
                                <span className="text-xs font-medium">Brush</span>
                            </button>
                            <button
                                onClick={() => setTool('eraser')}
                                className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${tool === 'eraser' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500 hover:border-gray-200'
                                    }`}
                            >
                                <div className="text-xl mb-1">🧽</div>
                                <span className="text-xs font-medium">Eraser</span>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs font-medium text-gray-500 mb-2">
                                <span>Brush Size</span>
                                <span>{maskConfig.brushSize}px</span>
                            </div>
                            <input
                                type="range"
                                min="5"
                                max="100"
                                value={maskConfig.brushSize}
                                onChange={(e) => setMaskConfig({ brushSize: parseInt(e.target.value) })}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                        <div>
                            <div className="flex justify-between text-xs font-medium text-gray-500 mb-2">
                                <span>Mask Opacity</span>
                                <span>{Math.round(maskConfig.opacity * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={maskConfig.opacity}
                                onChange={(e) => setMaskConfig({ opacity: parseFloat(e.target.value) })}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100 space-y-2">
                        <button
                            onClick={() => {
                                if (!maskRef.current) return
                                maskRef.current.fill(1)
                                isDirtyRef.current = true
                                commitMask()
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded"
                        >
                            Select All
                        </button>
                        <button
                            onClick={() => {
                                if (!maskRef.current) return
                                maskRef.current.fill(0)
                                isDirtyRef.current = true
                                commitMask()
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded"
                        >
                            Clear All
                        </button>
                        <button
                            onClick={handleInvert}
                            className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded"
                        >
                            Invert Mask
                        </button>
                    </div>

                    <button
                        onClick={handleAutoSubject}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                    >
                        <span>✨</span>
                        <span>Auto Subject</span>
                    </button>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 bg-gray-200 flex items-center justify-center p-8 overflow-hidden">
                    <div className="relative bg-white shadow-2xl rounded-lg overflow-hidden flex items-center justify-center max-w-full max-h-full aspect-square">
                        <canvas
                            ref={canvasRef}
                            onPointerDown={(e) => {
                                setIsDrawing(true)
                                handlePointerUpdate(e)
                                e.currentTarget.setPointerCapture(e.pointerId)
                            }}
                            onPointerMove={handlePointerUpdate}
                            onPointerUp={(e) => {
                                setIsDrawing(false)
                                commitMask()
                                e.currentTarget.releasePointerCapture(e.pointerId)
                            }}
                            onPointerCancel={(e) => {
                                setIsDrawing(false)
                                commitMask()
                                e.currentTarget.releasePointerCapture(e.pointerId)
                            }}
                            onPointerLeave={() => {
                                // Only commit if we were actually drawing
                                if (isDrawing) {
                                    setIsDrawing(false)
                                    commitMask()
                                }
                            }}
                            className="max-w-full max-h-full cursor-crosshair touch-none"
                            style={{
                                imageRendering: 'pixelated',
                                width: 'auto',
                                height: '500px' // Practical default
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Footer Navigation */}
            <div className="bg-white border-t border-gray-200 px-8 py-4 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                    {tool === 'brush' ? 'Paint the areas you want to stitch' : 'Erase areas that should be fabric'}
                </div>
                <div className="flex space-x-4">
                    <button
                        onClick={() => setWorkflowStage('Reference')}
                        className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        Back
                    </button>
                    <button
                        onClick={() => setWorkflowStage('Build')}
                        className="px-8 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-0.5"
                    >
                        Continue to Build
                    </button>
                </div>
            </div>
        </div>
    )
}
