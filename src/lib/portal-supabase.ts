import { createClient } from '@supabase/supabase-js'

// Supabase do Portal BDT (hub central). Fonte da verdade de usuário + perfil de acesso por app.
// URL é pública; a chave (service) fica só no servidor (env não-NEXT_PUBLIC).
const PORTAL_URL = process.env.PORTAL_SUPABASE_URL || 'https://xhqzakikatookphvjewy.supabase.co'

/** Cliente de leitura do Supabase do Portal (server-only). Retorna null se a chave não estiver configurada. */
export function createPortalClient() {
  const key = process.env.PORTAL_SUPABASE_SERVICE_KEY
  if (!key) return null
  return createClient(PORTAL_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
