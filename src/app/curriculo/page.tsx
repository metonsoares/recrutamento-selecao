import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { CurriculoForm } from './CurriculoForm'
import { FormQuestion, FormSection, CultureQuestion } from '@/types'

export const dynamic = 'force-dynamic'

export default async function CurriculoPage() {
  const supabase = await createSupabaseServiceClient()

  const [
    { data: jobs },
    { data: questions },
    { data: sections },
    { data: aiSettings },
    { data: cultureQuestions },
  ] = await Promise.all([
    supabase
      .from('jobs')
      .select('id, title')
      .eq('is_active', true)
      .order('title'),
    supabase
      .from('form_questions')
      .select('*')
      .eq('form_type', 'registration')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('form_sections')
      .select('*')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('ai_settings')
      .select('mission, vision, company_culture, logo_url, company_name')
      .limit(1)
      .single(),
    supabase
      .from('culture_questions')
      .select('*')
      .eq('is_active', true)
      .order('sort_order'),
  ])

  const companyInfo = aiSettings
    ? {
        mission: aiSettings.mission ?? null,
        company_culture: aiSettings.company_culture ?? null,
      }
    : null

  return (
    <CurriculoForm
      jobs={jobs || []}
      questions={(questions as FormQuestion[]) || []}
      sections={(sections as FormSection[]) || []}
      companyInfo={companyInfo}
      cultureQuestions={(cultureQuestions as CultureQuestion[]) || []}
      logoUrl={aiSettings?.logo_url ?? null}
      companyName={aiSettings?.company_name ?? null}
    />
  )
}
