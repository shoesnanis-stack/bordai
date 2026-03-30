'use client'

import type { Project, ProjectFile } from '@/types'

interface PreviewViewerProps {
  project: Project
  files: ProjectFile[]
}

export function PreviewViewer({ project, files }: PreviewViewerProps) {
  const previewFile = files.find((f) => f.file_type === 'preview')

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Preview canvas */}
      <div className="lg:col-span-2">
        <div className="flex aspect-square items-center justify-center rounded-lg border bg-gray-50">
          {previewFile ? (
            <p className="text-sm text-gray-500">
              Renderizando preview del bordado...
            </p>
          ) : (
            <p className="text-sm text-gray-400">
              No hay preview disponible aún.
            </p>
          )}
        </div>
      </div>

      {/* Controls sidebar */}
      <div className="space-y-4">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Ajustes</h3>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-sm text-gray-600">Tamaño</label>
              <input
                type="range"
                min="50"
                max="100"
                defaultValue="100"
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Densidad</label>
              <select className="w-full rounded-md border px-2 py-1 text-sm">
                <option value="light">Ligera</option>
                <option value="normal" selected>Normal</option>
                <option value="dense">Densa</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Información</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Superficie</dt>
              <dd>{project.surface}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Aro</dt>
              <dd>{project.hoop_size}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Formato</dt>
              <dd>{project.export_format}</dd>
            </div>
          </dl>
        </div>

        <button className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
          Aprobar y generar archivo
        </button>
      </div>
    </div>
  )
}
