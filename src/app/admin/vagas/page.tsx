import { requirePermission } from '@/lib/auth-guard'
// A autorização desta tela é o requirePermission abaixo. O client de serviço
// substitui o de sessão para que a policy ALL/authenticated/true de `jobs`,
// que hoje deixa qualquer conta logada ler e escrever, possa ser removida.
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { JobsManager } from './jobs-manager'

export default async function VagasPage() {
  await requirePermission('curriculos.vagas')
  // Leitura pelo service client: quem autoriza é o requirePermission acima, não
  // a policy do banco — que hoje é ALL/authenticated/true e por isso não filtra
  // nada. Com a leitura aqui, a policy permissiva pode cair na migration.
  const supabase = await createSupabaseServiceClient()
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })

  return <JobsManager jobs={jobs || []} />
}
