import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white">
      <main className="flex max-w-2xl flex-col items-center gap-8 px-6 text-center">
        <h1 className="text-5xl font-bold tracking-tight">BordAI</h1>
        <p className="text-lg text-gray-600">
          Convierte tu imagen en un archivo de bordado listo para tu maquina.
          IA que entiende tu diseno y genera archivos .PES, .DST, .JEF y mas.
        </p>
        <div className="flex gap-4">
          <Link
            href="/register"
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
          >
            Crear cuenta gratis
          </Link>
          <Link
            href="/login"
            className="rounded-lg border px-6 py-3 font-medium hover:bg-gray-50"
          >
            Iniciar sesion
          </Link>
        </div>
      </main>
    </div>
  )
}
