import { useEffect, useRef, useState, useCallback } from 'react'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'

export function SelectStage() {
    const { normalizedImage, stitchMask, setStitchMask, maskConfig, setMaskConfig } = usePatternStore()
    const { setWorkflowStage } = useUIStore()
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [tool, setTool] = useState<'brush' | 'eraser'>('brush')

    // Initialize mask if it doesn't exist
    useEffect(() => {
        if (normalizedImage && !stitchMask) {
            const mask = new Uint8Array(normalizedImage.width * normalizedImage.height).fill(1)
            setStitchMask(mask)
        }
    }, [normalizedImage, stitchMask, setStitchMask])

    const drawMask = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas || !normalizedImage || !stitchMask) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const { width, height } = normalizedImage
        canvas.width = width
        canvas.height = height

        // Draw original image
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = width
        tempCanvas.height = height
        const tempCtx = tempCanvas.getContext('2d')
        if (tempCtx) {
            tempCtx.putImageData(normalizedImage, 0, 0)
            ctx.drawImage(tempCanvas, 0, 0)
        }

        // Draw mask overlay
        const maskData = ctx.createImageData(width, height)
        for (let i = 0; i < stitchMask.length; i++) {
            const isMasked = stitchMask[i] === 1
            const idx = i * 4
            // Highlight stitched area with a blue tint
            if (isMasked) {
                maskData.data[idx] = 0
                maskData.data[idx + 1] = 120
                maskData.data[idx + 2] = 255
                maskData.data[idx + 3] = Math.round(maskConfig.opacity * 255)
            } else {
                // Unmasked area (fabric)
                maskData.data[idx] = 255
                maskData.data[idx + 1] = 255
                maskData.data[idx + 2] = 255
                maskData.data[idx + 3] = 0 // Transparent
            }
        }

        // Draw semi-transparent gray over NO-STITCH area to dim it
        const overlayCanvas = document.createElement('canvas')
        overlayCanvas.width = width
        overlayCanvas.height = height
        const oCtx = overlayCanvas.getContext('2d')
        if (oCtx) {
            oCtx.putImageData(maskData, 0, 0)
            ctx.drawImage(overlayCanvas, 0, 0)

            // Darken non-mask areas
            ctx.fillStyle = `rgba(0,0,0,${0.3 * (1 - maskConfig.opacity)})`
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (stitchMask[y * width + x] === 0) {
                        ctx.fillRect(x, y, 1, 1)
                    }
                }
            }
        }

    }, [normalizedImage, stitchMask, maskConfig.opacity])

    useEffect(() => {
        drawMask()
    }, [drawMask])

    const handlePointerUpdate = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !normalizedImage || !stitchMask) return

        const canvas = canvasRef.current
        if (!canvas) return

        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height

        const x = Math.floor((e.clientX - rect.left) * scaleX)
        const y = Math.floor((e.clientY - rect.top) * scaleY)

        const radius = Math.max(1, Math.floor(maskConfig.brushSize / (rect.width / canvas.width) / 2))
        const newMask = new Uint8Array(stitchMask)
        const val = tool === 'brush' ? 1 : 0

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const distSq = dx * dx + dy * dy
                if (distSq <= radius * radius) {
                    const nx = x + dx
                    const ny = y + dy
                    if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height) {
                        newMask[ny * canvas.width + nx] = val
                    }
                }
            }
        }
        setStitchMask(newMask)
    }

    const handleAutoSubject = () => {
        // Basic auto-subject: detect non-white/non-bg pixels
        // For now, let's just do a simple center crop-like mask to show it works
        if (!normalizedImage || !stitchMask) return
        const { width, height } = normalizedImage
        const newMask = new Uint8Array(width * height).fill(0)
        for (let y = Math.floor(height * 0.2); y < height * 0.8; y++) {
            for (let x = Math.floor(width * 0.2); x < width * 0.8; x++) {
                newMask[y * width + x] = 1
            }
        }
        setStitchMask(newMask)
    }

    const handleInvert = () => {
        if (!stitchMask) return
        const newMask = new Uint8Array(stitchMask.length)
        for (let i = 0; i < stitchMask.length; i++) {
            newMask[i] = stitchMask[i] === 1 ? 0 : 1
        }
        setStitchMask(newMask)
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
                            onClick={() => setStitchMask(new Uint8Array(stitchMask?.length || 0).fill(1))}
                            className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded"
                        >
                            Select All
                        </button>
                        <button
                            onClick={() => setStitchMask(new Uint8Array(stitchMask?.length || 0).fill(0))}
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
                                e.currentTarget.releasePointerCapture(e.pointerId)
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
