'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/projects', label: 'Proyectos' },
]

export function Sidebar({ user }: { user: User }) {
  const pathname = usePathname()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <aside className="flex w-64 flex-col border-r bg-white">
      <div className="border-b p-4">
        <h2 className="text-lg font-bold">BordAI</h2>
        <p className="truncate text-xs text-gray-500">{user.email}</p>
      </div>

      <nav className="flex-1 p-2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-md px-3 py-2 text-sm ${
              pathname.startsWith(item.href)
                ? 'bg-blue-50 font-medium text-blue-700'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t p-2">
        <button
          onClick={handleSignOut}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
