import Link from 'next/link'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#0f0f0f]">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-gray-800 bg-[#1a1a2e]">
        <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-4">
          <span className="text-lg font-bold text-white">BordAI</span>
          <span className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            ADMIN
          </span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <Link
            href="/admin/pipeline-editor"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
            Pipeline Editor
          </Link>
          <Link
            href="/projects"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            Proyectos
          </Link>
        </nav>
        <div className="border-t border-gray-800 p-3">
          <Link
            href="/projects"
            className="block rounded-lg px-3 py-2 text-xs text-gray-500 hover:text-gray-300"
          >
            Volver al dashboard
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
