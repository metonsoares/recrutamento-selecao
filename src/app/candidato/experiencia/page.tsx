import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { ExperienceForm } from './experience-form'
import { notFound } from 'next/navigation'

export default async function ExperienciaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) notFound()

  const supabase = await createSupabaseServiceClient()

  const { data: application } = await supabase
    .from('applications')
    .select('*, candidates(full_name), jobs(title)')
    .eq('experience_form_token', token)
    .gte('experience_form_token_expires_at', new Date().toISOString())
    .single()

  if (!application) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center space-y-3">
        <p className="text-2xl">⏰</p>
        <h2 className="font-semibold text-lg">Link inválido ou expirado</h2>
        <p className="text-sm text-muted-foreground">
          Este link de formulário não é válido ou já expirou. Entre em contato pelo WhatsApp para solicitar um novo link.
        </p>
      </div>
    )
  }

  const { data: questions } = await supabase
    .from('form_questions')
    .select('*')
    .eq('is_active', true)
    .eq('form_type', 'experience')
    .order('sort_order')

  const { data: jobs } = await supabase.from('jobs').select('id, title').eq('is_active', true)

  const alreadyAnswered = ['experiencia_preenchida', 'aguardando_teste_cultural', 'teste_cultural_preenchido', 'analise_ia_concluida', 'apto_para_entrevista', 'entrevista_agendada', 'entrevistado', 'aprovado', 'reprovado', 'banco_de_talentos', 'contratado'].includes(application.status)

  if (alreadyAnswered) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center space-y-3">
        <p className="text-2xl">✅</p>
        <h2 className="font-semibold text-lg">Formulário já enviado!</h2>
        <p className="text-sm text-muted-foreground">Você já preencheu este formulário. Nossa equipe irá analisar seu perfil em breve.</p>
      </div>
    )
  }

  return (
    <ExperienceForm
      application={application}
      questions={questions || []}
      jobs={jobs || []}
      token={token}
    />
  )
}
