import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CandidateTabNav } from '../candidate-tab-nav'
import { FichaAdmissaoForm, AdmissionFormData } from './ficha-admissao-form'

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
    .select('admission_form, jobs(title)')
    .eq('candidate_id', id)
    .eq('is_latest', true)
    .maybeSingle()

  const service = await createSupabaseServiceClient()
  const { data: brand } = await service
    .from('ai_settings')
    .select('company_name')
    .limit(1)
    .single()

  const rawJobs = (app as Record<string, unknown> | null)?.jobs
  const jobTitle = (Array.isArray(rawJobs) ? (rawJobs[0] as { title?: string })?.title : (rawJobs as { title?: string } | null)?.title) ?? null

  const admissionForm = (app?.admission_form as AdmissionFormData | null) ?? null

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      {/* Back */}
      <Link
        href="/admin/candidatos/contratados"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Contratados
      </Link>

      {/* Nome */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">{candidate.full_name}</h1>
        <p className="text-sm text-muted-foreground">{jobTitle || 'Sem vaga definida'}</p>
      </div>

      {/* Tabs */}
      <CandidateTabNav
        candidateId={id}
        printUrl={`/admin/candidatos/${id}/print`}
        hasCpf={!!candidate.cpf}
      />

      {/* Form */}
      <FichaAdmissaoForm
        candidate={{
          id: candidate.id,
          full_name: candidate.full_name,
          phone: candidate.phone as string | null,
          email: candidate.email as string | null,
          cpf: candidate.cpf as string | null,
          city: candidate.city as string | null,
          neighborhood: candidate.neighborhood as string | null,
        }}
        jobTitle={jobTitle}
        companyName={brand?.company_name ?? null}
        initialData={admissionForm}
      />
    </div>
  )
}
