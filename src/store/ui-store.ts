import { create } from 'zustand'
import { WorkflowStage } from '@/types'

interface UIState {
  showGrid: boolean
  showMarkers: boolean
  workflowStage: WorkflowStage
  setShowGrid: (showGrid: boolean) => void
  setShowMarkers: (showMarkers: boolean) => void
  setWorkflowStage: (stage: WorkflowStage) => void
}

export const useUIStore = create<UIState>((set) => ({
  showGrid: true,
  showMarkers: false,
  workflowStage: 'Reference',
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowMarkers: (showMarkers) => set({ showMarkers }),
  setWorkflowStage: (stage) => set({ workflowStage: stage }),
}))
