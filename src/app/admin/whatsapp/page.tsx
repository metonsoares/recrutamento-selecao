import { createSupabaseServerClient } from '@/lib/supabase-server'
import { WhatsappConversations } from './whatsapp-conversations'

export default async function WhatsAppPage() {
  const supabase = await createSupabaseServerClient()
  const { data: conversations } = await supabase
    .from('whatsapp_conversations')
    .select('*, candidates(full_name)')
    .order('updated_at', { ascending: false })
    .limit(50)

  return <WhatsappConversations conversations={conversations || []} />
}
