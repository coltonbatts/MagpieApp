import { beforeEach, describe, expect, it } from 'vitest'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import type { ReferencePlacement } from '@/types'

describe('composition locking', () => {
  beforeEach(() => {
    usePatternStore.getState().reset()
    usePatternStore.getState().setCompositionLocked(false)
    useUIStore.getState().setWorkflowStage('Fabric')
  })

  it('keeps reference placement immutable after Select -> Build lock', () => {
    const initialPlacement: ReferencePlacement = {
      x: 0.1,
      y: 0.2,
      width: 0.7,
      height: 0.7,
    }

    usePatternStore.getState().setReferencePlacement(initialPlacement)

    // Mimic "Continue to Build" flow from SelectStage.
    useUIStore.getState().setWorkflowStage('Select')
    usePatternStore.getState().setCompositionLocked(true)
    useUIStore.getState().setWorkflowStage('Build')

    // Simulate pointer drag/wheel-zoom handlers trying to mutate placement.
    usePatternStore.getState().setReferencePlacement({
      x: 0.2,
      y: 0.25,
      width: 0.8,
      height: 0.8,
    })

    usePatternStore.getState().setReferencePlacement({
      x: 0.05,
      y: 0.1,
      width: 0.9,
      height: 0.9,
    })

    expect(usePatternStore.getState().referencePlacement).toEqual(initialPlacement)
  })
})
