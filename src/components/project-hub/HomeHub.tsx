import { useEffect, useMemo, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { Button } from '@/components/ui'
import { MascotEyes } from '@/components/MascotEyes'
import { getPlatformAdapter } from '@/platform'
import { getAllProjects } from '@/project-hub/api'
import type { ManifestEntry } from '@/project-hub/types'
import type { HoopShape } from '@/types'

const HOOP_OPTIONS: Array<{
  shape: HoopShape
  sizeMm: number
  label: string
  icon: string
}> = [
  { shape: 'round', sizeMm: 177, label: 'Round 7"', icon: 'O' },
  { shape: 'square', sizeMm: 180, label: 'Square 7"', icon: '[ ]' },
  { shape: 'oval', sizeMm: 220, label: 'Oval 8.5"', icon: '( )' },
  { shape: 'round', sizeMm: 254, label: 'Round 10"', icon: 'O' },
]

interface NewProjectDraft {
  projectName: string
  referenceImagePath: string
  hoopShape: HoopShape
  hoopSizeMm: number
}

interface HomeHubProps {
  onCreateProject: (draft: NewProjectDraft) => Promise<void> | void
  onOpenProject: (projectId: string) => Promise<void> | void
}

export function HomeHub({ onCreateProject, onOpenProject }: HomeHubProps) {
  const [projects, setProjects] = useState<ManifestEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSetupFlowOpen, setIsSetupFlowOpen] = useState(true)
  const [draft, setDraft] = useState<NewProjectDraft>({
    projectName: '',
    referenceImagePath: '',
    hoopShape: 'round',
    hoopSizeMm: 254,
  })
  const [error, setError] = useState<string | null>(null)

  const canCreate = useMemo(
    () => draft.projectName.trim().length > 1 && draft.referenceImagePath.trim().length > 0,
    [draft.projectName, draft.referenceImagePath]
  )

  useEffect(() => {
    void refreshProjects()
  }, [])

  async function refreshProjects() {
    setLoading(true)
    setError(null)
    try {
      const entries = await getAllProjects()
      setProjects(entries)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function chooseReferenceImage() {
    const platform = await getPlatformAdapter()
    if (!platform.isDesktop) {
      setError('Project Hub image picker is only available in desktop mode.')
      return
    }

    const path = await platform.selectOpenPath({
      title: 'Select Project Reference Image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
    })
    if (!path) return
    setDraft((current) => ({ ...current, referenceImagePath: path }))
  }

  async function handleCreate() {
    if (!canCreate || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      await onCreateProject({
        projectName: draft.projectName.trim(),
        referenceImagePath: draft.referenceImagePath.trim(),
        hoopShape: draft.hoopShape,
        hoopSizeMm: draft.hoopSizeMm,
      })
      setDraft({ projectName: '', referenceImagePath: '', hoopShape: 'round', hoopSizeMm: 254 })
      setIsSetupFlowOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create project.'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  function chooseHoop(shape: HoopShape, sizeMm: number) {
    setDraft((current) => ({ ...current, hoopShape: shape, hoopSizeMm: sizeMm }))
  }

  return (
    <div className="hub-bg min-h-screen overflow-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-5 pb-16 pt-10 sm:px-8">
        <header className="mb-10 flex w-full flex-col items-center gap-3 text-center">
          <MascotEyes inline />
          <h1 className="text-4xl font-semibold tracking-tight text-fg">Project Hub</h1>
        </header>

        {error && (
          <div className="mb-5 w-full rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="w-full rounded-3xl border border-border/80 bg-surface/85 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur sm:p-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-[0.24em] text-fg-subtle">New Project</h2>
            {!isSetupFlowOpen && (
              <Button variant="ghost" size="sm" onClick={() => setIsSetupFlowOpen(true)}>
                Start New
              </Button>
            )}
          </div>

          {isSetupFlowOpen ? (
            <div className="space-y-6">
              <div>
                <p className="text-lg font-semibold text-fg">Step 1 - Pick your hoop size</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {HOOP_OPTIONS.map((option) => {
                  const selected = draft.hoopShape === option.shape && draft.hoopSizeMm === option.sizeMm
                  return (
                    <button
                      key={`${option.shape}-${option.sizeMm}`}
                      type="button"
                      onClick={() => chooseHoop(option.shape, option.sizeMm)}
                      className={`rounded-2xl border p-4 text-left transition-all duration-200 ${
                        selected
                          ? 'border-border-strong bg-accent-soft shadow-sm'
                          : 'border-border bg-white/80 hover:-translate-y-0.5 hover:border-border-strong/70'
                      }`}
                    >
                      <div className="mb-2 text-xl text-fg">{option.icon}</div>
                      <p className="text-sm font-semibold text-fg">{option.label}</p>
                    </button>
                  )
                })}
              </div>

              <div className="border-t border-border/60 pt-5">
                <p className="text-lg font-semibold text-fg">Step 2 - Name and reference</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-fg-muted">
                  Project Name
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-border-strong"
                    value={draft.projectName}
                    onChange={(event) => setDraft((current) => ({ ...current, projectName: event.target.value }))}
                    placeholder="Spring Garden Sampler"
                  />
                </label>

                <label className="block text-sm font-medium text-fg-muted">
                  Reference Image
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-fg-muted"
                      value={draft.referenceImagePath}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, referenceImagePath: event.target.value }))
                      }
                      placeholder="/path/to/reference.png"
                    />
                    <Button variant="secondary" onClick={() => void chooseReferenceImage()}>
                      Browse
                    </Button>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsSetupFlowOpen(false)}>
                  Close
                </Button>
                <Button variant="primary" disabled={!canCreate || isSaving} onClick={() => void handleCreate()}>
                  {isSaving ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-8 w-full">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-subtle">Recent Projects</h2>
            <Button variant="ghost" size="sm" onClick={() => void refreshProjects()}>
              Refresh
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-fg-muted">Loading projects...</p>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface/80 p-6 text-sm text-fg-muted">No saved projects yet.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {projects.map((project) => (
                <button
                  key={project.project_id}
                  type="button"
                  onClick={() => void onOpenProject(project.project_id)}
                  className="group rounded-xl border border-border bg-surface/90 p-3 text-left transition hover:-translate-y-0.5 hover:border-border-strong"
                >
                  <div className="mb-3 aspect-video overflow-hidden rounded-md bg-surface-2">
                    {project.thumbnail_path ? (
                      <img
                        src={convertFileSrc(project.thumbnail_path)}
                        alt={project.project_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-wider text-fg-subtle">
                        No Thumbnail
                      </div>
                    )}
                  </div>
                  <p className="truncate text-sm font-bold text-fg">{project.project_name}</p>
                  <p className="truncate text-[11px] text-fg-subtle">
                    Updated {new Date(project.last_modified).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
