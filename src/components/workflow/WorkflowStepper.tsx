import { useUIStore } from '@/store/ui-store'
import { WorkflowStage } from '@/types'
import { usePatternStore } from '@/store/pattern-store'

const STAGES: { id: WorkflowStage; label: string }[] = [
    { id: 'Reference', label: '1. Reference' },
    { id: 'Select', label: '2. Select' },
    { id: 'Build', label: '3. Build' },
    { id: 'Export', label: '4. Export' },
]

export function WorkflowStepper() {
    const { workflowStage, setWorkflowStage } = useUIStore()
    const { normalizedImage } = usePatternStore()

    return (
        <nav className="flex items-center justify-between border-b border-gray-200 bg-white px-8 py-4 shadow-sm">
            <div className="flex items-center space-x-12">
                <div className="flex items-center space-x-2">
                    <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold italic">M</div>
                    <span className="text-lg font-bold tracking-tight">MagpieApp</span>
                </div>

                <div className="flex items-center space-x-4">
                    {STAGES.map((stage, idx) => {
                        const isActive = workflowStage === stage.id
                        const isDisabled = idx > 0 && !normalizedImage

                        return (
                            <div key={stage.id} className="flex items-center">
                                <button
                                    onClick={() => !isDisabled && setWorkflowStage(stage.id)}
                                    disabled={isDisabled}
                                    className={`relative flex items-center px-4 py-2 text-sm font-medium transition-all rounded-md ${isActive
                                            ? 'text-blue-600 bg-blue-50'
                                            : isDisabled
                                                ? 'text-gray-300 cursor-not-allowed'
                                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    {stage.label}
                                    {isActive && (
                                        <span className="absolute bottom-0 left-0 h-0.5 w-full bg-blue-600 rounded-full" />
                                    )}
                                </button>
                                {idx < STAGES.length - 1 && (
                                    <div className="mx-2 h-px w-4 bg-gray-200" />
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="flex items-center space-x-4">
                {/* Could add help/settings icons here */}
            </div>
        </nav>
    )
}
