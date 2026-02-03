import type { ReactNode } from 'react'

interface LayoutProps {
  viewer: ReactNode
  controls: ReactNode
  legend: ReactNode
}

export function Layout({ viewer, controls, legend }: LayoutProps) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-gray-50 md:h-screen">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <div>
            <div className="text-sm font-semibold tracking-tight text-gray-900">
              MagpieApp
            </div>
            <div className="text-xs text-gray-500">
              Embroidery blueprint preview + thread list
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        {/* Controls */}
        <aside className="order-2 w-full overflow-y-visible border-t border-gray-200 bg-white md:order-none md:w-80 md:shrink-0 md:overflow-y-auto md:border-t-0 md:border-r">
          <div className="p-4 md:p-6">{controls}</div>
        </aside>

        {/* Preview */}
        <main className="order-1 relative h-[52svh] min-h-[320px] w-full bg-gray-50 md:order-none md:h-auto md:min-h-0 md:min-w-0 md:flex-1">
          {viewer}
        </main>

        {/* Thread list */}
        <aside className="order-3 w-full overflow-y-visible border-t border-gray-200 bg-white md:order-none md:w-80 md:shrink-0 md:overflow-y-auto md:border-l md:border-t-0">
          <div className="p-4 md:p-6">
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              Thread list
            </h2>
            {legend}
          </div>
        </aside>
      </div>
    </div>
  )
}
