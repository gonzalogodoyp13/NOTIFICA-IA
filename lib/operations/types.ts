import type { Health } from './policy'
export type Cell = { text: string; href?: string; tone?: Health }
export type Table = { title: string; columns: string[]; rows: Cell[][]; more?: boolean; description?: string }
export type OperationsView = {
  recovery?: { officeId?: number; kind?: string; targetId?: string; actionId?: string };
  guide?: ReturnType<typeof import('./guides').troubleshooting>;
  configuration?: Awaited<ReturnType<typeof import('./alert-management').alertConfiguration>>;
  alertActions?: { key: string; status: string; revision: number }[];
  maintenanceActions?: { id: string }[];
  title: string; subtitle: string; refreshedAt: string; tables: Table[];
  stats?: { label: string; value: number | string; tone?: Health }[];
  facts?: { label: string; value: string }[];
  attention?: { text: string; href: string; tone: Health }[];
  incident?: { id: string; status: string; severity: string; revision: number; assignedToUserId: string | null; impact: string | null; confirmedCause: string | null; suspectedCause: string | null; nextSteps: string | null };
}
