'use client'

import { PIPELINE_PHASES } from '@/lib/constants'
import type { Project } from '@/types'

interface PipelineTrackerProps {
  project: Project
}

export function PipelineTracker({ project }: PipelineTrackerProps) {
  const currentIndex = PIPELINE_PHASES.findIndex(
    (p) => p.phase === project.current_phase
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {PIPELINE_PHASES.map((phase, index) => (
          <div key={phase.phase} className="flex-1">
            <div
              className={`h-2 rounded-full ${
                index < currentIndex
                  ? 'bg-green-500'
                  : index === currentIndex
                    ? 'bg-blue-500'
                    : 'bg-gray-200'
              }`}
            />
            <p className="mt-1 text-xs font-medium">{phase.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-6">
        <h2 className="text-lg font-semibold">
          {PIPELINE_PHASES[currentIndex]?.label}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {PIPELINE_PHASES[currentIndex]?.description}
        </p>

        {/* Phase-specific UI will be rendered here based on current_phase */}
        <div className="mt-4 rounded-md bg-gray-50 p-4 text-sm text-gray-500">
          Contenido de la fase: {project.current_phase}
        </div>
      </div>
    </div>
  )
}
