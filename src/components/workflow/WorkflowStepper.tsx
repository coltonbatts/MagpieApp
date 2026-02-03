import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { WorkflowStage } from '@/types'

const STAGES: { id: WorkflowStage; label: string }[] = [
  { id: 'Reference', label: '1. Reference' },
  { id: 'Select', label: '2. Select' },
  { id: 'Build', label: '3. Build' },
  { id: 'Export', label: '4. Export' },
]

export function WorkflowStepper() {
  const { workflowStage, setWorkflowStage } = useUIStore()
  const { normalizedImage } = usePatternStore()

  return (
    <nav className="border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 md:px-5">
        <div className="flex items-center gap-8">
          <div className="flex items-center">
            <span className="text-sm font-semibold tracking-tight text-fg">MagpieApp</span>
          </div>

          <div className="flex items-center gap-2">
            {STAGES.map((stage, idx) => {
              const isActive = workflowStage === stage.id
              const isDisabled = idx > 0 && !normalizedImage

              return (
                <div key={stage.id} className="flex items-center">
                  <button
                    onClick={() => !isDisabled && setWorkflowStage(stage.id)}
                    disabled={isDisabled}
                    className={`relative inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium transition-colors duration-180 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
                      isActive
                        ? 'border-border-strong bg-accent-soft text-fg'
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
