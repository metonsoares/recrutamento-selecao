import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import AdminHeader from '../AdminHeader'
import RespondentesClient from './RespondentesClient'

export const dynamic = 'force-dynamic'

export default async function RespondentesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const admin = await createAdminClient()

  // Survey ativa
  const { data: survey } = await admin
    .from('surveys')
    .select('id, title')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!survey) {
    return (
      <div className="min-h-screen bg-muted">
        <AdminHeader userEmail={user.email ?? ''} />
        <div className="max-w-4xl mx-auto px-5 py-16 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhuma pesquisa ativa no momento.
          </p>
        </div>
      </div>
    )
  }

  // Respondentes com status de envio
  const { data: respondentsRaw } = await admin
    .from('respondents')
    .select(`
      id, name, role, created_at,
      responses(submitted_at)
    `)
    .eq('survey_id', survey.id)
    .order('created_at', { ascending: false })

  const respondents = (respondentsRaw ?? []).map((r) => {
    const resp = r.responses as unknown as Array<{ submitted_at: string }> | null
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      createdAt: r.created_at,
      submittedAt: resp?.[0]?.submitted_at ?? null,
    }
  })

  const roles = [...new Set(respondents.map((r) => r.role))].sort()
  const submittedCount = respondents.filter((r) => r.submittedAt).length

  return (
    <div className="min-h-screen bg-muted">
      <AdminHeader userEmail={user.email ?? ''} />

      <div className="max-w-4xl mx-auto px-5 py-6 space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Respondentes</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {respondents.length} identificados · {submittedCount} enviaram
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/export"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Exportar xlsx
            </a>
          </div>
        </div>

        <RespondentesClient
          respondents={respondents}
          roles={roles}
        />
      </div>
    </div>
  )
}
