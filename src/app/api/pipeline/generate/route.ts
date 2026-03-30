import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { HOOP_SIZES } from '@/lib/constants'
import type { HoopSize } from '@/types'
import { spawn } from 'child_process'
import { writeFile, readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

function runPythonGenerator(params: object, fmt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const outputPath = join(tmpdir(), `bordai_${Date.now()}.${fmt.toLowerCase()}`)
    const pythonExe = process.platform === 'win32' ? 'python' : 'python3'
    const scriptPath = join(process.cwd(), 'workers', 'scripts', 'generate_embroidery.py')

    const proc = spawn(pythonExe, [scriptPath, fmt, outputPath])

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d))
    proc.stderr.on('data', (d) => (stderr += d))

    // Send params via stdin
    proc.stdin.write(JSON.stringify(params))
    proc.stdin.end()

    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`Python error: ${stderr || stdout}`))
        return
      }
      try {
        const result = JSON.parse(stdout.trim())
        if (!result.success) {
          reject(new Error(result.error))
          return
        }
        const fileBuffer = await readFile(outputPath)
        await unlink(outputPath).catch(() => {})
        resolve(fileBuffer)
      } catch (e) {
        reject(new Error(`Failed to read output: ${stderr}`))
      }
    })
  })
}

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

  const admin = createAdminClient()

  const { data: vectorized } = await admin
    .from('project_files')
    .select('*')
    .eq('project_id', project_id)
    .eq('file_type', 'vectorized')
    .single()

  const { data: brief } = await admin
    .from('briefs')
    .select('*')
    .eq('project_id', project_id)
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const hoop = HOOP_SIZES[project.hoop_size as HoopSize]
  const digitization = vectorized?.metadata ?? {}

  // Get signed URL for the original image so Python can download it
  const { data: originalFile } = await admin
    .from('project_files')
    .select('storage_path')
    .eq('project_id', project_id)
    .eq('file_type', 'original')
    .single()

  let imageUrl: string | undefined
  if (originalFile) {
    const { data: signed } = await admin.storage
      .from('project-files')
      .createSignedUrl(originalFile.storage_path, 300) // 5 min for Python to download
    imageUrl = signed?.signedUrl
  }

  const embroideryParams = {
    meta: {
      project_name: project.name,
      machine: project.machine_brand,
      format: project.export_format,
      surface: project.surface,
      hoop_size: project.hoop_size,
      hoop_mm: `${hoop?.width ?? 0}x${hoop?.height ?? 0}mm`,
    },
    brief: { content: brief?.content ?? '', intent: brief?.intent ?? {} },
    digitization,
    image_url: imageUrl,
  }

  // Generate real embroidery file with pyembroidery
  let fileBuffer: Buffer
  try {
    fileBuffer = await runPythonGenerator(embroideryParams, project.export_format)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'File generation failed: ' + message }, { status: 500 })
  }

  const fmt = project.export_format.toLowerCase()
  const storagePath = `${user.id}/${project_id}/generation/design.${fmt}`

  // Delete previous version if exists
  await admin.storage.from('project-files').remove([storagePath])

  const { error: uploadError } = await admin.storage
    .from('project-files')
    .upload(storagePath, fileBuffer, {
      contentType: 'application/octet-stream',
    })

  if (uploadError) {
    return NextResponse.json({ error: 'Storage error: ' + uploadError.message }, { status: 500 })
  }

  // Remove previous record
  await admin.from('project_files').delete()
    .eq('project_id', project_id).eq('file_type', 'embroidery')

  await admin.from('project_files').insert({
    project_id,
    phase: 'generation',
    file_type: 'embroidery',
    storage_path: storagePath,
    mime_type: 'application/octet-stream',
    metadata: {
      format: project.export_format,
      size_bytes: fileBuffer.length,
      status: 'generated',
    },
  })

  await admin.from('projects')
    .update({ current_phase: 'delivery', status: 'completed' })
    .eq('id', project_id)

  const { data: signedUrl } = await admin.storage
    .from('project-files')
    .createSignedUrl(storagePath, 3600)

  return NextResponse.json({
    download_url: signedUrl?.signedUrl,
    format: project.export_format,
    size_bytes: fileBuffer.length,
    summary: {
      total_stitches: digitization.total_stitches_estimate ?? 0,
      colors: digitization.thread_colors?.length ?? 0,
      dimensions: `${digitization.width_mm ?? 0}×${digitization.height_mm ?? 0}mm`,
    },
  })
}
