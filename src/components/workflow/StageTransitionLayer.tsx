import { useMemo } from 'react'
import { useWorkflowTransition } from '@/hooks/useWorkflowTransition'

export function StageTransitionLayer() {
  const { workflowTransition, isSettling, transitionMessage, showBuildLockNote } = useWorkflowTransition()

  const note = useMemo(() => {
    if (!workflowTransition) return null
    if (showBuildLockNote) return 'First lock complete. Build is now composition-safe.'
    if (isSettling) return 'Finalizing view'
    return 'Applying stage change'
  }, [isSettling, showBuildLockNote, workflowTransition])

  if (!workflowTransition) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-[90]">
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[1.5px] transition-opacity duration-180" />
      <div className="absolute left-1/2 top-4 -translate-x-1/2">
        <div className="min-w-[260px] rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-xl">
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-fg animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-fg-subtle">
              {transitionMessage}
            </span>
          </div>
          <div className="mt-2 h-px w-full overflow-hidden bg-border">
            <div
              className={`h-full bg-border-strong ${isSettling ? 'animate-[transition-sweep_900ms_linear_infinite]' : 'w-full'}`}
            />
          </div>
          <p className="mt-2 text-[11px] text-fg-muted">{note}</p>
        </div>
      </div>
    </div>
  )
}
