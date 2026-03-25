type RolTabKey = 'resumen' | 'diligencias' | 'documentos' | 'notas' | 'historial'

interface RolTabsProps {
  activeTab: RolTabKey
  onTabChange: (tab: RolTabKey) => void
}

const tabs: Array<{ key: RolTabKey; label: string }> = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'diligencias', label: 'Diligencias' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'notas', label: 'Notas' },
  { key: 'historial', label: 'Historial' },
]

export default function RolTabs({ activeTab, onTabChange }: RolTabsProps) {
  return (
    <nav className="px-6 py-4">
      <ul className="flex flex-wrap gap-2 rounded-[24px] border border-slate-200/80 bg-white/90 p-2 shadow-sm">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <button
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={[
                'rounded-2xl px-4 py-2.5 text-sm font-semibold transition duration-200',
                activeTab === tab.key
                  ? 'bg-slate-900 text-white shadow-[0_16px_30px_-22px_rgba(15,23,42,0.8)]'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
              ].join(' ')}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
