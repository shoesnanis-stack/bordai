import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PreviewViewer } from '@/components/preview/preview-viewer'

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: files } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', id)

  // Get signed URL for the original image to display
  const originalFile = files?.find((f) => f.file_type === 'original')
  let imageUrl: string | null = null
  if (originalFile) {
    const { data } = await supabase.storage
      .from('project-files')
      .createSignedUrl(originalFile.storage_path, 3600)
    imageUrl = data?.signedUrl ?? null
  }

  // Get digitization params from the vectorized file metadata
  const vectorized = files?.find((f) => f.file_type === 'vectorized')
  const digitizationParams = vectorized?.metadata ?? null

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Vista previa del bordado</h1>
      <p className="mb-6 text-sm text-gray-500">{project.name}</p>
      <PreviewViewer
        project={project}
        imageUrl={imageUrl}
        digitizationParams={digitizationParams}
      />
    </div>
  )
}
