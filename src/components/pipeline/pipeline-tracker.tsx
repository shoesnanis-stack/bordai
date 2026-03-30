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
    regions: { name: string; stitch_type: string; density: number; color_name: string; color_hex: string }[]
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
        <div className="space-y-3">
          <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
            Preparacion completa — avanzando a la vista previa...
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Generation phase ─────────────────────────────────────────────

function GenerationPhase({ project, onAdvance }: { project: Project; onAdvance: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    download_url: string
    format: string
    summary: { total_stitches: number; colors: number; dimensions: string }
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    router.refresh()
    onAdvance()
  }

  return (
    <div className="space-y-5">
      {!result && !loading && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Se generara el paquete de parametros de bordado con todos los datos de tu diseno.
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
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
          Listo — avanzando a entrega...
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
        <p className="font-medium text-green-800">¡Diseno completado!</p>
        <p className="mt-1 text-sm text-green-700">
          Maquina: {project.machine_brand} · Formato: {project.export_format}
        </p>
      </div>

      <button
        onClick={handleDownload}
        disabled={downloading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 font-medium text-white disabled:opacity-60 hover:bg-green-700"
      >
        {downloading ? 'Preparando descarga...' : 'Descargar parametros de bordado'}
      </button>

      <div className="rounded-lg bg-yellow-50 p-3 text-xs text-yellow-800">
        <p className="font-medium">Proximo paso: archivo {project.export_format} real</p>
        <p className="mt-1">
          Para generar el archivo binario listo para tu maquina, ejecuta{' '}
          <code className="rounded bg-yellow-100 px-1">npm run workers:up</code> y vuelve a este proyecto.
        </p>
      </div>
    </div>
  )
}
