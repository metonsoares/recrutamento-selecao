import { createClient } from '@/lib/supabase/server'
import SurveyForm from './SurveyForm'
import type { SurveyWithSections } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

async function getSurveyData(): Promise<SurveyWithSections | null> {
  try {
    const supabase = await createClient()

    const { data: survey } = await supabase
      .from('surveys')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!survey) return null

    const { data: sections } = await supabase
      .from('survey_sections')
      .select(`
        *,
        questions (
          *,
          question_options (*)
        )
      `)
      .eq('survey_id', survey.id)
      .order('display_order', { ascending: true })

    if (!sections) return null

    // Ordena perguntas e opções por display_order
    const sectionsOrdered = sections.map((section) => ({
      ...section,
      questions: (section.questions ?? [])
        .sort((a, b) => a.display_order - b.display_order)
        .map((q) => ({
          ...q,
          question_options: (q.question_options ?? []).sort(
            (a, b) => a.display_order - b.display_order
          ),
        })),
    }))

    return { ...survey, survey_sections: sectionsOrdered } as SurveyWithSections
  } catch {
    return null
  }
}

export default async function PesquisaPage() {
  const survey = await getSurveyData()

  if (!survey) {
    return (
      <main className="min-h-screen brand-gradient-soft flex items-center justify-center px-5">
        <div className="bg-white rounded-2xl border border-border p-8 shadow-sm text-center max-w-sm w-full">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-lg font-semibold text-foreground mb-2">
            Pesquisa não disponível
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Não há nenhuma pesquisa ativa no momento. Verifique com o organizador da reunião.
          </p>
        </div>
      </main>
    )
  }

  // SurveyForm é um Client Component — lê identidade do sessionStorage no mount
  return <SurveyForm survey={survey} />
}
