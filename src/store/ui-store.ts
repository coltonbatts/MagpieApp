import { create } from 'zustand'
import { WorkflowStage } from '@/types'
import type { CameraState } from '@/types'
import { VIEWER } from '@/lib/constants'
import { createDefaultCamera } from '@/lib/camera'

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
  selectCamera: CameraState
  viewerCamera: CameraState
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
  setSelectCamera: (camera: CameraState) => void
  setViewerCamera: (camera: CameraState) => void
}

export const useUIStore = create<UIState>((set) => ({
  showGrid: true,
  showMarkers: false,
  workflowStage: 'Fabric',
  workflowTransition: null,
  workflowTransitionSeq: 0,
  viewMode: 'Regions',
  highlightColorKey: null,
  selectCamera: createDefaultCamera(VIEWER.MIN_ZOOM, VIEWER.MAX_ZOOM),
  viewerCamera: createDefaultCamera(VIEWER.MIN_ZOOM, VIEWER.MAX_ZOOM),
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
  setSelectCamera: (camera) => set({ selectCamera: camera }),
  setViewerCamera: (camera) => set({ viewerCamera: camera }),
}))
