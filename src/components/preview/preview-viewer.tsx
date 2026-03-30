'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@/types'

interface DigitizationParams {
  regions: {
    name: string
    stitch_type: string
    density: number
    color_name: string
    color_hex: string
  }[]
  thread_colors: { index: number; name: string; hex: string }[]
  total_stitches_estimate: number
  width_mm: number
  height_mm: number
  notes: string
}

interface PreviewViewerProps {
  project: Project
  imageUrl: string | null
  digitizationParams: DigitizationParams | null
}

export function PreviewViewer({ project, imageUrl, digitizationParams }: PreviewViewerProps) {
  const router = useRouter()
  const [approving, setApproving] = useState(false)

  async function handleApprove() {
    setApproving(true)
    const supabase = createClient()
    await supabase
      .from('projects')
      .update({ current_phase: 'generation', status: 'processing' })
      .eq('id', project.id)
    router.push(`/project/${project.id}`)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Image preview */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-center rounded-xl border bg-gray-50 overflow-hidden min-h-72">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt="Diseño para bordar"
              width={600}
              height={400}
              className="max-h-96 w-auto object-contain"
            />
          ) : (
            <p className="text-sm text-gray-400">No hay imagen disponible</p>
          )}
        </div>

        {/* Regions table */}
        {digitizationParams?.regions && (
          <div className="rounded-xl border overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b">
              <p className="text-sm font-medium">Regiones y puntadas</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-400">
                  <th className="px-4 py-2 text-left">Region</th>
                  <th className="px-4 py-2 text-left">Puntada</th>
                  <th className="px-4 py-2 text-left">Color</th>
                  <th className="px-4 py-2 text-left">Densidad</th>
                </tr>
              </thead>
              <tbody>
                {digitizationParams.regions.map((region, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium">{region.name}</td>
                    <td className="px-4 py-2.5 capitalize text-gray-600">{region.stitch_type}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 rounded-full border"
                          style={{ backgroundColor: region.color_hex }}
                        />
                        <span className="text-gray-600">{region.color_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{region.density} p/mm</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {digitizationParams?.notes && (
          <p className="text-sm text-gray-500 italic">{digitizationParams.notes}</p>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Stats */}
        {digitizationParams && (
          <div className="rounded-xl border p-4 space-y-3">
            <h3 className="font-medium">Datos del bordado</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Puntadas estimadas</dt>
                <dd className="font-medium">{digitizationParams.total_stitches_estimate?.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Tamaño</dt>
                <dd className="font-medium">{digitizationParams.width_mm}×{digitizationParams.height_mm}mm</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Colores de hilo</dt>
                <dd className="font-medium">{digitizationParams.thread_colors?.length ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Formato de salida</dt>
                <dd className="font-medium">{project.export_format}</dd>
              </div>
            </dl>
          </div>
        )}

        {/* Thread colors */}
        {digitizationParams?.thread_colors && (
          <div className="rounded-xl border p-4">
            <h3 className="mb-3 font-medium">Orden de colores</h3>
            <div className="space-y-2">
              {digitizationParams.thread_colors.map((color) => (
                <div key={color.index} className="flex items-center gap-3 text-sm">
                  <span className="w-4 text-xs text-gray-400">{color.index}</span>
                  <div
                    className="h-5 w-5 rounded-full border shadow-sm"
                    style={{ backgroundColor: color.hex }}
                  />
                  <span>{color.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Approve button */}
        <button
          onClick={handleApprove}
          disabled={approving}
          className="w-full rounded-lg bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-40 hover:bg-green-700"
        >
          {approving ? 'Aprobando...' : 'Aprobar y generar archivo'}
        </button>

        <p className="text-center text-xs text-gray-400">
          Al aprobar se generara el archivo {project.export_format} listo para tu maquina.
        </p>
      </div>
    </div>
  )
}
