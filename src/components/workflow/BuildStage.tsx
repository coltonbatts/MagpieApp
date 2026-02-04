import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { Button, Slider } from '@/components/ui'
import {
  COLORING_BOOK_MAX_COLORS,
  COLORING_BOOK_MIN_COLORS,
  processColoringBookImage,
} from '@/processing/coloring-book'
import { ColoringBookViewer } from '@/viewer/ColoringBookViewer'
import { createHoopProcessingConfig } from '@/lib/hoop-mask'

export function BuildStage() {
  const {
    normalizedImage,
    fabricSetup,
    referencePlacement,
    compositionLocked,
    processingConfig,
    setProcessingConfig,
    coloringBookData,
    coloringBookStatus,
    coloringBookError,
    coloringBookLineWeight,
    coloringBookSaturation,
    coloringBookOutlineIntensity,
    setColoringBookData,
    setColoringBookStatus,
    setColoringBookLineWeight,
    setColoringBookSaturation,
    setColoringBookOutlineIntensity,
    isProcessing,
  } = usePatternStore()

  const { setWorkflowStage, viewerCamera } = useUIStore()

  const [detailValue, setDetailValue] = useState(() =>
    clampDetail(processingConfig.colorCount)
  )
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const requestSeqRef = useRef(0)

  useEffect(() => {
    setDetailValue(clampDetail(processingConfig.colorCount))
  }, [processingConfig.colorCount])

  const runColoringBookProcess = useCallback(async (colorCount: number) => {
    if (!normalizedImage || !compositionLocked || !referencePlacement) return

    const requestSeq = ++requestSeqRef.current
    setColoringBookStatus('processing', null)

    try {
      const hoopConfig = createHoopProcessingConfig(
        normalizedImage.width,
        normalizedImage.height,
        referencePlacement,
        fabricSetup.hoop
      )
      const result = await processColoringBookImage(normalizedImage, colorCount, hoopConfig)
      if (requestSeq !== requestSeqRef.current) return
      setColoringBookData(result)
      setColoringBookStatus('ready', null)
    } catch (error) {
      if (requestSeq !== requestSeqRef.current) return
      const message = error instanceof Error ? error.message : 'Coloring book processing failed.'
      setColoringBookStatus('error', message)
    }
  }, [compositionLocked, fabricSetup.hoop, normalizedImage, referencePlacement, setColoringBookData, setColoringBookStatus])

  useEffect(() => {
    if (!normalizedImage || !compositionLocked) return
    const task = window.setTimeout(() => {
      void runColoringBookProcess(detailValue)
    }, 32)
    return () => window.clearTimeout(task)
  }, [compositionLocked, detailValue, normalizedImage, runColoringBookProcess])

  const zoomPercent = Math.max(10, Math.round(viewerCamera.zoom * 100))
  const colorCount = coloringBookData?.palette.length ?? detailValue

  const threadLegend = useMemo(() => {
    if (!coloringBookData) return []

    const byKey = new Map<string, { hex: string; dmc: string; area: number }>()
    for (const region of coloringBookData.regions) {
      const hex = region.color.hex.toUpperCase()
      const dmc = (region.color.dmcCode ?? hex).toUpperCase()
      const key = `${dmc}|${hex}`
      const existing = byKey.get(key)
      if (existing) {
        existing.area += region.areaPx
      } else {
        byKey.set(key, { hex, dmc, area: region.areaPx })
      }
    }

    return Array.from(byKey.values()).sort((a, b) => b.area - a.area)
  }, [coloringBookData])

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg relative">
      <aside
        className={`flex-shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0 border-none opacity-0' : 'w-[360px]'}`}
      >
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8">
            <header>
              <h2 className="text-xl font-bold tracking-tight text-fg">Coloring Book Preview</h2>
              <p className="text-sm text-fg-muted">Fill color regions, not stitch cells.</p>
              {compositionLocked && (
                <div className="mt-3 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Composition Locked
                  </span>
                </div>
              )}
            </header>

            <section className="space-y-5">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Detail Control</h3>
              <Slider
                label="Detail"
                min={COLORING_BOOK_MIN_COLORS}
                max={COLORING_BOOK_MAX_COLORS}
                step={1}
                value={detailValue}
                onChange={(value) => setDetailValue(clampDetail(value))}
                onChangeCommit={(value) => {
                  setProcessingConfig({ colorCount: clampDetail(value) })
                }}
                formatValue={(value) => `${Math.round(value)} colors`}
              />
              <p className="text-xs text-fg-subtle">
                Left = simple regions (4-6). Right = detailed regions (20-30+).
              </p>

              <Slider
                label="Outline Weight"
                min={0.5}
                max={4}
                step={0.1}
                value={coloringBookLineWeight}
                onChange={(value) => setColoringBookLineWeight(value)}
                formatValue={(value) => `${value.toFixed(1)}px`}
              />

              <Slider
                label="Saturation"
                min={0}
                max={100}
                step={1}
                value={coloringBookSaturation}
                onChange={(value) => setColoringBookSaturation(value)}
                formatValue={(value) => `${Math.round(value)}%`}
              />

              <Slider
                label="Outline Intensity"
                min={0}
                max={100}
                step={1}
                value={coloringBookOutlineIntensity}
                onChange={(value) => setColoringBookOutlineIntensity(value)}
                formatValue={(value) => `${Math.round(value)}%`}
              />
            </section>

            <section className="space-y-3 border-t border-border/50 pt-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Live Stats</h3>
              <div className="rounded-xl border border-border/70 bg-surface-2 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-fg-muted">Zoom</span>
                  <span className="font-semibold text-fg">{zoomPercent}%</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-fg-muted">Thread Count</span>
                  <span className="font-semibold text-fg">Using {colorCount} DMC threads</span>
                </div>
              </div>
              {coloringBookStatus === 'processing' && (
                <p className="text-xs text-fg-subtle">Updating coloring book...</p>
              )}
              {coloringBookStatus === 'error' && coloringBookError && (
                <p className="text-xs text-red-600">{coloringBookError}</p>
              )}
            </section>

            <section className="space-y-3 border-t border-border/50 pt-6 pb-4">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Thread Legend</h3>
              <div className="max-h-80 overflow-y-auto rounded-xl border border-border/70 bg-surface-2">
                {threadLegend.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-fg-subtle">Generate preview to see thread legend.</p>
                ) : (
                  threadLegend.map((entry) => (
                    <div key={`${entry.dmc}|${entry.hex}`} className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs last:border-b-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-4 w-4 rounded border border-border" style={{ backgroundColor: entry.hex }} />
                        <span className="truncate font-mono text-fg">{entry.dmc}</span>
                      </div>
                      <span className="text-fg-muted">{entry.hex}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="p-6 border-t border-border bg-surface shadow-[0_-4px_12px_rgba(0,0,0,0.02)] space-y-3">
          <div className="flex gap-3">
            <Button
              className="flex-1 h-12 text-sm font-bold tracking-tight"
              variant="secondary"
              onClick={() => setWorkflowStage('Select', { source: 'cta' })}
            >
              Back
            </Button>
            <Button
              className="flex-[2] h-12 text-sm font-bold tracking-tight shadow-xl"
              variant="primary"
              onClick={() => setWorkflowStage('Export', { source: 'cta' })}
            >
              Confirm & Export
            </Button>
          </div>
          {isProcessing && (
            <div className="flex items-center justify-center gap-2 py-1 animate-in fade-in slide-in-from-bottom-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-fg-subtle">Processing...</span>
            </div>
          )}
        </div>
      </aside>

      <div className={`flex-1 bg-[#f2f4f7] relative flex items-center justify-center transition-all duration-300 ${isSidebarCollapsed ? 'p-0' : 'p-12'} overflow-hidden`}>
        <div className="relative h-full w-full rounded-2xl border border-border/80 bg-white shadow-xl overflow-hidden">
          <ColoringBookViewer
            data={coloringBookData}
            hoop={fabricSetup.hoop}
            lineWeight={coloringBookLineWeight}
            saturation={coloringBookSaturation}
            outlineIntensity={coloringBookOutlineIntensity}
          />
          {!coloringBookData && coloringBookStatus !== 'error' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-fg-muted">
              {compositionLocked ? 'Building coloring book preview...' : 'Lock composition in Stage 3 to start preview'}
            </div>
          )}
        </div>

        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute top-12 left-6 z-50 p-2.5 bg-white/80 backdrop-blur-md rounded-full border border-border/50 shadow-xl hover:bg-white transition-all hover:scale-110 group pointer-events-auto"
          title={isSidebarCollapsed ? 'Show Sidebar' : 'Focus Mode'}
        >
          <div className={`transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : 'rotate-0'}`}>
            {isSidebarCollapsed ? '👉' : '👈'}
          </div>
        </button>
      </div>
    </div>
  )
}

function clampDetail(value: number): number {
  return Math.max(COLORING_BOOK_MIN_COLORS, Math.min(COLORING_BOOK_MAX_COLORS, Math.round(value)))
}
