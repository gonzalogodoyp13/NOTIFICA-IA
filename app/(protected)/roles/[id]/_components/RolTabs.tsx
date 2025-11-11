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
  // Control de navegación por pestañas para distribuir los módulos del ROL.
  return (
    <nav className="border-b border-slate-200 bg-white px-4">
      <ul className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <button
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`rounded-t-md px-3 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'bg-slate-100 text-slate-900 shadow-inner'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

