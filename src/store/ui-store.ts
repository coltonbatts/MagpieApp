import { create } from 'zustand'

interface UIState {
  showGrid: boolean
  showMarkers: boolean
  setShowGrid: (showGrid: boolean) => void
  setShowMarkers: (showMarkers: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  showGrid: true,
  showMarkers: false,
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowMarkers: (showMarkers) => set({ showMarkers }),
}))
