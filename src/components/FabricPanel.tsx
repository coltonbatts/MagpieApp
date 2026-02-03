import { hsvToRgb, rgbToHsv } from '@/processing/color-spaces'
import { usePatternStore } from '@/store/pattern-store'
import { useEffect, useState } from 'react'
import { Button, Input, Panel } from './ui'

export function FabricPanel() {
  const { processingConfig, setFabricSetup, setProcessingConfig } = usePatternStore()
  const [hsv, setHsv] = useState<[number, number, number]>([0, 0, 96])
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    const { r, g, b } = processingConfig.fabricColor
    setHsv(rgbToHsv(r, g, b))
  }, [])

  const updateColor = (h: number, s: number, v: number) => {
    setHsv([h, s, v])
    const [r, g, b] = hsvToRgb(h, s, v)
    setFabricSetup({ color: { r, g, b } })
  }

  const fabricHex = `#${processingConfig.fabricColor.r
    .toString(16)
    .padStart(2, '0')}${processingConfig.fabricColor.g
    .toString(16)
    .padStart(2, '0')}${processingConfig.fabricColor.b
    .toString(16)
    .padStart(2, '0')}`.toUpperCase()

  return (
    <Panel
      title={
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          Fabric Selection
        </span>
      }
      variant="inset"
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-fg-subtle">Current fabric</span>
        <div
          className="h-10 w-10 rounded border border-border shadow-sm"
          style={{ backgroundColor: fabricHex }}
        />
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 flex justify-between text-xs font-medium text-fg-muted">
            <span>Hue</span>
            <span>{hsv[0]}°</span>
          </label>
          <Input
            type="range"
            variant="slider"
            min={0}
            max={360}
            value={hsv[0]}
            onChange={(e) => updateColor(parseInt(e.target.value, 10), hsv[1], hsv[2])}
          />
        </div>

        <div>
          <label className="mb-1 flex justify-between text-xs font-medium text-fg-muted">
            <span>Saturation</span>
            <span>{hsv[1]}%</span>
          </label>
          <Input
            type="range"
            variant="slider"
            min={0}
            max={100}
            value={hsv[1]}
            onChange={(e) => updateColor(hsv[0], parseInt(e.target.value, 10), hsv[2])}
          />
        </div>

        <div>
          <label className="mb-1 flex justify-between text-xs font-medium text-fg-muted">
            <span>Brightness</span>
            <span>{hsv[2]}%</span>
          </label>
          <Input
            type="range"
            variant="slider"
            min={0}
            max={100}
            value={hsv[2]}
            onChange={(e) => updateColor(hsv[0], hsv[1], parseInt(e.target.value, 10))}
          />
        </div>

        <div className="pt-1">
          <Button
            onClick={() => setShowAdvanced(!showAdvanced)}
            variant="ghost"
            size="sm"
            className="h-7 px-1 text-[10px] text-fg-muted hover:text-fg"
          >
            {showAdvanced
              ? 'Hide Advanced Fabric Settings'
              : 'Show Advanced Fabric Settings'}
          </Button>

          {showAdvanced && (
            <Panel variant="inset" className="mt-2 space-y-2 border-border/80">
              <label className="mb-1 flex justify-between text-[10px] font-medium text-fg-subtle">
                <span>Stitch Coverage Threshold (Auto-mask)</span>
                <span>{Math.round(processingConfig.stitchThreshold * 100)}%</span>
              </label>
              <Input
                type="range"
                variant="slider"
                min={0}
                max={1}
                step={0.01}
                value={processingConfig.stitchThreshold}
                onChange={(e) =>
                  setProcessingConfig({ stitchThreshold: parseFloat(e.target.value) })
                }
              />
              <p className="text-[9px] italic text-fg-subtle">
                Post-process within the mask. Lower = more fabric.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </Panel>
  )
}
