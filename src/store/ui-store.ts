import { create } from 'zustand'
import { WorkflowStage } from '@/types'

export type WorkflowTransitionSource = 'cta' | 'stepper' | 'keyboard' | 'system'

export interface WorkflowTransitionState {
  id: number
  from: WorkflowStage
  to: WorkflowStage
  source: WorkflowTransitionSource
  startedAt: number
}

interface UIState {
  showGrid: boolean
  showMarkers: boolean
  workflowStage: WorkflowStage
  workflowTransition: WorkflowTransitionState | null
  workflowTransitionSeq: number
  viewMode: 'Regions' | 'Grid'
  highlightColorKey: string | null
  setShowGrid: (showGrid: boolean) => void
  setShowMarkers: (showMarkers: boolean) => void
  setWorkflowStage: (
    stage: WorkflowStage,
    opts?: {
      source?: WorkflowTransitionSource
      acknowledge?: boolean
    }
  ) => void
  clearWorkflowTransition: (id: number) => void
  setViewMode: (mode: 'Regions' | 'Grid') => void
  setHighlightColorKey: (key: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  showGrid: true,
  showMarkers: false,
  workflowStage: 'Fabric',
  workflowTransition: null,
  workflowTransitionSeq: 0,
  viewMode: 'Regions',
  highlightColorKey: null,
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowMarkers: (showMarkers) => set({ showMarkers }),
  setWorkflowStage: (stage, opts) =>
    set((state) => {
      if (stage === state.workflowStage) return {}

      const acknowledge = opts?.acknowledge ?? true
      const source = opts?.source ?? 'system'

      if (!acknowledge) {
        return {
          workflowStage: stage,
        }
      }

      const now = performance.now()
      const transitionId = state.workflowTransitionSeq + 1
      return {
        workflowStage: stage,
        workflowTransitionSeq: transitionId,
        workflowTransition: {
          id: transitionId,
          from: state.workflowStage,
          to: stage,
          source,
          startedAt: now,
        },
      }
    }),
  clearWorkflowTransition: (id) =>
    set((state) => {
      if (!state.workflowTransition) return {}
      if (state.workflowTransition.id !== id) return {}
      return { workflowTransition: null }
    }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setHighlightColorKey: (key) => set({ highlightColorKey: key }),
}))
