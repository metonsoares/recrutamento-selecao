import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { CurriculoForm } from './CurriculoForm'
import { FormQuestion, FormSection } from '@/types'

export const dynamic = 'force-dynamic'

export default async function CurriculoPage() {
  const supabase = await createSupabaseServiceClient()

  const [{ data: jobs }, { data: questions }, { data: sections }, { data: aiSettings }] = await Promise.all([
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
      .select('mission, vision, company_culture')
      .limit(1)
      .single(),
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
    />
  )
}
