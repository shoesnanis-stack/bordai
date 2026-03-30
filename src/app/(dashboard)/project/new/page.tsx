'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SURFACE_OPTIONS, HOOP_SIZES, MACHINE_FORMATS } from '@/lib/constants'
import type { ProjectType, Surface, HoopSize, MachineBrand } from '@/types'

type Step = 1 | 2 | 3 | 4

const PROJECT_TYPES: { value: ProjectType; label: string; description: string }[] = [
  { value: 'upload_image', label: 'Subir mi imagen / logo', description: 'Tengo una foto o imagen que quiero bordar' },
  { value: 'text_only', label: 'Solo texto o nombre', description: 'Quiero bordar un nombre, frase o empresa' },
  { value: 'ready_design', label: 'Tengo un diseño listo', description: 'Ya tengo un archivo vectorial o PNG limpio' },
  { value: 'from_scratch', label: 'Crear desde cero', description: 'Describe lo que quieres y la IA lo genera' },
]

const MACHINES: { value: MachineBrand; label: string }[] = [
  { value: 'brother', label: 'Brother → .PES' },
  { value: 'janome', label: 'Janome → .JEF' },
  { value: 'bernina', label: 'Bernina → .EXP' },
  { value: 'tajima', label: 'Tajima → .DST' },
  { value: 'barudan', label: 'Barudan → .DST' },
  { value: 'pfaff', label: 'Pfaff → .VIP' },
  { value: 'husqvarna', label: 'Husqvarna → .HUS' },
  { value: 'unknown', label: 'No se / Otra → .DST' },
]

export default function NewProjectPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [type, setType] = useState<ProjectType | null>(null)
  const [surface, setSurface] = useState<Surface | null>(null)
  const [hoopSize, setHoopSize] = useState<HoopSize | null>(null)
  const [machine, setMachine] = useState<MachineBrand | null>(null)

  async function handleCreate() {
    if (!type || !surface || !hoopSize || !machine || !name.trim()) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        name: name.trim(),
        type,
        surface,
        hoop_size: hoopSize,
        machine_brand: machine,
        export_format: MACHINE_FORMATS[machine],
        current_phase: 'onboarding',
        status: 'draft',
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(`/project/${data.id}`)
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="mb-2 flex justify-between text-xs text-gray-400">
          <span>Paso {step} de 4</span>
          <span>{Math.round((step / 4) * 100)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-100">
          <div
            className="h-1.5 rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Step 1 — Nombre y tipo */}
      {step === 1 && (
        <div>
          <h1 className="mb-1 text-2xl font-bold">Nuevo proyecto</h1>
          <p className="mb-6 text-gray-500">¿Cómo se llama y qué quieres bordar?</p>

          <div className="mb-6">
            <label className="mb-1.5 block text-sm font-medium">Nombre del proyecto</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Logo empresa Transportes Pérez"
              className="w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mb-8">
            <label className="mb-1.5 block text-sm font-medium">¿Qué tienes para empezar?</label>
            <div className="grid gap-3">
              {PROJECT_TYPES.map((pt) => (
                <button
                  key={pt.value}
                  onClick={() => setType(pt.value)}
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                    type === pt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div
                    className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                      type === pt.value ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}
                  />
                  <div>
                    <p className="font-medium">{pt.label}</p>
                    <p className="text-sm text-gray-500">{pt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!name.trim() || !type}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white disabled:opacity-40 hover:bg-blue-700"
          >
            Continuar
          </button>
        </div>
      )}

      {/* Step 2 — Superficie */}
      {step === 2 && (
        <div>
          <h1 className="mb-1 text-2xl font-bold">Superficie de bordado</h1>
          <p className="mb-6 text-gray-500">¿Dónde vas a bordar el diseño?</p>

          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SURFACE_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSurface(s.value)}
                className={`rounded-lg border p-4 text-center transition-colors ${
                  surface === s.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <p className="font-medium">{s.label}</p>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 rounded-lg border px-4 py-2.5 font-medium hover:bg-gray-50"
            >
              Atrás
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!surface}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white disabled:opacity-40 hover:bg-blue-700"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Tamaño del aro */}
      {step === 3 && (
        <div>
          <h1 className="mb-1 text-2xl font-bold">Tamaño del aro</h1>
          <p className="mb-6 text-gray-500">
            El aro define el tamaño máximo de tu diseño. Si no sabes, elige 4×4.
          </p>

          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            {(Object.entries(HOOP_SIZES) as [HoopSize, { width: number; height: number; label: string }][]).map(
              ([size, info]) => (
                <button
                  key={size}
                  onClick={() => setHoopSize(size)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    hoopSize === size
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-semibold">{info.label}</p>
                  <p className="text-sm text-gray-500">
                    {info.width} × {info.height} mm
                  </p>
                </button>
              )
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="flex-1 rounded-lg border px-4 py-2.5 font-medium hover:bg-gray-50"
            >
              Atrás
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!hoopSize}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white disabled:opacity-40 hover:bg-blue-700"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Máquina */}
      {step === 4 && (
        <div>
          <h1 className="mb-1 text-2xl font-bold">Tu máquina</h1>
          <p className="mb-6 text-gray-500">
            Esto define el formato del archivo final. Si no sabes la marca, elige "No sé".
          </p>

          <div className="mb-8 grid gap-2.5">
            {MACHINES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMachine(m.value)}
                className={`rounded-lg border px-4 py-3 text-left font-medium transition-colors ${
                  machine === m.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(3)}
              className="flex-1 rounded-lg border px-4 py-2.5 font-medium hover:bg-gray-50"
            >
              Atrás
            </button>
            <button
              onClick={handleCreate}
              disabled={!machine || loading}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white disabled:opacity-40 hover:bg-blue-700"
            >
              {loading ? 'Creando...' : 'Crear proyecto'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
