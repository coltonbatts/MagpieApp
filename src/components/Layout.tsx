import type { ReactNode } from 'react'

interface LayoutProps {
  viewer: ReactNode
  controls: ReactNode
  legend: ReactNode
}

export function Layout({ viewer, controls, legend }: LayoutProps) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-bg md:h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <div>
            <div className="text-sm font-semibold tracking-tight text-fg">
              MagpieApp
            </div>
            <div className="text-xs text-fg-subtle">
              Embroidery blueprint preview + thread list
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 justify-center px-4 py-4 md:min-h-0 md:px-5 md:py-5">
        <div className="flex w-full max-w-6xl flex-col gap-4 md:min-h-0 md:flex-row md:gap-5">
        {/* Controls */}
        <aside className="order-2 w-full overflow-hidden rounded-lg border border-border bg-surface md:order-none md:w-80 md:shrink-0">
          <div className="h-full overflow-y-auto p-4 md:p-5">{controls}</div>
        </aside>

        {/* Preview */}
        <main className="order-1 relative h-[52svh] min-h-[320px] w-full overflow-hidden rounded-lg border border-border bg-surface-2 md:order-none md:h-auto md:min-h-0 md:min-w-0 md:flex-1">
          {viewer}
        </main>

        {/* Thread list */}
        <aside className="order-3 w-full overflow-hidden rounded-lg border border-border bg-surface md:order-none md:w-80 md:shrink-0">
          <div className="h-full overflow-y-auto p-4 md:p-5">
            <h2 className="mb-3 text-base font-semibold text-fg">
              Thread list
            </h2>
            {legend}
          </div>
        </aside>
      </div>
      </div>
    </div>
  )
}
