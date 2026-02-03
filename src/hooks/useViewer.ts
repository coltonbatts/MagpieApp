import { useUIStore } from '@/store/ui-store'

export function useViewer() {
  return useUIStore((state) => ({
    showGrid: state.showGrid,
    setShowGrid: state.setShowGrid,
    showMarkers: state.showMarkers,
    setShowMarkers: state.setShowMarkers,
  }))
}
