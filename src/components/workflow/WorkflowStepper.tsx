import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { WorkflowStage } from '@/types'

const STAGES: { id: WorkflowStage; label: string }[] = [
  { id: 'Fabric', label: '1. Fabric + Hoop' },
  { id: 'Reference', label: '2. Reference' },
  { id: 'Select', label: '3. Select' },
  { id: 'Build', label: '4. Build' },
  { id: 'Export', label: '5. Export' },
]

export function WorkflowStepper() {
  const { workflowStage, workflowTransition, setWorkflowStage } = useUIStore()
  const { originalImage, normalizedImage, selectionWorkingImage, setCompositionLocked } = usePatternStore()

  return (
    <nav className="border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 md:px-5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            {STAGES.map((stage, idx) => {
              const isActive = workflowStage === stage.id
              const isPending = workflowTransition?.to === stage.id
              const isDisabled =
                stage.id === 'Select'
                  ? !originalImage || !selectionWorkingImage
                  : (stage.id === 'Build' || stage.id === 'Export') && !normalizedImage

              return (
                <div key={stage.id} className="flex items-center">
                  <button
                    onClick={() => {
                      if (isDisabled) return
                      if (workflowStage === 'Select' && (stage.id === 'Build' || stage.id === 'Export')) {
                        setCompositionLocked(true)
                      }
                      setWorkflowStage(stage.id, { source: 'stepper' })
                    }}
                    disabled={isDisabled}
                    className={`relative inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium transition-all duration-180 ease-standard active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
                      isActive
                        ? 'border-border-strong bg-accent-soft text-fg'
                        : isPending
                          ? 'border-border-strong/80 bg-surface-2 text-fg animate-[stepper-settle_420ms_ease-out]'
                        : isDisabled
                          ? 'cursor-not-allowed border-transparent text-fg-subtle/60'
                          : 'border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    {stage.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-2 right-2 h-px bg-border-strong" />
                    )}
                  </button>
                  {idx < STAGES.length - 1 && (
                    <div className="mx-1.5 h-px w-3 bg-border" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center" />
      </div>
    </nav>
  )
}
