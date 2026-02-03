import { useEffect, useMemo, useRef } from 'react'
import { UploadZone } from '@/components/UploadZone'
import { Button, Panel } from '@/components/ui'
import { fitImageInHoop, getHoopAspectRatio } from '@/lib/hoop-layout'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'

export function ReferenceStage() {
  const { originalImage, fabricSetup, referencePlacement, setReferencePlacement } = usePatternStore()
  const { setWorkflowStage } = useUIStore()
  const previewRef = useRef<HTMLCanvasElement>(null)

  const previewShape = useMemo(() => fabricSetup.hoop.shape, [fabricSetup.hoop.shape])

  useEffect(() => {
    if (!originalImage) {
      setReferencePlacement(null)
      return
    }
    const nextPlacement = fitImageInHoop(originalImage.width, originalImage.height)
    const shouldUpdate =
      !referencePlacement ||
      Math.abs(referencePlacement.x - nextPlacement.x) > 0.0001 ||
      Math.abs(referencePlacement.y - nextPlacement.y) > 0.0001 ||
      Math.abs(referencePlacement.width - nextPlacement.width) > 0.0001 ||
      Math.abs(referencePlacement.height - nextPlacement.height) > 0.0001
    if (shouldUpdate) {
      setReferencePlacement(nextPlacement)
    }
  }, [originalImage, referencePlacement, setReferencePlacement])

  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const dpr = window.devicePixelRatio || 1
    const cssWidth = 640
    const cssHeight = 420
    canvas.width = Math.floor(cssWidth * dpr)
    canvas.height = Math.floor(cssHeight * dpr)
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    context.fillStyle = 'rgb(248,247,244)'
    context.fillRect(0, 0, cssWidth, cssHeight)

    const hoopPadding = 52
    const availableWidth = cssWidth - hoopPadding * 2
    const availableHeight = cssHeight - hoopPadding * 2
    const hoopAspect = getHoopAspectRatio(fabricSetup.hoop)
    let hoopWidth = availableWidth
    let hoopHeight = hoopWidth / hoopAspect
    if (hoopHeight > availableHeight) {
      hoopHeight = availableHeight
      hoopWidth = hoopHeight * hoopAspect
    }
    const hoopX = (cssWidth - hoopWidth) / 2
    const hoopY = (cssHeight - hoopHeight) / 2

    const fabricColor = `rgb(${fabricSetup.color.r}, ${fabricSetup.color.g}, ${fabricSetup.color.b})`
    context.fillStyle = fabricColor
    context.fillRect(hoopX, hoopY, hoopWidth, hoopHeight)

    context.save()
    context.globalAlpha = fabricSetup.texture === 'coarse' ? 0.13 : fabricSetup.texture === 'soft' ? 0.07 : 0.1
    context.strokeStyle = '#8d8d8d'
    const spacing = fabricSetup.count <= 11 ? 13 : fabricSetup.count <= 14 ? 10 : 8
    for (let x = hoopX; x <= hoopX + hoopWidth; x += spacing) {
      context.beginPath()
      context.moveTo(x, hoopY)
      context.lineTo(x, hoopY + hoopHeight)
      context.stroke()
    }
    for (let y = hoopY; y <= hoopY + hoopHeight; y += spacing) {
      context.beginPath()
      context.moveTo(hoopX, y)
      context.lineTo(hoopX + hoopWidth, y)
      context.stroke()
    }
    context.restore()

    if (originalImage && referencePlacement) {
      context.save()
      if (previewShape === 'round') {
        const radius = Math.min(hoopWidth, hoopHeight) / 2
        context.beginPath()
        context.arc(hoopX + hoopWidth / 2, hoopY + hoopHeight / 2, radius, 0, Math.PI * 2)
        context.clip()
      } else if (previewShape === 'oval') {
        context.beginPath()
        context.ellipse(
          hoopX + hoopWidth / 2,
          hoopY + hoopHeight / 2,
          hoopWidth / 2,
          hoopHeight / 2,
          0,
          0,
          Math.PI * 2
        )
        context.clip()
      } else {
        context.beginPath()
        context.rect(hoopX, hoopY, hoopWidth, hoopHeight)
        context.clip()
      }

      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(
        originalImage,
        hoopX + referencePlacement.x * hoopWidth,
        hoopY + referencePlacement.y * hoopHeight,
        referencePlacement.width * hoopWidth,
        referencePlacement.height * hoopHeight
      )

      context.fillStyle = 'rgba(255, 255, 255, 0.07)'
      context.fillRect(hoopX, hoopY, hoopWidth, hoopHeight)
      context.restore()
    }

    context.strokeStyle = '#9f8868'
    context.lineWidth = 12
    if (previewShape === 'round') {
      const radius = Math.min(hoopWidth, hoopHeight) / 2
      context.beginPath()
      context.arc(hoopX + hoopWidth / 2, hoopY + hoopHeight / 2, radius, 0, Math.PI * 2)
      context.stroke()
    } else if (previewShape === 'oval') {
      context.beginPath()
      context.ellipse(
        hoopX + hoopWidth / 2,
        hoopY + hoopHeight / 2,
        hoopWidth / 2,
        hoopHeight / 2,
        0,
        0,
        Math.PI * 2
      )
      context.stroke()
    } else {
      context.strokeRect(hoopX, hoopY, hoopWidth, hoopHeight)
    }
  }, [originalImage, fabricSetup, previewShape, referencePlacement])

  return (
    <div className="min-h-[calc(100vh-64px)] bg-bg px-4 py-8 md:px-5 md:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto w-full max-w-3xl">
          <Panel className="space-y-8" elevated>
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-fg">Step 2: Place Reference</h2>
              <p className="text-sm text-fg-muted">
                Upload the source photo and place it in your selected hoop context.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface-2 p-6 md:p-7">
              <UploadZone />
            </div>

            <div className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-4">
              <canvas ref={previewRef} className="mx-auto block max-w-full" />
            </div>

            <Button
              onClick={() => setWorkflowStage('Select')}
              variant="primary"
              className="h-11 w-full text-base font-semibold"
              disabled={!originalImage}
            >
              Continue to Selection
            </Button>
          </Panel>
        </div>
      </div>
    </div>
  )
}
