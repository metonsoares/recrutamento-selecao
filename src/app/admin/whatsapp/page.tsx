import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { WhatsappConversations } from './whatsapp-conversations'

export default async function WhatsAppPage() {
  const supabase = await createSupabaseServerClient()
  const { data: conversations } = await supabase
    .from('whatsapp_conversations')
    .select('*, candidates(full_name)')
    .order('updated_at', { ascending: false })
    .limit(50)

  const convs = conversations || []

  // Resolve o nome do candidato pelo telefone (com/sem DDI 55) quando não há vínculo direto
  const variants = new Set<string>()
  for (const c of convs) {
    const digits = String(c.phone || '').replace(/\D/g, '')
    if (!digits) continue
    variants.add(digits)
    if (digits.startsWith('55')) variants.add(digits.slice(2))
    else variants.add(`55${digits}`)
  }

  if (variants.size > 0) {
    const service = await createSupabaseServiceClient()
    const { data: cands } = await service
      .from('candidates')
      .select('id, full_name, phone_normalized')
      .in('phone_normalized', Array.from(variants))
      .is('deleted_at', null)
    const byPhone = new Map<string, { id: string; full_name: string }>()
    for (const cand of cands || []) {
      if (cand.phone_normalized) byPhone.set(cand.phone_normalized as string, { id: cand.id as string, full_name: cand.full_name as string })
    }
    for (const c of convs) {
      if ((c.candidates as { full_name?: string } | null)?.full_name) continue
      const digits = String(c.phone || '').replace(/\D/g, '')
      const local = digits.startsWith('55') ? digits.slice(2) : digits
      const match = byPhone.get(digits) || byPhone.get(local) || byPhone.get(`55${digits}`)
      if (match) {
        c.candidates = { full_name: match.full_name }
        if (!c.candidate_id) c.candidate_id = match.id
      }
    }
  }

  return <WhatsappConversations conversations={convs} />
}
