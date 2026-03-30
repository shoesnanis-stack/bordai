'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PIPELINE_PHASES } from '@/lib/constants'
import type { Project } from '@/types'

interface PipelineTrackerProps {
  project: Project
}

export function PipelineTracker({ project }: PipelineTrackerProps) {
  const currentIndex = PIPELINE_PHASES.findIndex((p) => p.phase === project.current_phase)
  const router = useRouter()

  return (
    <div className="space-y-6">
      {/* Phase progress bar */}
      <div className="flex gap-1.5">
        {PIPELINE_PHASES.map((phase, index) => (
          <div key={phase.phase} className="flex-1">
            <div
              className={`h-1.5 rounded-full ${
                index < currentIndex
                  ? 'bg-green-500'
                  : index === currentIndex
                    ? 'bg-blue-500'
                    : 'bg-gray-200'
              }`}
            />
            <p className="mt-1 hidden text-xs text-gray-500 sm:block">{phase.label}</p>
          </div>
        ))}
      </div>

      {/* Current phase content */}
      <div className="rounded-xl border p-6">
        <h2 className="mb-1 text-lg font-semibold">
          {PIPELINE_PHASES[currentIndex]?.label}
        </h2>
        <p className="mb-6 text-sm text-gray-500">
          {PIPELINE_PHASES[currentIndex]?.description}
        </p>

        {project.current_phase === 'onboarding' && (
          <OnboardingPhase project={project} onAdvance={() => router.refresh()} />
        )}

        {project.current_phase === 'ingestion' && (
          <IngestionPhase project={project} onAdvance={() => router.refresh()} />
        )}

        {project.current_phase === 'extraction' && (
          <ExtractionPhase project={project} onAdvance={() => router.refresh()} />
        )}

        {project.current_phase === 'preparation' && (
          <PreparationPhase project={project} onAdvance={() => router.refresh()} />
        )}

        {project.current_phase === 'preview' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Tu diseno esta listo para revisar. Apruebalo antes de generar el archivo final.
            </p>
            <a
              href={`/project/${project.id}/preview`}
              className="inline-block rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
            >
              Ver vista previa
            </a>
          </div>
        )}

        {project.current_phase === 'generation' && (
          <GenerationPhase project={project} onAdvance={() => router.refresh()} />
        )}

        {project.current_phase === 'delivery' && (
          <DeliveryPhase project={project} />
        )}
      </div>

      {/* Completed phases */}
      {currentIndex > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Fases completadas</p>
          {PIPELINE_PHASES.slice(0, currentIndex).map((phase) => (
            <div key={phase.phase} className="flex items-center gap-2 text-sm text-gray-500">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-xs text-white">✓</span>
              {phase.label}
            </div>
          ))}
        </div>
      )}

      {/* Dev tools: Simulate + Diagnose */}
      <SimulateAndDiagnosePanel project={project} onComplete={() => router.refresh()} />
    </div>
  )
}

// ─── Onboarding phase: upload image ───────────────────────────────

function OnboardingPhase({ project, onAdvance }: { project: Project; onAdvance: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const isTextOnly = project.type === 'text_only'
  const [textDescription, setTextDescription] = useState('')

  async function handleAdvance() {
    setUploading(true)
    setError(null)
    const supabase = createClient()

    if (file) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const ext = file.name.split('.').pop()
      const path = `${user.id}/${project.id}/original/image.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(path, file, { upsert: true })

      if (uploadError) {
        setError('Error al subir la imagen: ' + uploadError.message)
        setUploading(false)
        return
      }

      await supabase.from('project_files').insert({
        project_id: project.id,
        phase: 'onboarding',
        file_type: 'original',
        storage_path: path,
        mime_type: file.type,
        metadata: { original_name: file.name, size: file.size },
      })
    }

    const { error: updateError } = await supabase
      .from('projects')
      .update({ current_phase: 'ingestion', status: 'processing' })
      .eq('id', project.id)

    if (updateError) {
      setError('Error al avanzar: ' + updateError.message)
      setUploading(false)
      return
    }

    router.refresh()
    onAdvance()
  }

  const canAdvance = isTextOnly ? textDescription.trim().length > 10 : file !== null

  return (
    <div className="space-y-5">
      {/* Config summary */}
      <div className="grid grid-cols-3 gap-3 rounded-lg bg-gray-50 p-4 text-sm">
        <div>
          <p className="text-xs text-gray-400">Superficie</p>
          <p className="font-medium capitalize">{project.surface}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Aro</p>
          <p className="font-medium">{project.hoop_size}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Maquina</p>
          <p className="font-medium capitalize">{project.machine_brand}</p>
        </div>
      </div>

      {isTextOnly ? (
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            ¿Que texto quieres bordar?
          </label>
          <textarea
            value={textDescription}
            onChange={(e) => setTextDescription(e.target.value)}
            placeholder="Ej: Transportes Perez, fuente bold, con el escudo de la empresa debajo"
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ) : (
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            {project.type === 'from_scratch' ? 'Describe lo que quieres' : 'Sube tu imagen o logo'}
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors ${
              file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'
            }`}
          >
            {file ? (
              <>
                <p className="font-medium text-green-700">{file.name}</p>
                <p className="text-sm text-green-600">
                  {(file.size / 1024).toFixed(0)} KB — click para cambiar
                </p>
              </>
            ) : (
              <>
                <p className="text-gray-500">Click para subir una imagen</p>
                <p className="mt-1 text-xs text-gray-400">JPG, PNG, SVG — max 20MB</p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.svg"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleAdvance}
        disabled={!canAdvance || uploading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white disabled:opacity-40 hover:bg-blue-700"
      >
        {uploading ? 'Subiendo...' : 'Continuar al analisis'}
      </button>
    </div>
  )
}

// ─── Ingestion phase: AI analyzes image and generates brief ───────

function IngestionPhase({ project, onAdvance }: { project: Project; onAdvance: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [brief, setBrief] = useState<{
    brief: string
    elements_to_keep: string[]
    elements_to_discard: string[]
    estimated_thread_colors: number
    image_quality: string
    warnings: string[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)

  async function analyze() {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/pipeline/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: project.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Error al analizar la imagen')
      setLoading(false)
      return
    }
    setBrief(data.analysis)
    setLoading(false)
  }

  async function approveBrief() {
    setApproving(true)
    const supabase = createClient()

    // Mark brief as approved
    await supabase
      .from('briefs')
      .update({ approved: true })
      .eq('project_id', project.id)

    // Advance to extraction phase
    await supabase
      .from('projects')
      .update({ current_phase: 'extraction' })
      .eq('id', project.id)

    router.refresh()
    onAdvance()
  }

  return (
    <div className="space-y-5">
      {!brief && !loading && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            GPT-4o va a analizar tu imagen y generar un resumen de lo que entendio.
            Podras corregirlo antes de continuar.
          </p>
          <button
            onClick={analyze}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
          >
            Analizar imagen con IA
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm">Analizando tu imagen con GPT-4o...</p>
        </div>
      )}

      {error && (
        <div className="space-y-3">
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
          <button onClick={analyze} className="text-sm text-blue-600 hover:underline">
            Intentar de nuevo
          </button>
        </div>
      )}

      {brief && (
        <div className="space-y-4">
          {/* Brief */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-500">
              Lo que entendi
            </p>
            <p className="text-sm text-blue-900">{brief.brief}</p>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1 text-xs text-gray-400">Mantener</p>
              <ul className="space-y-0.5">
                {brief.elements_to_keep.map((e, i) => (
                  <li key={i} className="text-gray-700">• {e}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1 text-xs text-gray-400">Descartar</p>
              <ul className="space-y-0.5">
                {brief.elements_to_discard.map((e, i) => (
                  <li key={i} className="text-gray-700">• {e}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>Colores estimados: <strong>{brief.estimated_thread_colors}</strong></span>
            <span>Calidad: <strong>{brief.image_quality}</strong></span>
          </div>

          {brief.warnings?.length > 0 && (
            <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
              {brief.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={analyze}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50"
            >
              Re-analizar
            </button>
            <button
              onClick={approveBrief}
              disabled={approving}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-green-700"
            >
              {approving ? 'Aprobando...' : 'Si, es correcto →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Preparation phase: AI assigns stitch types ───────────────────

function PreparationPhase({ project, onAdvance }: { project: Project; onAdvance: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [params, setParams] = useState<{
    regions: { name: string; stitch_type: string; density: number; color_name: string; color_hex: string; angle?: number; underlay?: boolean }[]
    thread_colors: { index: number; name: string; hex: string }[]
    total_stitches_estimate: number
    width_mm: number
    height_mm: number
    notes: string
  } | null>(null)

  async function prepare() {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/pipeline/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: project.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Error al preparar el diseno')
      setLoading(false)
      return
    }
    setParams(data.params)
    setLoading(false)
  }

  function goToPreview() {
    router.refresh()
    onAdvance()
  }

  return (
    <div className="space-y-5">
      {!params && !loading && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            GPT-4o va a analizar tu diseno y asignar los tipos de puntada y colores de hilo a cada region.
          </p>
          <button
            onClick={prepare}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
          >
            Preparar para bordado
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm">Asignando puntadas con GPT-4o...</p>
        </div>
      )}

      {error && (
        <div className="space-y-3">
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
          <button onClick={prepare} className="text-sm text-blue-600 hover:underline">Intentar de nuevo</button>
        </div>
      )}

      {params && (
        <div className="space-y-4">
          <div className="rounded-lg bg-green-50 p-3 text-sm font-medium text-green-800">
            GPT-4o asigno {(params.regions ?? []).length} regiones de puntada
          </div>

          {/* Regions table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Region</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Color</th>
                  <th className="px-3 py-2">Densidad</th>
                  <th className="px-3 py-2">Angulo</th>
                  <th className="px-3 py-2">Underlay</th>
                </tr>
              </thead>
              <tbody>
                {(params.regions ?? []).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                        r.stitch_type === 'tatami' ? 'bg-blue-100 text-blue-700' :
                        r.stitch_type === 'satin' ? 'bg-purple-100 text-purple-700' :
                        r.stitch_type === 'running' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {r.stitch_type}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: r.color_hex }} />
                        {r.color_name}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.density} st/mm</td>
                    <td className="px-3 py-2">{r.angle ?? 0}°</td>
                    <td className="px-3 py-2">{r.underlay ? 'Si' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Thread colors */}
          <div className="flex flex-wrap gap-2">
            {(params.thread_colors ?? []).map((tc, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tc.hex }} />
                {tc.name}
              </span>
            ))}
          </div>

          {/* Stats */}
          <div className="flex gap-4 text-xs text-gray-500">
            <span>Puntadas estimadas: <strong className="text-gray-700">{params.total_stitches_estimate?.toLocaleString()}</strong></span>
            <span>Dimensiones: <strong className="text-gray-700">{params.width_mm}×{params.height_mm}mm</strong></span>
          </div>

          {params.notes && (
            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              <span className="font-medium">Nota IA:</span> {params.notes}
            </div>
          )}

          <button
            onClick={goToPreview}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
          >
            Ver vista previa →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Generation phase ─────────────────────────────────────────────

interface DebugInfo {
  mask_method: string
  image_info: string
  regions: { name: string; hex: string; pixels: number; pct: number }[]
  total_stitches: number
  log_lines: string[]
}

function GenerationPhase({ project, onAdvance }: { project: Project; onAdvance: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    download_url: string
    format: string
    size_bytes: number
    summary: { total_stitches: number; colors: number; dimensions: string }
    debug: DebugInfo
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)

  async function generate() {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/pipeline/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: project.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Error al generar el archivo')
      setLoading(false)
      return
    }
    setResult(data)
    setLoading(false)
  }

  function goToDelivery() {
    router.refresh()
    onAdvance()
  }

  const maskBadge = (method: string) => {
    if (method === 'alpha') return { label: 'Canal alfa', color: 'bg-green-100 text-green-700' }
    if (method === 'edge') return { label: 'Deteccion de bordes', color: 'bg-yellow-100 text-yellow-700' }
    if (method === 'brightness') return { label: 'Brillo (fallback)', color: 'bg-orange-100 text-orange-700' }
    return { label: method, color: 'bg-gray-100 text-gray-700' }
  }

  return (
    <div className="space-y-5">
      {!result && !loading && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Se generara el archivo de bordado real (.{project.export_format}) usando pyembroidery.
          </p>
          <button
            onClick={generate}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
          >
            Generar archivo
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm">Generando tu archivo de bordado...</p>
        </div>
      )}

      {error && (
        <div className="space-y-3">
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
          <button onClick={generate} className="text-sm text-blue-600 hover:underline">Intentar de nuevo</button>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-lg bg-green-50 p-4">
            <p className="font-medium text-green-800">Archivo generado exitosamente</p>
            <p className="mt-1 text-sm text-green-700">
              {result.format} · {(result.size_bytes / 1024).toFixed(1)} KB · {result.summary.total_stitches.toLocaleString()} puntadas · {result.summary.colors} colores · {result.summary.dimensions}
            </p>
          </div>

          {/* Debug report */}
          {result.debug && (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Reporte de generacion</p>

              {/* Mask method */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Metodo de mascara:</span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${maskBadge(result.debug.mask_method).color}`}>
                  {maskBadge(result.debug.mask_method).label}
                </span>
              </div>

              {result.debug.image_info && (
                <p className="text-xs text-gray-500">Imagen: {result.debug.image_info}</p>
              )}

              {/* Region breakdown */}
              {result.debug.regions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500">Pixeles por region:</p>
                  {result.debug.regions.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: r.hex }} />
                      <span className="w-32 truncate font-medium">{r.name}</span>
                      <div className="flex-1 rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-blue-400"
                          style={{ width: `${Math.max(r.pct, 2)}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-gray-500">{r.pixels.toLocaleString()} px ({r.pct}%)</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Stitch count check */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Puntadas reales:</span>
                <span className={`font-medium ${
                  result.debug.total_stitches < 100 ? 'text-red-600' :
                  result.debug.total_stitches < 1000 ? 'text-yellow-600' :
                  'text-green-600'
                }`}>
                  {result.debug.total_stitches.toLocaleString()}
                </span>
                {result.debug.total_stitches < 100 && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">Posible error: muy pocas puntadas</span>
                )}
              </div>

              {/* Collapsible raw log */}
              <button
                onClick={() => setShowLog(!showLog)}
                className="text-xs text-blue-600 hover:underline"
              >
                {showLog ? 'Ocultar log completo ▲' : 'Ver log completo ▼'}
              </button>
              {showLog && (
                <pre className="max-h-48 overflow-auto rounded bg-gray-900 p-3 text-xs text-green-400">
                  {result.debug.log_lines.join('\n')}
                </pre>
              )}
            </div>
          )}

          <button
            onClick={goToDelivery}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
          >
            Continuar a descarga →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Extraction phase ─────────────────────────────────────────────

function ExtractionPhase({ project, onAdvance }: { project: Project; onAdvance: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function skipExtraction() {
    setLoading(true)
    const supabase = createClient()

    // Copy original file record as "extracted" so downstream phases can find it
    const { data: original } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', project.id)
      .eq('file_type', 'original')
      .single()

    if (original) {
      await supabase.from('project_files').insert({
        project_id: project.id,
        phase: 'extraction',
        file_type: 'extracted',
        storage_path: original.storage_path,
        mime_type: original.mime_type,
        metadata: { skipped_extraction: true },
      })
    }

    await supabase
      .from('projects')
      .update({ current_phase: 'preparation' })
      .eq('id', project.id)

    router.refresh()
    onAdvance()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-800">Tu imagen tiene fondo limpio</p>
        <p className="mt-1">
          No es necesario usar SAM para extraer el elemento. Puedes continuar
          directo a la vectorizacion con la imagen original.
        </p>
      </div>
      <button
        onClick={skipExtraction}
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white disabled:opacity-40 hover:bg-blue-700"
      >
        {loading ? 'Continuando...' : 'Continuar a vectorizacion →'}
      </button>
    </div>
  )
}

// ─── Delivery phase ────────────────────────────────────────────────

function DeliveryPhase({ project }: { project: Project }) {
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/pipeline/download?project_id=${project.id}`)
      const data = await res.json()
      if (data.url) {
        const a = document.createElement('a')
        a.href = data.url
        a.download = `${project.name}.${project.export_format.toLowerCase()}`
        a.click()
      }
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-green-50 p-4">
        <p className="font-medium text-green-800">Diseno completado!</p>
        <p className="mt-1 text-sm text-green-700">
          Maquina: {project.machine_brand} · Formato: {project.export_format}
        </p>
      </div>

      <button
        onClick={handleDownload}
        disabled={downloading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 font-medium text-white disabled:opacity-60 hover:bg-green-700"
      >
        {downloading ? 'Preparando descarga...' : 'Descargar archivo de bordado'}
      </button>
    </div>
  )
}

// ─── Simulate & Diagnose Panel ────────────────────────────────────

interface SimStep {
  phase: string
  ok: boolean
  duration_ms: number
  output: Record<string, unknown>
  error?: string
}

interface DiagnosePhase {
  phase: string
  status: string
  details: Record<string, unknown>
}

function SimulateAndDiagnosePanel({ project, onComplete }: { project: Project; onComplete: () => void }) {
  const [simulating, setSimulating] = useState(false)
  const [simResult, setSimResult] = useState<{
    success: boolean
    steps: SimStep[]
    total_duration_ms: number
    final_download_url?: string
    summary?: Record<string, unknown>
    stopped_at?: string
  } | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnosis, setDiagnosis] = useState<{
    project: Record<string, string>
    phases: DiagnosePhase[]
    problems: string[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runSimulation() {
    setSimulating(true)
    setError(null)
    setSimResult(null)
    try {
      const res = await fetch('/api/pipeline/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id }),
      })
      const data = await res.json()
      if (!res.ok && !data.steps) {
        setError(data.error ?? 'Error de simulacion')
      } else {
        setSimResult(data)
        if (data.success) onComplete()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    }
    setSimulating(false)
  }

  async function runDiagnosis() {
    setDiagnosing(true)
    setError(null)
    setDiagnosis(null)
    try {
      const res = await fetch(`/api/pipeline/diagnose?project_id=${project.id}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error de diagnostico')
      } else {
        setDiagnosis(data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    }
    setDiagnosing(false)
  }

  const phaseLabel: Record<string, string> = {
    analyze: 'Analisis',
    approve: 'Aprobacion',
    extract: 'Extraccion',
    prepare: 'Preparacion',
    generate: 'Generacion',
    onboarding: 'Onboarding',
    ingestion: 'Ingestion',
    extraction: 'Extraccion',
    preparation: 'Preparacion',
    generation: 'Generacion',
  }

  return (
    <div className="space-y-4 rounded-xl border border-dashed border-gray-300 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Herramientas de diagnostico</p>

      <div className="flex gap-2">
        <button
          onClick={runSimulation}
          disabled={simulating || diagnosing}
          className="flex-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 disabled:opacity-40 hover:bg-purple-100"
        >
          {simulating ? 'Simulando...' : 'Simular pipeline completo'}
        </button>
        <button
          onClick={runDiagnosis}
          disabled={simulating || diagnosing}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
        >
          {diagnosing ? 'Diagnosticando...' : 'Diagnosticar proyecto'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Simulation results */}
      {simResult && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">
            Simulacion {simResult.success ? 'completada' : 'fallida'} en {(simResult.total_duration_ms / 1000).toFixed(1)}s
          </p>
          {simResult.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs text-white ${step.ok ? 'bg-green-500' : 'bg-red-500'}`}>
                {step.ok ? '✓' : '✗'}
              </span>
              <span className="w-24 font-medium">{phaseLabel[step.phase] ?? step.phase}</span>
              <span className="text-xs text-gray-400">({(step.duration_ms / 1000).toFixed(1)}s)</span>
              {step.ok && step.output && (
                <span className="text-xs text-gray-500">
                  {step.phase === 'analyze' && `calidad: ${(step.output.analysis as Record<string, string>)?.image_quality ?? '?'}, colores: ${(step.output.analysis as Record<string, number>)?.estimated_thread_colors ?? '?'}`}
                  {step.phase === 'prepare' && `${(step.output.params as Record<string, unknown[]>)?.regions?.length ?? 0} regiones`}
                  {step.phase === 'generate' && `${(step.output.debug as Record<string, number>)?.total_stitches ?? 0} puntadas, mascara: ${(step.output.debug as Record<string, string>)?.mask_method ?? '?'}`}
                </span>
              )}
              {!step.ok && step.error && (
                <span className="text-xs text-red-600">{step.error}</span>
              )}
            </div>
          ))}
          {simResult.final_download_url && (
            <a
              href={simResult.final_download_url}
              download={`${project.name}.${project.export_format.toLowerCase()}`}
              className="mt-2 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Descargar archivo generado
            </a>
          )}
        </div>
      )}

      {/* Diagnosis results */}
      {diagnosis && (
        <div className="space-y-3">
          {/* Problems */}
          {diagnosis.problems.length > 0 && (
            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-xs font-medium text-red-700">Problemas detectados:</p>
              {diagnosis.problems.map((p, i) => (
                <p key={i} className="mt-1 text-xs text-red-600">• {p}</p>
              ))}
            </div>
          )}
          {diagnosis.problems.length === 0 && (
            <div className="rounded-lg bg-green-50 p-3 text-xs font-medium text-green-700">
              Sin problemas detectados
            </div>
          )}

          {/* Phase breakdown */}
          {diagnosis.phases.map((phase, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${
                  phase.status === 'complete' ? 'bg-green-500' :
                  phase.status === 'missing' ? 'bg-red-500' :
                  'bg-gray-300'
                }`} />
                <span className="text-sm font-medium">{phaseLabel[phase.phase] ?? phase.phase}</span>
                <span className="text-xs text-gray-400">({phase.status})</span>
              </div>
              {phase.details && (
                <pre className="mt-1 max-h-24 overflow-auto text-xs text-gray-500">
                  {JSON.stringify(phase.details, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
