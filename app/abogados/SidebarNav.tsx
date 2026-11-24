'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { abogadoSections } from './sections'

export default function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Portal de abogados" className="mt-4 grid grid-cols-4 gap-1 lg:flex lg:flex-col">
      {abogadoSections.map(({ slug, label, icon: Icon }) => {
        const href = slug ? `/abogados/${slug}` : '/abogados'
        const active = pathname === href
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 lg:flex-row lg:justify-start lg:gap-2.5 lg:px-3 lg:py-2.5 lg:text-left lg:text-sm ${active ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-200 hover:bg-white/10 hover:text-white'}`}>
            <Icon className={`size-[18px] shrink-0 ${active ? 'text-blue-700' : 'text-blue-200'}`} aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
