import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis proyectos</h1>
        <Link href="/project/new">
          <Button>Nuevo proyecto</Button>
        </Link>
      </div>

      {!projects?.length ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-gray-500">No tienes proyectos aún.</p>
          <p className="mt-1 text-sm text-gray-400">
            Crea tu primer diseño de bordado con IA.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/project/${project.id}`}
              className="rounded-lg border p-4 transition-shadow hover:shadow-md"
            >
              <h3 className="font-medium">{project.name}</h3>
              <p className="mt-1 text-sm text-gray-500">
                {project.surface} &middot; {project.hoop_size} &middot; {project.machine_brand}
              </p>
              <span className="mt-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                {project.current_phase}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
