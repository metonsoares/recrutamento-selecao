import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { PainelWhatsApp } from './painel-whatsapp'

/**
 * Configurações → WhatsApp.
 *
 * Não há mais o que configurar aqui: desde 10/11/2026 o Recrutamento envia
 * pelo número oficial da empresa, que é cadastrado no Portal BDT. Esta tela
 * mostra por onde sai, com quais modelos, e o que foi enviado.
 */
export default async function WhatsAppConfigPage() {
  await requirePermission('config.whatsapp')
  const supabase = await createSupabaseServiceClient()

  const { data: logs } = await supabase
    .from('whatsapp_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  return <PainelWhatsApp logs={logs ?? []} />
}
