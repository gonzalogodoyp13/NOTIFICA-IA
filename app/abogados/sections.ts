import { BriefcaseBusiness, CreditCard, House, Plus, ReceiptText, Settings2, Stamp, UsersRound } from 'lucide-react'

export const abogadoShortcuts = [
  { slug: 'nuevo-encargo', label: 'Nuevo encargo', icon: Plus },
  { slug: 'mis-causas', label: 'Mis causas', icon: BriefcaseBusiness },
  { slug: 'receptores', label: 'Receptores', icon: UsersRound },
  { slug: 'estampos', label: 'Estampos', icon: Stamp },
  { slug: 'pagos', label: 'Pagos', icon: CreditCard },
  { slug: 'boletas', label: 'Boletas', icon: ReceiptText },
] as const

export const abogadoSections = [
  { slug: '', label: 'Inicio', icon: House },
  ...abogadoShortcuts,
  { slug: 'ajustes', label: 'Ajustes', icon: Settings2 },
] as const
