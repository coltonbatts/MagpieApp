import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as PIXINamespace from 'pixi.js'
import { useUIStore } from '@/store/ui-store'
import { fitCameraToWorld, zoomAtCursor } from '@/lib/camera'
import type { CameraState, ColoringBookData, HoopConfig } from '@/types'

interface ColoringBookViewerProps {
  data: ColoringBookData | null
  hoop: HoopConfig
  lineWeight: number
  saturation: number
  outlineIntensity: number
}

interface ParsedPath {
  points: Array<{ x: number; y: number }>
}

export function ColoringBookViewer({
  data,
  hoop,
  lineWeight,
  saturation,
  outlineIntensity,
}: ColoringBookViewerProps) {
  const viewerCamera = useUIStore((state) => state.viewerCamera)
  const setViewerCamera = useUIStore((state) => state.setViewerCamera)

  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXINamespace.Application | null>(null)
  const worldContainerRef = useRef<PIXINamespace.Container | null>(null)
  const pixiRef = useRef<typeof PIXINamespace | null>(null)
  const cameraRef = useRef<CameraState>(viewerCamera)
  const worldSizeRef = useRef({ width: 1, height: 1 })
  const isPanningRef = useRef(false)
  const panRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const panPointerIdRef = useRef<number | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)

  const parsedRegions = useMemo(() => {
    if (!data) return []
    return data.regions.map((region) => ({
      ...region,
      outer: parseSimpleSvgPath(region.pathSvg),
      holes: region.holesSvg.map(parseSimpleSvgPath),
    }))
  }, [data])

  const applyCamera = useCallback((next: CameraState) => {
    cameraRef.current = next
    const world = worldContainerRef.current
    if (!world) return
    world.scale.set(next.zoom)
    world.position.set(next.panX, next.panY)
  }, [])

  const fitCamera = useCallback((manual: boolean) => {
    const host = containerRef.current
    if (!host) return

    const next = fitCameraToWorld(
      {
        ...cameraRef.current,
        isFitted: manual || cameraRef.current.isFitted,
      },
      { width: host.clientWidth || window.innerWidth, height: host.clientHeight || window.innerHeight },
      { width: worldSizeRef.current.width, height: worldSizeRef.current.height },
      24
    )

    applyCamera(next)
    setViewerCamera(next)
  }, [applyCamera, setViewerCamera])

  useEffect(() => {
    cameraRef.current = viewerCamera
    applyCamera(viewerCamera)
  }, [applyCamera, viewerCamera])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let resizeObserver: ResizeObserver | null = null

    import('pixi.js')
      .then(async (PIXI) => {
        if (cancelled) return

        const app = new PIXI.Application()
        await app.init({
          width: container.clientWidth || window.innerWidth,
          height: container.clientHeight || window.innerHeight,
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
          backgroundAlpha: 0,
        })

        if (cancelled || !containerRef.current) return

        const worldContainer = new PIXI.Container()
        app.stage.addChild(worldContainer)

        pixiRef.current = PIXI
        worldContainerRef.current = worldContainer
        appRef.current = app

        containerRef.current.appendChild(app.canvas)
        applyCamera(cameraRef.current)
        setIsReady(true)

        resizeObserver = new ResizeObserver(() => {
          const host = containerRef.current
          if (!host || !appRef.current) return

          appRef.current.renderer.resize(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight)
          if (cameraRef.current.isFitted) {
            fitCamera(false)
          }
        })

        resizeObserver.observe(containerRef.current)
      })
      .catch((error) => {
        setViewerError(error instanceof Error ? error.message : 'Failed to initialize Pixi viewer')
      })

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      appRef.current?.destroy(true, { children: true, texture: true })
      appRef.current = null
      worldContainerRef.current = null
      pixiRef.current = null
      setIsReady(false)
    }
  }, [applyCamera, fitCamera])

  useEffect(() => {
    if (!isReady || !data || !pixiRef.current || !worldContainerRef.current) return

    const PIXI = pixiRef.current
    const world = worldContainerRef.current
    world.removeChildren()

    const worldSizeChanged =
      worldSizeRef.current.width !== data.width || worldSizeRef.current.height !== data.height
    worldSizeRef.current = { width: data.width, height: data.height }

    const content = new PIXI.Container()
    world.addChild(content)

    const paper = new PIXI.Graphics()
    paper.roundRect(0, 0, data.width, data.height, 8)
    paper.fill(0xffffff)
    content.addChild(paper)

    for (const region of parsedRegions) {
      const color = parseHexColor(applySaturation(region.color.hex, saturation))

      const fill = new PIXI.Graphics()
      if (region.outer.points.length >= 3) {
        fill.poly(region.outer.points)
        fill.fill(color)
      }

      for (const hole of region.holes) {
        if (hole.points.length >= 3) {
          fill.poly(hole.points)
          fill.fill(0xffffff)
        }
      }
      content.addChild(fill)

      const outline = new PIXI.Graphics()
      if (region.outer.points.length >= 3) {
        outline.poly(region.outer.points)
      }
      for (const hole of region.holes) {
        if (hole.points.length >= 3) {
          outline.poly(hole.points)
        }
      }
      outline.setStrokeStyle({
        width: lineWeight / Math.max(cameraRef.current.zoom, 0.0001),
        color: outlineColorFromIntensity(outlineIntensity),
        alpha: 0.95,
      })
      outline.stroke()
      content.addChild(outline)
    }

    const maskShape = new PIXI.Graphics()
    drawHoopMask(maskShape, data.width, data.height, hoop)
    world.addChild(maskShape)
    content.mask = maskShape

    const hoopGuide = new PIXI.Graphics()
    drawHoopGuide(hoopGuide, data.width, data.height, hoop)
    world.addChild(hoopGuide)

    if (worldSizeChanged && cameraRef.current.isFitted) {
      fitCamera(false)
    } else {
      applyCamera(cameraRef.current)
    }
  }, [applyCamera, data, fitCamera, hoop, isReady, lineWeight, outlineIntensity, parsedRegions, saturation, viewerCamera.zoom])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    isPanningRef.current = true
    panPointerIdRef.current = event.pointerId
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: cameraRef.current.panX,
      panY: cameraRef.current.panY,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current || panPointerIdRef.current !== event.pointerId || !panRef.current) return

    const next: CameraState = {
      ...cameraRef.current,
      panX: panRef.current.panX + (event.clientX - panRef.current.x),
      panY: panRef.current.panY + (event.clientY - panRef.current.y),
      isFitted: false,
    }

    applyCamera(next)
    setViewerCamera(next)
  }, [applyCamera, setViewerCamera])

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current || panPointerIdRef.current !== event.pointerId) return
    isPanningRef.current = false
    panRef.current = null
    panPointerIdRef.current = null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    setViewerCamera(cameraRef.current)
  }, [setViewerCamera])

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const cursor = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    }

    const factor = Math.exp(-event.deltaY * 0.002)
    const next = zoomAtCursor({
      camera: cameraRef.current,
      cursor,
      screen: { width: bounds.width, height: bounds.height },
      factor,
    })

    applyCamera(next)
    setViewerCamera(next)
  }, [applyCamera, setViewerCamera])

  if (viewerError) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-red-600">
        {viewerError}
      </div>
    )
  }

  return (
    <div className="relative h-full w-full" onWheel={handleWheel}>
      <div
        ref={containerRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  )
}

function parseSimpleSvgPath(path: string): ParsedPath {
  const tokens = path.match(/[MLCZ]|-?\d+(?:\.\d+)?/g) ?? []
  const points: Array<{ x: number; y: number }> = []

  let startPoint: { x: number; y: number } | null = null
  let currentPoint: { x: number; y: number } | null = null

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    if (token === 'M' || token === 'L') {
      const x = Number.parseFloat(tokens[i + 1] ?? '')
      const y = Number.parseFloat(tokens[i + 2] ?? '')
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const point = { x, y }
        points.push(point)
        currentPoint = point
        if (token === 'M') {
          startPoint = point
        }
      }
      i += 3
      continue
    }

    if (token === 'C') {
      const c1x = Number.parseFloat(tokens[i + 1] ?? '')
      const c1y = Number.parseFloat(tokens[i + 2] ?? '')
      const c2x = Number.parseFloat(tokens[i + 3] ?? '')
      const c2y = Number.parseFloat(tokens[i + 4] ?? '')
      const x = Number.parseFloat(tokens[i + 5] ?? '')
      const y = Number.parseFloat(tokens[i + 6] ?? '')

      if (
        currentPoint &&
        Number.isFinite(c1x) &&
        Number.isFinite(c1y) &&
        Number.isFinite(c2x) &&
        Number.isFinite(c2y) &&
        Number.isFinite(x) &&
        Number.isFinite(y)
      ) {
        const p0 = currentPoint
        const p1 = { x: c1x, y: c1y }
        const p2 = { x: c2x, y: c2y }
        const p3 = { x, y }
        const samples = 8
        for (let step = 1; step <= samples; step++) {
          const t = step / samples
          points.push(sampleCubicBezier(p0, p1, p2, p3, t))
        }
        currentPoint = p3
      }

      i += 7
      continue
    }

    if (token === 'Z') {
      if (startPoint && points.length > 0) {
        const last = points[points.length - 1]
        if (last.x !== startPoint.x || last.y !== startPoint.y) {
          points.push(startPoint)
        }
      }
      i += 1
      continue
    }

    i += 1
  }

  return { points }
}

function sampleCubicBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const u = 1 - t
  const tt = t * t
  const uu = u * u
  const uuu = uu * u
  const ttt = tt * t

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  }
}

function parseHexColor(hex: string): number {
  const value = hex.trim().replace('#', '')
  if (value.length !== 6) return 0x999999
  return Number.parseInt(value, 16)
}

function applySaturation(hex: string, saturation: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const s = Math.max(0, Math.min(1, saturation / 100))
  const gray = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b
  const r = clamp255(gray + (rgb.r - gray) * s)
  const g = clamp255(gray + (rgb.g - gray) * s)
  const b = clamp255(gray + (rgb.b - gray) * s)
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function outlineColorFromIntensity(intensity: number): number {
  const clamped = Math.max(0, Math.min(100, intensity))
  const gray = clamp255(220 - (clamped / 100) * 220)
  return (gray << 16) | (gray << 8) | gray
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.trim().replace('#', '')
  if (value.length !== 6) return null
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null
  return { r, g, b }
}

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0')
}

function drawHoopGuide(graphics: PIXINamespace.Graphics, width: number, height: number, hoop: HoopConfig): void {
  const inset = Math.max(2, (hoop.marginMm / Math.max(1, hoop.widthMm)) * width)
  const x = inset
  const y = inset
  const w = Math.max(8, width - inset * 2)
  const h = Math.max(8, height - inset * 2)

  graphics.setStrokeStyle({ width: 2, color: 0x0f172a, alpha: 0.5 })

  if (hoop.shape === 'round') {
    const radius = Math.max(4, Math.min(w, h) / 2)
    graphics.circle(width / 2, height / 2, radius)
  } else if (hoop.shape === 'oval') {
    graphics.ellipse(width / 2, height / 2, w / 2, h / 2)
  } else {
    graphics.roundRect(x, y, w, h, 10)
  }

  graphics.stroke()
}

function drawHoopMask(graphics: PIXINamespace.Graphics, width: number, height: number, hoop: HoopConfig): void {
  const w = Math.max(8, width)
  const h = Math.max(8, height)
  if (hoop.shape === 'round') {
    graphics.circle(width / 2, height / 2, Math.max(4, Math.min(w, h) / 2))
  } else if (hoop.shape === 'oval') {
    graphics.ellipse(width / 2, height / 2, w / 2, h / 2)
  } else {
    graphics.roundRect(0, 0, w, h, 0)
  }
  graphics.fill(0xffffff)
}
