import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CandidateTabNav } from '../candidate-tab-nav'
import { FichaAdmissaoForm, AdmissionFormData, CandidateAddress, CompanyOption } from './ficha-admissao-form'

export const dynamic = 'force-dynamic'

export default async function FichaAdmissaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, full_name, phone, email, cpf, city, neighborhood')
    .eq('id', id)
    .single()

  if (!candidate) notFound()

  const { data: app } = await supabase
    .from('applications')
    .select('id, admission_form, job_id, jobs(title)')
    .eq('candidate_id', id)
    .eq('is_latest', true)
    .maybeSingle()

  // Busca endereço em form_answers (field_type = 'address')
  let parsedAddress: CandidateAddress | null = null
  if (app?.id) {
    const { data: addrAns } = await supabase
      .from('form_answers')
      .select('answer_text, form_questions!inner(field_type)')
      .eq('application_id', app.id)
      .eq('form_questions.field_type', 'address')
      .maybeSingle()

    if (addrAns?.answer_text) {
      try {
        const raw = JSON.parse(addrAns.answer_text as string)
        if (Array.isArray(raw)) {
          // Formato do formulário de cadastro: [street, number, neighborhood, city, cep]
          parsedAddress = {
            street: raw[0] || '', number: raw[1] || '', complement: '',
            neighborhood: raw[2] || '', city: raw[3] || '', cep: raw[4] || '',
          }
        } else if (typeof raw === 'object' && raw !== null) {
          parsedAddress = {
            street: raw.street || raw.logradouro || '',
            number: raw.number || raw.numero || '',
            complement: raw.complement || raw.complemento || '',
            neighborhood: raw.neighborhood || raw.bairro || '',
            city: raw.city || raw.cidade || '',
            cep: raw.cep || raw.zipCode || '',
          }
        }
      } catch { /* ignora parse error */ }
    }
  }

  const service = await createSupabaseServiceClient()
  const [{ data: brand }, { data: companiesData }] = await Promise.all([
    service.from('ai_settings').select('company_name').limit(1).single(),
    service.from('companies').select('id, apelido, razao_social, cnpj').order('created_at', { ascending: false }),
  ])
  const companies = (companiesData || []) as CompanyOption[]

  const rawJobs = (app as Record<string, unknown> | null)?.jobs
  const jobTitle = (Array.isArray(rawJobs) ? (rawJobs[0] as { title?: string })?.title : (rawJobs as { title?: string } | null)?.title) ?? null
  const admissionForm = (app?.admission_form as AdmissionFormData | null) ?? null

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <Link
        href="/admin/candidatos/contratados"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Contratados
      </Link>

      <div>
        <h1 className="text-xl font-bold text-gray-900">{candidate.full_name}</h1>
        <p className="text-sm text-muted-foreground">{jobTitle || 'Sem vaga definida'}</p>
      </div>

      <CandidateTabNav candidateId={id} />

      <FichaAdmissaoForm
        candidate={{
          id: candidate.id,
          full_name: candidate.full_name,
          phone: candidate.phone as string | null,
          email: candidate.email as string | null,
          cpf: candidate.cpf as string | null,
          city: candidate.city as string | null,
          neighborhood: candidate.neighborhood as string | null,
          address: parsedAddress,
        }}
        jobTitle={jobTitle}
        companyName={brand?.company_name ?? null}
        initialData={admissionForm}
        companies={companies}
      />
    </div>
  )
}
