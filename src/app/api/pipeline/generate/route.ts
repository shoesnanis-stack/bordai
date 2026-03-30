import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { HOOP_SIZES } from '@/lib/constants'
import type { HoopSize } from '@/types'
import { spawn } from 'child_process'
import { writeFile, readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

interface GeneratorResult {
  buffer: Buffer
  debugLog: string
}

function runPythonGenerator(params: object, fmt: string): Promise<GeneratorResult> {
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
        resolve({ buffer: fileBuffer, debugLog: stderr })
      } catch (e) {
        reject(new Error(`Failed to read output: ${stderr}`))
      }
    })
  })
}

function parseDebugLog(raw: string) {
  const lines = raw.split('\n').filter(l => l.trim())
  let maskMethod = 'unknown'
  const regions: { name: string; hex: string; pixels: number; pct: number }[] = []
  let totalStitches = 0
  let imageInfo = ''

  for (const line of lines) {
    if (line.includes('[MASK]')) {
      if (line.includes('alpha')) maskMethod = 'alpha'
      else if (line.includes('Edge-based')) maskMethod = 'edge'
      else if (line.includes('Fallback')) maskMethod = 'brightness'
      else if (line.includes('Detected background')) maskMethod = 'edge'
    }
    if (line.includes('[COLOR]')) {
      const m = line.match(/Region '(.+?)' \((.+?)\): (\d+) px \((\d+)%\)/)
      if (m) regions.push({ name: m[1], hex: m[2], pixels: parseInt(m[3]), pct: parseInt(m[4]) })
    }
    if (line.includes('[DONE]')) {
      const m = line.match(/(\d+) stitches/)
      if (m) totalStitches = parseInt(m[1])
    }
    if (line.includes('[IMG]')) {
      imageInfo = line.replace(/.*\[IMG\]\s*/, '')
    }
  }

  return { maskMethod, regions, totalStitches, imageInfo, logLines: lines }
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

  // Download image from Supabase storage to a temp file for Python
  const { data: originalFile } = await admin
    .from('project_files')
    .select('storage_path')
    .eq('project_id', project_id)
    .eq('file_type', 'original')
    .single()

  let imagePath: string | undefined
  let imageUrl: string | undefined

  if (originalFile) {
    // Method 1: Direct download to temp file (most reliable)
    try {
      const { data: blob, error: dlError } = await admin.storage
        .from('project-files')
        .download(originalFile.storage_path)

      if (blob && !dlError) {
        imagePath = join(tmpdir(), `bordai_img_${Date.now()}.png`)
        const imgBuffer = Buffer.from(await blob.arrayBuffer())
        await writeFile(imagePath, imgBuffer)
        console.log(`[GENERATE] Image saved to temp: ${imagePath} (${imgBuffer.length} bytes)`)
      } else {
        console.error('[GENERATE] Storage download failed:', dlError?.message ?? 'no data')
      }
    } catch (err) {
      console.error('[GENERATE] Download error:', err instanceof Error ? err.message : err)
    }

    // Method 2: Signed URL as fallback
    if (!imagePath) {
      const { data: signed, error: signedError } = await admin.storage
        .from('project-files')
        .createSignedUrl(originalFile.storage_path, 300)

      if (signedError) {
        console.error('[GENERATE] Signed URL failed:', signedError.message)
      }
      imageUrl = signed?.signedUrl
    }
  } else {
    console.error('[GENERATE] No original file found for project', project_id)
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
    image_path: imagePath ?? null,
    image_url: imageUrl ?? null,
  }

  // Generate real embroidery file with pyembroidery
  let fileBuffer: Buffer
  let debugLog = ''
  try {
    const result = await runPythonGenerator(embroideryParams, project.export_format)
    fileBuffer = result.buffer
    debugLog = result.debugLog
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'File generation failed: ' + message }, { status: 500 })
  }

  // Clean up temp image file
  if (imagePath) {
    await unlink(imagePath).catch(() => {})
  }

  const debug = parseDebugLog(debugLog)

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
      debug_mask_method: debug.maskMethod,
      debug_total_stitches: debug.totalStitches,
      debug_regions: debug.regions,
      debug_log: debug.logLines,
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
      total_stitches: debug.totalStitches || (digitization.total_stitches_estimate ?? 0),
      colors: digitization.thread_colors?.length ?? 0,
      dimensions: `${digitization.width_mm ?? 0}×${digitization.height_mm ?? 0}mm`,
    },
    debug: {
      mask_method: debug.maskMethod,
      image_info: debug.imageInfo,
      regions: debug.regions,
      total_stitches: debug.totalStitches,
      log_lines: debug.logLines,
    },
  })
}
