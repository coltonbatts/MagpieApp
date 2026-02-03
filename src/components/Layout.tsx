import type { ReactNode } from 'react'

interface LayoutProps {
  viewer: ReactNode
  controls: ReactNode
  legend: ReactNode
}

export function Layout({ viewer, controls, legend }: LayoutProps) {
  return (
    <div className="flex h-screen w-screen bg-gray-50">
      <div className="w-80 overflow-y-auto border-r border-gray-200 bg-white">
        <div className="p-6">
          <h1 className="mb-6 text-2xl font-bold text-gray-900">MagpieApp</h1>
          {controls}
        </div>
      </div>

      <div className="relative flex-1">{viewer}</div>

      <div className="w-80 overflow-y-auto border-l border-gray-200 bg-white">
        <div className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Legend</h2>
          {legend}
        </div>
      </div>
    </div>
  )
}
