import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import AdminHeader from '../AdminHeader'
import PerguntasManager from './PerguntasManager'

export const dynamic = 'force-dynamic'

export default async function PerguntasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const admin = await createAdminClient()

  const { data: survey } = await admin
    .from('surveys')
    .select('id, title, status')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!survey) {
    return (
      <div className="min-h-screen bg-muted">
        <AdminHeader userEmail={user.email ?? ''} />
        <div className="max-w-4xl mx-auto px-5 py-16 text-center">
          <p className="text-muted-foreground text-sm">Nenhuma pesquisa encontrada.</p>
        </div>
      </div>
    )
  }

  const { data: sectionsRaw } = await admin
    .from('survey_sections')
    .select(`
      id, title, description, display_order,
      questions(
        id, question_text, question_type, is_required, max_choices, display_order,
        question_options(id, option_text, display_order)
      )
    `)
    .eq('survey_id', survey.id)
    .order('display_order')

  return (
    <div className="min-h-screen bg-muted">
      <AdminHeader userEmail={user.email ?? ''} />
      <PerguntasManager
        surveyId={survey.id}
        sections={(sectionsRaw ?? []) as Parameters<typeof PerguntasManager>[0]['sections']}
      />
    </div>
  )
}
