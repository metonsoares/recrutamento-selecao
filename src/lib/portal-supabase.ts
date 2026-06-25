import { createClient } from '@supabase/supabase-js'

// Supabase do Portal BDT (hub). Usado apenas para verificar o perfil de acesso
// do usuário via RPC pública `recrutamento_perfil` (que expõe só o perfil — nada
// sensível). A chave abaixo é a PUBLISHABLE (pública por design): pode ficar no código.
const PORTAL_URL = process.env.PORTAL_SUPABASE_URL || 'https://xhqzakikatookphvjewy.supabase.co'
const PORTAL_PUBLISHABLE_KEY = process.env.PORTAL_SUPABASE_KEY || 'sb_publishable_5WNUgNJi51Rx3kZIQRtVfA_hVRf1tC9'

export function createPortalClient() {
  return createClient(PORTAL_URL, PORTAL_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
