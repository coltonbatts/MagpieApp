import React, { useEffect, useState, useCallback, useRef } from 'react'
import { UploadZone } from '@/components/UploadZone'
import { Button, Slider } from '@/components/ui'
import { StudioPreview } from './StudioPreview'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { fitImageInHoop } from '@/lib/hoop-layout'
import type { ReferencePlacement } from '@/types'

export function ReferenceStage() {
  const { originalImage, fabricSetup, referencePlacement, compositionLocked, setReferencePlacement, setCompositionLocked } = usePatternStore()
  const { setWorkflowStage } = useUIStore()
  const canEditComposition = !compositionLocked

  // Track if we've auto-fitted since the image changed
  const [lastImageRef, setLastImageRef] = useState<ImageBitmap | null>(null)

  // Local state for instant preview updates during slider drag
  const [localPlacement, setLocalPlacement] = useState<ReferencePlacement | null>(referencePlacement)
  const isDraggingSliderRef = useRef(false)
  const isDraggingImageRef = useRef(false)

  // Sync local placement when store updates (but not during drag)
  useEffect(() => {
    if (!isDraggingSliderRef.current && !isDraggingImageRef.current) {
      setLocalPlacement(referencePlacement)
    }
  }, [referencePlacement])

  // Drag state for image positioning
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number, y: number, placement: ReferencePlacement } | null>(null)

  useEffect(() => {
    // Stage 2 is the only stage where composition transforms are editable.
    setCompositionLocked(false)
  }, [setCompositionLocked])

  useEffect(() => {
    if (originalImage && originalImage !== lastImageRef) {
      const nextPlacement = fitImageInHoop(originalImage.width, originalImage.height)
      setReferencePlacement(nextPlacement)
      setLocalPlacement(nextPlacement)
      setLastImageRef(originalImage)
    }
  }, [originalImage, lastImageRef, setReferencePlacement])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!canEditComposition) return
    if (!localPlacement) return
    const container = e.currentTarget
    setIsDragging(true)
    isDraggingImageRef.current = true
    container.setPointerCapture(e.pointerId)
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      placement: { ...localPlacement }
    })
  }, [canEditComposition, localPlacement])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!canEditComposition) return
    if (!isDragging || !dragStart || !localPlacement) return

    const container = e.currentTarget
    const rect = container.getBoundingClientRect()

    const dx = (e.clientX - dragStart.x) / rect.width
    const dy = (e.clientY - dragStart.y) / rect.height

    const newPlacement: ReferencePlacement = {
      ...dragStart.placement,
      x: dragStart.placement.x + dx,
      y: dragStart.placement.y + dy
    }
    
    // Instant local update
    setLocalPlacement(newPlacement)
    // Also update store for persistence
    setReferencePlacement(newPlacement)
  }, [canEditComposition, isDragging, dragStart, localPlacement, setReferencePlacement])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false)
    isDraggingImageRef.current = false
    setDragStart(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  // Instant preview update (local state only)
  const updateLocalPlacement = useCallback((updates: Partial<ReferencePlacement>) => {
    if (!localPlacement) return
    isDraggingSliderRef.current = true
    setLocalPlacement({
      ...localPlacement,
      ...updates
    })
  }, [localPlacement])

  // Commit to store (called on mouse up)
  const commitPlacement = useCallback((placement: ReferencePlacement) => {
    isDraggingSliderRef.current = false
    setReferencePlacement(placement)
  }, [setReferencePlacement])

  const handleScaleChange = useCallback((newWidth: number) => {
    if (!canEditComposition) return
    if (!localPlacement || !originalImage) return

    // Scale from the center
    const centerX = localPlacement.x + localPlacement.width / 2
    const centerY = localPlacement.y + localPlacement.height / 2
    const aspectRatio = localPlacement.height / localPlacement.width
    const newHeight = newWidth * aspectRatio

    const newPlacement: ReferencePlacement = {
      x: centerX - newWidth / 2,
      y: centerY - newHeight / 2,
      width: newWidth,
      height: newHeight
    }

    // Instant local update
    updateLocalPlacement(newPlacement)
  }, [canEditComposition, localPlacement, originalImage, updateLocalPlacement])

  const handleScaleCommit = useCallback((newWidth: number) => {
    if (!canEditComposition) return
    if (!localPlacement || !originalImage) return

    const centerX = localPlacement.x + localPlacement.width / 2
    const centerY = localPlacement.y + localPlacement.height / 2
    const aspectRatio = localPlacement.height / localPlacement.width
    const newHeight = newWidth * aspectRatio

    const newPlacement: ReferencePlacement = {
      x: centerX - newWidth / 2,
      y: centerY - newHeight / 2,
      width: newWidth,
      height: newHeight
    }

    commitPlacement(newPlacement)
  }, [canEditComposition, localPlacement, originalImage, commitPlacement])

  const handleReset = useCallback(() => {
    if (!canEditComposition) return
    if (originalImage) {
      const resetPlacement = fitImageInHoop(originalImage.width, originalImage.height)
      setLocalPlacement(resetPlacement)
      setReferencePlacement(resetPlacement)
    }
  }, [canEditComposition, originalImage, setReferencePlacement])
  
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

          {originalImage && localPlacement && (
            <section className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Placement Adjustments</h3>

              <div className="space-y-6">
                <Slider
                  label="Scale"
                  min={0.1}
                  max={3}
                  step={0.01}
                  value={localPlacement.width}
                  onChange={handleScaleChange}
                  onChangeCommit={handleScaleCommit}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  disabled={!canEditComposition}
                />

                <div className="space-y-4 pt-4 border-t border-border/50">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-fg-subtle">Direct Interaction</span>
                    <Button variant="secondary" size="sm" className="h-5 text-[9px] px-1.5 uppercase font-bold" onClick={handleReset} disabled={!canEditComposition}>Reset to Fit</Button>
                  </div>
                  <p className="text-[10px] text-fg-muted leading-relaxed">
                    Click and drag the image in the studio preview to move it. Precision scale controls above.
                  </p>
                  {compositionLocked && (
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      Composition locked
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          <div className="flex-1 flex flex-col justify-end pb-4">
            <Button
              className="w-full h-12 text-base font-bold tracking-tight shadow-lg"
              variant="primary"
              disabled={!originalImage}
              onClick={() => setWorkflowStage('Select', { source: 'cta' })}
            >
              Confirm Placement
            </Button>
          </div>
        </div>
      </div>

      {/* Main View: Visual Preview */}
      <div
        className={`flex-1 bg-surface-2 relative flex items-center justify-center p-12 overflow-hidden shadow-inner ${canEditComposition ? `cursor-move ${isDragging ? 'cursor-grabbing' : 'cursor-move'}` : 'cursor-default'}`}
        onPointerDown={canEditComposition ? handlePointerDown : undefined}
        onPointerMove={canEditComposition ? handlePointerMove : undefined}
        onPointerUp={canEditComposition ? handlePointerUp : undefined}
      >
        <StudioPreview fabricSetup={fabricSetup}>
          {originalImage && localPlacement && (
            <ImageLayer
              image={originalImage}
              placement={localPlacement}
            />
          )}
        </StudioPreview>
      </div>
    </div>
  )
}

function ImageLayer({ image, placement }: { image: ImageBitmap, placement: ReferencePlacement }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const draw = () => {
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()

      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)

      const ctx = canvas.getContext('2d')
      if (!ctx) return

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

    // Use requestAnimationFrame for smooth updates
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [image, placement])

  // Also handle resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = requestAnimationFrame(() => {
        const dpr = window.devicePixelRatio || 1
        const rect = canvas.getBoundingClientRect()
        canvas.width = Math.floor(rect.width * dpr)
        canvas.height = Math.floor(rect.height * dpr)
        
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, rect.width, rect.height)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        
        const w = placement.width * rect.width
        const h = placement.height * rect.height
        const x = placement.x * rect.width
        const y = placement.y * rect.height
        
        ctx.drawImage(image, x, y, w, h)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
        ctx.fillRect(x, y, w, h)
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [image, placement])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
}
