import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { HOOP_SIZES } from '@/lib/constants'
import type { HoopSize } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { project_id } = await request.json()

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', project_id)
    .eq('user_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Get the extracted (or original) image
  const { data: file } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', project_id)
    .eq('file_type', 'extracted')
    .single()

  if (!file) return NextResponse.json({ error: 'No extracted image found' }, { status: 404 })

  const { data: signedUrl } = await supabase.storage
    .from('project-files')
    .createSignedUrl(file.storage_path, 60)

  if (!signedUrl) return NextResponse.json({ error: 'Could not access image' }, { status: 500 })

  const hoop = HOOP_SIZES[project.hoop_size as HoopSize]

  // Ask GPT-4o to analyze and assign stitch types
  const prompt = `Eres un experto digitalizador de bordado. Analiza este diseño y genera los parametros de digitalizacion.

Configuracion:
- Superficie: ${project.surface}
- Aro: ${project.hoop_size} (${hoop.width}x${hoop.height}mm)
- Maquina: ${project.machine_brand}

Responde UNICAMENTE con JSON en este formato exacto:
{
  "regions": [
    {
      "name": "nombre del region (ej: texto principal)",
      "stitch_type": "satin" | "tatami" | "running" | "triple",
      "density": 5,
      "angle": 45,
      "underlay": true,
      "color_hex": "#000000",
      "color_name": "Negro"
    }
  ],
  "thread_colors": [
    { "index": 1, "name": "Negro", "hex": "#000000", "code": "1000" }
  ],
  "total_stitches_estimate": 8000,
  "width_mm": 80,
  "height_mm": 40,
  "notes": "observacion breve sobre el diseno"
}

Reglas de digitalizacion:
- Textos y bordes finos: stitch_type = "satin"
- Rellenos grandes (>10mm): stitch_type = "tatami"
- Contornos y lineas: stitch_type = "running"
- density entre 4 y 6 para la mayoria de regiones
- underlay = true en todas las regiones excepto running
- Las dimensiones deben caber dentro del aro ${hoop.width}x${hoop.height}mm

IMPORTANTE — Reglas de color y angulo:
- color_hex DEBE coincidir con el color REAL de los pixeles en la imagen, no un color idealizado. Ejemplo: si los pixeles del texto son #1A1A1A, usa ese valor, no #000000.
- Cada region debe tener un color_hex distinto que exista visiblemente en la imagen.
- Varia el angulo de relleno entre regiones para mejor cobertura (ej: 45 para una, 135 para otra, 0 para otra).
- Ordena las regiones asi: 1) rellenos grandes (tatami), 2) detalles (satin), 3) contornos (running).
- thread_colors debe contener exactamente los mismos colores que las regiones, en el orden de costura.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: signedUrl.signedUrl, detail: 'high' } },
        ],
      },
    ],
    max_tokens: 1000,
  })

  let params
  try {
    const raw = response.choices[0].message.content ?? '{}'
    const json = raw.replace(/```json\n?|\n?```/g, '').trim()
    params = JSON.parse(json)
  } catch {
    return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
  }

  // Save digitization params as a project file record (metadata only)
  await supabase.from('project_files').insert({
    project_id,
    phase: 'preparation',
    file_type: 'vectorized',
    storage_path: file.storage_path, // reuse image path, params are in metadata
    mime_type: 'application/json',
    metadata: params,
  })

  // Advance to preview
  await supabase
    .from('projects')
    .update({ current_phase: 'preview' })
    .eq('id', project_id)

  return NextResponse.json({ params })
}
