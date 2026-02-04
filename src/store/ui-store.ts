import { create } from 'zustand'
import { WorkflowStage } from '@/types'

interface UIState {
  showGrid: boolean
  showMarkers: boolean
  workflowStage: WorkflowStage
  viewMode: 'Regions' | 'Grid'
  highlightColorKey: string | null
  setShowGrid: (showGrid: boolean) => void
  setShowMarkers: (showMarkers: boolean) => void
  setWorkflowStage: (stage: WorkflowStage) => void
  setViewMode: (mode: 'Regions' | 'Grid') => void
  setHighlightColorKey: (key: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  showGrid: true,
  showMarkers: false,
  workflowStage: 'Fabric',
  viewMode: 'Regions',
  highlightColorKey: null,
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowMarkers: (showMarkers) => set({ showMarkers }),
  setWorkflowStage: (stage) => set({ workflowStage: stage }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setHighlightColorKey: (key) => set({ highlightColorKey: key }),
}))
