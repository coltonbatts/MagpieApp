import { useEffect, useState } from 'react'
import { Button, Panel, Select } from '@/components/ui'
import type { HoopConfig } from '@/types'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { getPlatformAdapter } from '@/platform'
import {
  getRecentProjects,
  loadProjectFromPath,
  removeRecentProject,
  type RecentProjectEntry,
} from '@/project/persistence'

const HOOP_PRESETS: HoopConfig[] = [
  { presetId: 'round-150', label: 'Round 150mm', shape: 'round', widthMm: 150, heightMm: 150 },
  { presetId: 'oval-180x130', label: 'Oval 180 x 130mm', shape: 'oval', widthMm: 180, heightMm: 130 },
  { presetId: 'square-160', label: 'Square 160mm', shape: 'square', widthMm: 160, heightMm: 160 },
]

export function FabricStage() {
  const { fabricSetup, setFabricSetup } = usePatternStore()
  const { setWorkflowStage } = useUIStore()
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([])
  const [isDesktop, setIsDesktop] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [isResuming, setIsResuming] = useState(false)

  useEffect(() => {
    let mounted = true
    void getPlatformAdapter().then((platform) => {
      if (!mounted) return
      setIsDesktop(platform.isDesktop)
    })
    setRecentProjects(getRecentProjects())
    return () => {
      mounted = false
    }
  }, [])

  const refreshRecentProjects = () => {
    setRecentProjects(getRecentProjects())
  }

  const handleOpenProject = async (path?: string) => {
    try {
      setResumeError(null)
      setIsResuming(true)
      const platform = await getPlatformAdapter()
      const selectedPath = path ?? await platform.selectOpenPath({
        title: 'Open Magpie project',
        filters: [{ name: 'Magpie project', extensions: ['magpie'] }],
      })

      if (!selectedPath) return

      await loadProjectFromPath(selectedPath)
      refreshRecentProjects()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown project load failure.'
      setResumeError(message)
      if (path) {
        removeRecentProject(path)
        refreshRecentProjects()
      }
    } finally {
      setIsResuming(false)
    }
  }

  const fabricHex = `#${fabricSetup.color.r.toString(16).padStart(2, '0')}${fabricSetup.color.g
    .toString(16)
    .padStart(2, '0')}${fabricSetup.color.b.toString(16).padStart(2, '0')}`

  return (
    <div className="min-h-[calc(100vh-64px)] bg-bg px-4 py-8 md:px-5 md:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto w-full max-w-2xl">
          <Panel className="space-y-8" elevated>
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-fg">Step 1: Fabric + Hoop</h2>
              <p className="text-sm text-fg-muted">
                Set physical context first. Your reference will be placed into this hoop next.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Fabric Type</span>
                <Select
                  value={fabricSetup.type}
                  onChange={(event) => setFabricSetup({ type: event.target.value as typeof fabricSetup.type })}
                >
                  <option value="linen">Linen</option>
                  <option value="aida">Aida</option>
                  <option value="evenweave">Evenweave</option>
                </Select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Texture</span>
                <Select
                  value={fabricSetup.texture}
                  onChange={(event) => setFabricSetup({ texture: event.target.value as typeof fabricSetup.texture })}
                >
                  <option value="natural">Natural</option>
                  <option value="soft">Soft</option>
                  <option value="coarse">Coarse</option>
                </Select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Count</span>
                <Select
                  value={String(fabricSetup.count)}
                  onChange={(event) =>
                    setFabricSetup({ count: Number(event.target.value) as typeof fabricSetup.count })
                  }
                >
                  <option value="11">11 ct</option>
                  <option value="14">14 ct</option>
                  <option value="16">16 ct</option>
                  <option value="18">18 ct</option>
                </Select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Hoop</span>
                <Select
                  value={fabricSetup.hoop.presetId}
                  onChange={(event) => {
                    const nextHoop = HOOP_PRESETS.find((preset) => preset.presetId === event.target.value)
                    if (nextHoop) setFabricSetup({ hoop: nextHoop })
                  }}
                >
                  {HOOP_PRESETS.map((preset) => (
                    <option key={preset.presetId} value={preset.presetId}>
                      {preset.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Fabric Color</p>
                <p className="text-xs text-fg-muted">Used as hoop background and stitch subtraction baseline.</p>
              </div>
              <input
                type="color"
                value={fabricHex}
                onChange={(event) => {
                  const hex = event.target.value
                  const r = parseInt(hex.slice(1, 3), 16)
                  const g = parseInt(hex.slice(3, 5), 16)
                  const b = parseInt(hex.slice(5, 7), 16)
                  setFabricSetup({ color: { r, g, b } })
                }}
                className="h-10 w-12 cursor-pointer rounded border border-border bg-surface p-1"
              />
            </div>

            <Button
              onClick={() => setWorkflowStage('Reference')}
              variant="primary"
              className="h-11 w-full text-base font-semibold"
            >
              Continue to Reference
            </Button>
          </Panel>

          {isDesktop && (
            <Panel className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-fg">Recent Projects</h3>
                  <p className="text-xs text-fg-muted">Resume from a saved `.magpie` file.</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleOpenProject()}
                  disabled={isResuming}
                >
                  {isResuming ? 'Opening…' : 'Open Project'}
                </Button>
              </div>

              {recentProjects.length === 0 ? (
                <p className="text-xs text-fg-subtle">No recent projects yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentProjects.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => void handleOpenProject(entry.path)}
                      className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-left transition-colors hover:bg-surface"
                      disabled={isResuming}
                    >
                      <div className="truncate text-sm font-medium text-fg">{entry.name}</div>
                      <div className="truncate text-[11px] text-fg-subtle">{entry.path}</div>
                    </button>
                  ))}
                </div>
              )}

              {resumeError && (
                <p className="text-xs text-red-600">Failed to open project: {resumeError}</p>
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
