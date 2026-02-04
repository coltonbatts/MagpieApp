import React, { useEffect, useState } from 'react'
import { UploadZone } from '@/components/UploadZone'
import { Button, Input } from '@/components/ui'
import { StudioPreview } from './StudioPreview'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { fitImageInHoop } from '@/lib/hoop-layout'

export function ReferenceStage() {
  const { originalImage, fabricSetup, referencePlacement, setReferencePlacement } = usePatternStore()
  const { setWorkflowStage } = useUIStore()

  // Track if we've auto-fitted since the image changed
  const [lastImageRef, setLastImageRef] = useState<ImageBitmap | null>(null)

  // Drag state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number, y: number, placement: any } | null>(null)

  useEffect(() => {
    if (originalImage && originalImage !== lastImageRef) {
      const nextPlacement = fitImageInHoop(originalImage.width, originalImage.height)
      setReferencePlacement(nextPlacement)
      setLastImageRef(originalImage)
    }
  }, [originalImage, lastImageRef, setReferencePlacement])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!referencePlacement) return
    const container = e.currentTarget
    setIsDragging(true)
    container.setPointerCapture(e.pointerId)
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      placement: { ...referencePlacement }
    })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !dragStart || !referencePlacement) return

    const container = e.currentTarget
    const rect = container.getBoundingClientRect()

    const dx = (e.clientX - dragStart.x) / rect.width
    const dy = (e.clientY - dragStart.y) / rect.height

    setReferencePlacement({
      ...dragStart.placement,
      x: dragStart.placement.x + dx,
      y: dragStart.placement.y + dy
    })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false)
    setDragStart(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handleScaleChange = (scaleMultiplier: number) => {
    if (!referencePlacement || !originalImage) return

    // Scale from the center
    const centerX = referencePlacement.x + referencePlacement.width / 2
    const centerY = referencePlacement.y + referencePlacement.height / 2

    const nextWidth = referencePlacement.width * scaleMultiplier
    const nextHeight = referencePlacement.height * scaleMultiplier

    setReferencePlacement({
      x: centerX - nextWidth / 2,
      y: centerY - nextHeight / 2,
      width: nextWidth,
      height: nextHeight
    })
  }


  const handleReset = () => {
    if (originalImage) {
      setReferencePlacement(fitImageInHoop(originalImage.width, originalImage.height))
    }
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg">
      {/* Sidebar: placement controls */}
      <div className="w-[340px] flex-shrink-0 border-r border-border bg-surface flex flex-col overflow-y-auto">
        <div className="p-6 space-y-8">
          <header>
            <h2 className="text-xl font-bold tracking-tight text-fg">Place Reference</h2>
            <p className="text-sm text-fg-muted">Position your design within the hoop.</p>
          </header>

          <section className="space-y-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Image Source</h3>
            <UploadZone />
          </section>

          {originalImage && referencePlacement && (
            <section className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Placement Adjustments</h3>

              <div className="space-y-6">
                <div className="space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-xs font-medium text-fg-muted">Scale</span>
                    <span className="text-[10px] font-mono text-fg-subtle">{(referencePlacement.width * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button size="sm" variant="secondary" onClick={() => handleScaleChange(0.95)} className="px-2 h-7">-</Button>
                    <Input
                      variant="slider"
                      min={0.1} max={3} step={0.01}
                      value={referencePlacement.width}
                      onChange={(e) => {
                        const newW = parseFloat(e.target.value)
                        const ratio = newW / referencePlacement.width
                        handleScaleChange(ratio)
                      }}
                    />
                    <Button size="sm" variant="secondary" onClick={() => handleScaleChange(1.05)} className="px-2 h-7">+</Button>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-border/50">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-fg-subtle">Direct Interaction</span>
                    <Button variant="secondary" size="sm" className="h-5 text-[9px] px-1.5 uppercase font-bold" onClick={handleReset}>Reset to Fit</Button>
                  </div>
                  <p className="text-[10px] text-fg-muted leading-relaxed">
                    Click and drag the image in the studio preview to move it. Precision scale controls above.
                  </p>
                </div>
              </div>
            </section>
          )}

          <div className="flex-1 flex flex-col justify-end pb-4">
            <Button
              className="w-full h-12 text-base font-bold tracking-tight shadow-lg"
              variant="primary"
              disabled={!originalImage}
              onClick={() => setWorkflowStage('Select')}
            >
              Confirm Placement
            </Button>
          </div>
        </div>
      </div>

      {/* Main View: Visual Preview */}
      <div
        className={`flex-1 bg-surface-2 relative flex items-center justify-center p-12 overflow-hidden shadow-inner cursor-move ${isDragging ? 'cursor-grabbing' : 'cursor-move'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <StudioPreview fabricSetup={fabricSetup}>
          {originalImage && referencePlacement && (
            <ImageLayer
              image={originalImage}
              placement={referencePlacement}
            />
          )}
        </StudioPreview>
      </div>
    </div>
  )
}

function ImageLayer({ image, placement }: { image: ImageBitmap, placement: any }) {
  const canvasRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()

    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      const w = placement.width * rect.width
      const h = placement.height * rect.height
      const x = placement.x * rect.width
      const y = placement.y * rect.height

      ctx.drawImage(image, x, y, w, h)

      // Subtle overlay to blend into fabric context
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
      ctx.fillRect(x, y, w, h)
    }
  }

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
}
