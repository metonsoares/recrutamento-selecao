import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { KanbanColunasForm } from './kanban-colunas-form'

export const dynamic = 'force-dynamic'

// Definição master das colunas — mesma ordem padrão do candidates-board
export const DEFAULT_COLUMNS = [
  { key: 'novo',      label: 'Novo Currículo',        dot: 'bg-gray-400' },
  { key: 'apto',      label: 'Apto para Entrevista',  dot: 'bg-blue-500' },
  { key: 'agendada',  label: 'Entrevista Agendada',   dot: 'bg-purple-500' },
  { key: 'aprovado',  label: 'Intermitentes',          dot: 'bg-emerald-500' },
  { key: 'reprovado', label: 'Reprovado',              dot: 'bg-red-400' },
  { key: 'em_contrato',label: 'Em contrato',           dot: 'bg-teal-500' },
  { key: 'contratado',label: 'Contratado',             dot: 'bg-[#1a5c38]' },
  { key: 'freelancer',label: 'Freelancer',             dot: 'bg-sky-500' },
] as const

export default async function KanbanColunasPage() {
  await requirePermission('config.kanban')
  const supabase = await createSupabaseServerClient()
  const { data: settings } = await supabase
    .from('ai_settings')
    .select('id, kanban_column_order')
    .limit(1)
    .single()

  const savedOrder = (settings?.kanban_column_order as string[] | null) ?? null

  // Monta lista na ordem salva (ou padrão)
  const orderedKeys = savedOrder && savedOrder.length > 0
    ? [
        ...savedOrder.filter(k => DEFAULT_COLUMNS.some(c => c.key === k)),
        ...DEFAULT_COLUMNS.map(c => c.key).filter(k => !savedOrder.includes(k)),
      ]
    : DEFAULT_COLUMNS.map(c => c.key)

  const ordered = orderedKeys.map(k => DEFAULT_COLUMNS.find(c => c.key === k)!)

  return (
    <KanbanColunasForm
      columns={ordered}
      settingsId={settings?.id ?? null}
    />
  )
}
