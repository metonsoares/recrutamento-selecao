import { createSupabaseServerClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STATUS_LABELS, STATUS_COLORS, CandidateStatus } from '@/types'
import { formatDate, formatDateTime } from '@/lib/helpers'
import { CandidateActions } from './candidate-actions'

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data: candidate } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', id)
    .single()

  if (!candidate) notFound()

  const { data: applications } = await supabase
    .from('applications')
    .select('*, jobs(title)')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false })

  const latestApp = applications?.[0]

  const { data: formAnswers } = latestApp ? await supabase
    .from('form_answers')
    .select('*, form_questions(question_text, category)')
    .eq('application_id', latestApp.id) : { data: [] }

  const { data: cultureAnswers } = latestApp ? await supabase
    .from('culture_answers')
    .select('*, culture_questions(question_text, culture_value)')
    .eq('application_id', latestApp.id) : { data: [] }

  const { data: notes } = await supabase
    .from('admin_notes')
    .select('*')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false })

  const currentStatus = (latestApp?.status || 'novo') as CandidateStatus

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{candidate.full_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={`text-xs ${STATUS_COLORS[currentStatus]}`}>
              {STATUS_LABELS[currentStatus]}
            </Badge>
            {applications && applications.length > 1 && (
              <Badge variant="outline" className="text-xs">{applications.length} candidaturas</Badge>
            )}
          </div>
        </div>
        <CandidateActions candidateId={id} applicationId={latestApp?.id} currentStatus={currentStatus} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Dados Pessoais</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Telefone" value={candidate.phone} />
            <Row label="E-mail" value={candidate.email} />
            <Row label="Cidade" value={candidate.city} />
            <Row label="Bairro" value={candidate.neighborhood} />
            <Row label="Origem" value={candidate.source} />
            <Row label="LGPD" value={candidate.lgpd_accepted ? `Aceito em ${formatDate(candidate.lgpd_accepted_at)}` : 'Não aceito'} />
            <Row label="Cadastro" value={formatDate(candidate.created_at)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Candidatura Atual</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {latestApp ? (
              <>
                <Row label="Vaga" value={(latestApp.jobs as { title?: string } | null)?.title} />
                <Row label="Data" value={formatDate(latestApp.created_at)} />
                <Row label="Nota Cultural" value={latestApp.culture_score != null ? `${latestApp.culture_score.toFixed(0)}/100` : null} />
                <Row label="Nota Experiência" value={latestApp.experience_score != null ? `${latestApp.experience_score.toFixed(0)}/100` : null} />
                <Row label="Nota Disponib." value={latestApp.availability_score != null ? `${latestApp.availability_score.toFixed(0)}/100` : null} />
                <Row label="Nota Final" value={latestApp.final_score != null ? <strong>{latestApp.final_score.toFixed(0)}/100</strong> : null} />
              </>
            ) : (
              <p className="text-muted-foreground">Sem candidatura</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Parecer da IA</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            {latestApp?.ai_summary ? (
              <>
                <p className="text-muted-foreground text-xs leading-relaxed">{latestApp.ai_summary}</p>
                {latestApp.ai_recommendation && (
                  <p className="font-medium text-xs border-t pt-2">{latestApp.ai_recommendation}</p>
                )}
                {latestApp.ai_status_suggestion && (
                  <p className="text-xs text-muted-foreground">Sugestão: {STATUS_LABELS[latestApp.ai_status_suggestion as CandidateStatus] || latestApp.ai_status_suggestion}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Análise não realizada</p>
            )}
          </CardContent>
        </Card>
      </div>

      {(latestApp?.ai_strengths?.length > 0 || latestApp?.ai_risks?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm text-green-700">Pontos Fortes</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {(latestApp.ai_strengths as string[]).map((p, i) => (
                  <li key={i} className="text-sm flex gap-2"><span className="text-green-500">✓</span>{p}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm text-amber-700">Pontos de Atenção</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {(latestApp.ai_risks as string[]).map((p, i) => (
                  <li key={i} className="text-sm flex gap-2"><span className="text-amber-500">!</span>{p}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {formAnswers && formAnswers.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Formulário de Experiência</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {formAnswers.map((a) => (
              <div key={a.id} className="text-sm border-b pb-2 last:border-0">
                <p className="text-muted-foreground text-xs">{(a.form_questions as { question_text?: string } | null)?.question_text}</p>
                <p className="mt-0.5 font-medium">{a.answer_text || '—'}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {cultureAnswers && cultureAnswers.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Teste Cultural</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {cultureAnswers.map((a) => (
              <div key={a.id} className="text-sm border-b pb-2 last:border-0 flex justify-between items-start gap-4">
                <div>
                  <p className="text-muted-foreground text-xs">{(a.culture_questions as { question_text?: string } | null)?.question_text}</p>
                  <p className="mt-0.5">{a.selected_option || '—'}</p>
                  <p className="text-xs text-muted-foreground">{(a.culture_questions as { culture_value?: string } | null)?.culture_value}</p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${(a.score || 0) >= 8 ? 'text-green-600' : (a.score || 0) >= 5 ? 'text-amber-600' : 'text-red-600'}`}>
                  {a.score ?? 0}/10
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {applications && applications.length > 1 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Histórico de Candidaturas</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-muted-foreground text-xs border-b">
                <th className="text-left pb-2">Data</th>
                <th className="text-left pb-2">Vaga</th>
                <th className="text-left pb-2">Status</th>
                <th className="text-left pb-2">Nota Final</th>
              </tr></thead>
              <tbody>
                {applications.map(a => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2">{formatDate(a.created_at)}</td>
                    <td className="py-2">{(a.jobs as { title?: string } | null)?.title || '—'}</td>
                    <td className="py-2">
                      <Badge className={`text-xs ${STATUS_COLORS[a.status as CandidateStatus]}`}>
                        {STATUS_LABELS[a.status as CandidateStatus] || a.status}
                      </Badge>
                    </td>
                    <td className="py-2">{a.final_score != null ? `${(a.final_score as number).toFixed(0)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Observações Internas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {notes?.map(n => (
            <div key={n.id} className="text-sm border-l-2 border-primary/30 pl-3">
              <p>{n.note}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(n.created_at)}</p>
            </div>
          ))}
          {!notes?.length && <p className="text-sm text-muted-foreground">Nenhuma observação</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value || '—'}</span>
    </div>
  )
}
