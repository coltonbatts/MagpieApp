import { beforeEach, describe, expect, it } from 'vitest'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import type { WorkflowStage } from '@/types'

describe('workflow transition state', () => {
  beforeEach(() => {
    usePatternStore.getState().setCompositionLocked(false)
    useUIStore.setState({
      workflowStage: 'Fabric',
      workflowTransition: null,
      workflowTransitionSeq: 0,
    })
  })

  it('uses monotonic transition ids and latest-wins clear semantics', () => {
    const ui = useUIStore.getState()
    ui.setWorkflowStage('Reference', { source: 'stepper' })
    const firstId = useUIStore.getState().workflowTransition?.id
    expect(firstId).toBe(1)

    ui.setWorkflowStage('Select', { source: 'stepper' })
    const secondId = useUIStore.getState().workflowTransition?.id
    expect(secondId).toBe(2)

    useUIStore.getState().clearWorkflowTransition(firstId!)
    expect(useUIStore.getState().workflowTransition?.id).toBe(secondId)

    useUIStore.getState().clearWorkflowTransition(secondId!)
    expect(useUIStore.getState().workflowTransition).toBeNull()
  })

  it('stays stable under rapid stage clicks', () => {
    const targets: WorkflowStage[] = [
      'Reference', 'Select', 'Build', 'Select', 'Reference',
      'Select', 'Build', 'Export', 'Build', 'Select',
      'Reference', 'Select', 'Build', 'Export', 'Build',
      'Select', 'Reference', 'Select', 'Build', 'Export',
    ]

    for (const stage of targets) {
      useUIStore.getState().setWorkflowStage(stage, { source: 'stepper' })
    }

    const state = useUIStore.getState()
    expect(state.workflowStage).toBe('Export')
    expect(state.workflowTransition?.id).toBe(20)

    state.clearWorkflowTransition(state.workflowTransition!.id)
    expect(useUIStore.getState().workflowTransition).toBeNull()

    // Transition state changes must not mutate composition-lock rules.
    expect(usePatternStore.getState().compositionLocked).toBe(false)
  })
})
