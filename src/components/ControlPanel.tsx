import { PROCESSING } from '@/lib/constants'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { ExportMenu } from './ExportMenu'
import { FabricPanel } from './FabricPanel'
import { useState } from 'react'
import { Button, Input, Panel } from './ui'

export function ControlPanel() {
  const { processingConfig, isProcessing, error, setProcessingConfig } = usePatternStore()
  const { workflowStage, setWorkflowStage } = useUIStore()
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Derived "Organic Detail" value (0..1)
  // Higher = more detail (less smoothing/simplify)
  const organicDetail = 1 - ((processingConfig.smoothingAmount + processingConfig.simplifyAmount) / 2)

  const handleOrganicDetailChange = (val: number) => {
    const inverse = 1 - val
    setProcessingConfig({
      smoothingAmount: inverse * 0.8,
      simplifyAmount: inverse * 0.5,
      minRegionSize: Math.round(inverse * 50) + 1
    })
  }

  if (workflowStage === 'Fabric' || workflowStage === 'Reference' || workflowStage === 'Select') return null

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border bg-surface">
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <div>
          <h2 className="mb-5 flex items-center text-lg font-semibold text-fg">
            <span className="mr-2">🛠️</span> Build Controls
          </h2>

          <div className="space-y-5">
            <FabricPanel />

            <Panel
              title={
                <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Subject Detail
                </span>
              }
              className="space-y-4"
            >
              <div className="space-y-4">
                <div>
                  <label className="mb-2 flex justify-between text-sm font-medium text-fg-muted">
                    <span>Number of Colors</span>
                    <span className="rounded border border-border bg-surface-2 px-2 py-0.5 text-xs text-fg">
                      {processingConfig.colorCount}
                    </span>
                  </label>
                  <Input
                    type="range"
                    variant="slider"
                    min={PROCESSING.MIN_COLORS}
                    max={PROCESSING.MAX_COLORS}
                    value={processingConfig.colorCount}
                    onChange={(e) =>
                      setProcessingConfig({ colorCount: parseInt(e.target.value, 10) })
                    }
                  />
                </div>

                <div>
                  <label className="mb-2 flex justify-between text-sm font-medium text-fg-muted">
                    <span>Organic Detail</span>
                    <span className="rounded border border-border bg-surface-2 px-2 py-0.5 text-xs text-fg">
                      {organicDetail < 0.3 ? 'Coarse' : organicDetail > 0.7 ? 'Fine' : 'Balanced'}
                    </span>
                  </label>
                  <Input
                    type="range"
                    variant="slider"
                    min={0}
                    max={1}
                    step={0.01}
                    value={organicDetail}
                    onChange={(e) => handleOrganicDetailChange(parseFloat(e.target.value))}
                  />
                  <div className="mt-1 flex justify-between text-[10px] uppercase text-fg-subtle">
                    <span>Coarse</span>
                    <span>Fine</span>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel
              title={
                <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Palette
                </span>
              }
            >
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface-2/70 px-3 py-2.5 transition-colors hover:bg-surface-2">
                <Input
                  type="checkbox"
                  variant="checkbox"
                  checked={processingConfig.useDmcPalette}
                  onChange={(e) => setProcessingConfig({ useDmcPalette: e.target.checked })}
                />
                <span className="text-sm font-medium text-fg-muted">Map to DMC Thread Colors</span>
              </label>
            </Panel>

            <div>
              <Button
                onClick={() => setShowAdvanced(!showAdvanced)}
                variant="ghost"
                size="sm"
                className="h-7 px-1 text-xs text-fg-muted hover:text-fg"
              >
                {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
              </Button>

              {showAdvanced && (
                <Panel
                  variant="inset"
                  className="mt-3 space-y-4 border-border/80"
                >
                  <div>
                    <label className="mb-2 block text-xs font-medium text-fg-subtle">
                      Target Size: {processingConfig.targetSize}px
                    </label>
                    <Input
                      type="range"
                      variant="slider"
                      min={PROCESSING.MIN_TARGET_SIZE}
                      max={PROCESSING.MAX_TARGET_SIZE}
                      value={processingConfig.targetSize}
                      onChange={(e) =>
                        setProcessingConfig({ targetSize: parseInt(e.target.value, 10) })
                      }
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-fg-subtle">
                    <Input
                      type="checkbox"
                      variant="checkbox"
                      checked={processingConfig.organicPreview}
                      onChange={(e) => setProcessingConfig({ organicPreview: e.target.checked })}
                    />
                    Organic Preview (Curved Regions)
                  </label>
                </Panel>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-border bg-surface-2/65 p-5">
        {workflowStage === 'Build' ? (
          <Button
            onClick={() => setWorkflowStage('Export')}
            variant="primary"
            className="h-10 w-full font-semibold"
          >
            Continue to Export
          </Button>
        ) : (
          <ExportMenu />
        )}

        <Button
          onClick={() => setWorkflowStage('Select')}
          variant="ghost"
          className="h-8 w-full text-sm text-fg-muted hover:text-fg"
        >
          Back to Selection
        </Button>

        {isProcessing && (
          <div className="flex items-center justify-center gap-2 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-accent/70 animate-pulse" />
            <span className="text-xs font-medium text-fg-muted">Processing...</span>
          </div>
        )}

        {error && (
          <p className="rounded border border-red-200 bg-red-50 p-2 text-center text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
