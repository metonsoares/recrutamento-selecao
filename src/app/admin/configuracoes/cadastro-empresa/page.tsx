import { createSupabaseServerClient } from '@/lib/supabase-server'
import { CadastroEmpresaForm } from './cadastro-empresa-form'

export default async function CadastroEmpresaPage() {
  const supabase = await createSupabaseServerClient()
  const { data: settings } = await supabase.from('ai_settings').select('*').limit(1).single()
  return <CadastroEmpresaForm settings={settings} />
}
