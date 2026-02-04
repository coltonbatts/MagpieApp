import { useEffect, useMemo, useState } from 'react'
import { selectIsAppBusy, usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import type { WorkflowStage } from '@/types'

const MIN_TRANSITION_MS = 140
const EASTER_EGG_KEY = 'magpie:build-lock-note:v1'

const STAGE_VERB: Record<WorkflowStage, string> = {
  Fabric: 'Preparing studio',
  Reference: 'Placing reference',
  Select: 'Entering selection',
  Build: 'Locking composition',
  Export: 'Finalizing export view',
}

export function useWorkflowTransition() {
  const workflowTransition = useUIStore((state) => state.workflowTransition)
  const clearWorkflowTransition = useUIStore((state) => state.clearWorkflowTransition)
  const isAppBusy = usePatternStore(selectIsAppBusy)
  const compositionLocked = usePatternStore((state) => state.compositionLocked)
  const [showBuildLockNote, setShowBuildLockNote] = useState(false)

  useEffect(() => {
    if (!workflowTransition) return

    let raf = 0
    const transitionId = workflowTransition.id

    const settle = () => {
      const ui = useUIStore.getState()
      const activeTransition = ui.workflowTransition
      if (!activeTransition || activeTransition.id !== transitionId) return

      const isBusy = selectIsAppBusy(usePatternStore.getState())
      const elapsed = performance.now() - activeTransition.startedAt
      if (!isBusy && elapsed >= MIN_TRANSITION_MS) {
        ui.clearWorkflowTransition(transitionId)
        return
      }

      raf = window.requestAnimationFrame(settle)
    }

    raf = window.requestAnimationFrame(settle)
    return () => window.cancelAnimationFrame(raf)
  }, [clearWorkflowTransition, workflowTransition])

  useEffect(() => {
    if (!workflowTransition) {
      setShowBuildLockNote(false)
      return
    }

    const isBuildFromSelect = workflowTransition.from === 'Select' && workflowTransition.to === 'Build'
    const isUserInitiated = workflowTransition.source !== 'system'
    if (!isBuildFromSelect || !isUserInitiated || !compositionLocked) return

    if (typeof window === 'undefined') return
    if (window.sessionStorage.getItem(EASTER_EGG_KEY) === '1') return
    window.sessionStorage.setItem(EASTER_EGG_KEY, '1')
    setShowBuildLockNote(true)
  }, [compositionLocked, workflowTransition])

  const isSettling = !!workflowTransition && isAppBusy

  const transitionMessage = useMemo(() => {
    if (!workflowTransition) return null
    return STAGE_VERB[workflowTransition.to]
  }, [workflowTransition])

  return {
    workflowTransition,
    isSettling,
    transitionMessage,
    showBuildLockNote,
  }
}
