import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { project_id } = await request.json()

  // Get project
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', project_id)
    .eq('user_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Get original image from storage
  const { data: files } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', project_id)
    .eq('file_type', 'original')
    .single()

  if (!files) return NextResponse.json({ error: 'No image found' }, { status: 404 })

  // Get signed URL for the image
  const { data: signedUrl } = await supabase.storage
    .from('project-files')
    .createSignedUrl(files.storage_path, 60)

  if (!signedUrl) return NextResponse.json({ error: 'Could not access image' }, { status: 500 })

  // Call GPT-4o Vision
  const prompt = `Eres un experto en bordado industrial. Analiza esta imagen que un cliente quiere convertir en un diseño de bordado para una ${project.surface}.

Configuración del proyecto:
- Superficie: ${project.surface}
- Tamaño del aro: ${project.hoop_size}
- Máquina: ${project.machine_brand}

Responde ÚNICAMENTE con un JSON con esta estructura exacta:
{
  "brief": "Descripción en lenguaje simple de lo que entendiste (1-2 oraciones, dirigida al cliente)",
  "elements_to_keep": ["elemento1", "elemento2"],
  "elements_to_discard": ["fondo", "etc"],
  "elements_to_add": [],
  "estimated_thread_colors": 3,
  "image_quality": "good" | "poor" | "unusable",
  "complexity": "simple" | "medium" | "complex",
  "warnings": []
}`

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
    max_tokens: 500,
  })

  let analysis
  try {
    const raw = response.choices[0].message.content ?? '{}'
    const json = raw.replace(/```json\n?|\n?```/g, '').trim()
    analysis = JSON.parse(json)
  } catch {
    return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
  }

  // Save brief to DB
  const { data: brief, error: briefError } = await supabase
    .from('briefs')
    .insert({
      project_id,
      version: 1,
      content: analysis.brief,
      intent: {
        elements_to_keep: analysis.elements_to_keep ?? [],
        elements_to_discard: analysis.elements_to_discard ?? [],
        elements_to_add: analysis.elements_to_add ?? [],
        estimated_thread_colors: analysis.estimated_thread_colors ?? 3,
        image_quality: analysis.image_quality ?? 'good',
        complexity: analysis.complexity ?? 'medium',
      },
      approved: false,
    })
    .select()
    .single()

  if (briefError) return NextResponse.json({ error: briefError.message }, { status: 500 })

  // Advance project to next phase (needs client approval)
  await supabase
    .from('projects')
    .update({ current_phase: 'ingestion' })
    .eq('id', project_id)

  return NextResponse.json({ brief_id: brief.id, analysis })
}
