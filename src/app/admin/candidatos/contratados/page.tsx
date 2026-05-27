import { createSupabaseServerClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { formatDate } from '@/lib/helpers'
import { UserCheck, ArrowLeft, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ContratadosPage() {
  const supabase = await createSupabaseServerClient()

  // Busca candidatos com latest_application
  const { data: candidates } = await supabase
    .from('candidates')
    .select(`
      id, full_name, phone, email, city, cpf, created_at,
      applications!latest_application_id (
        id, status, created_at, final_score, culture_score,
        jobs ( title )
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  type AppRow = {
    id: string
    status: string
    created_at: string
    final_score: number | null
    culture_score: number | null
    jobs: { title: string } | { title: string }[] | null
  }

  type CandidateRow = {
    id: string
    full_name: string
    phone: string | null
    email: string | null
    city: string | null
    cpf: string | null
    created_at: string
    applications: AppRow | AppRow[] | null
  }

  const rows = (candidates || []) as CandidateRow[]

  function getApp(c: CandidateRow): AppRow | null {
    if (!c.applications) return null
    return Array.isArray(c.applications) ? c.applications[0] : c.applications
  }

  // Filtra contratados
  const contratados = rows.filter(c => getApp(c)?.status === 'contratado')

  // Busca fotos (file_upload) das candidaturas dos contratados
  const appIds = contratados.map(c => getApp(c)?.id).filter(Boolean) as string[]
  const photoMap: Record<string, string> = {}

  if (appIds.length > 0) {
    const { data: photoAnswers } = await supabase
      .from('form_answers')
      .select('application_id, answer_text')
      .in('application_id', appIds)
      .in('question_id',
        // sub-select: IDs das perguntas de file_upload
        (await supabase
          .from('form_questions')
          .select('id')
          .eq('field_type', 'file_upload')
        ).data?.map(q => q.id) ?? []
      )

    for (const pa of photoAnswers || []) {
      if (!photoMap[pa.application_id] && pa.answer_text) {
        // answer_text é uma JSON string: "\"https://...\""
        const url = pa.answer_text.replace(/^"|"$/g, '')
        if (url.startsWith('http')) photoMap[pa.application_id] = url
      }
    }
  }

  function getJobTitle(app: AppRow | null): string {
    if (!app?.jobs) return '—'
    const j = Array.isArray(app.jobs) ? app.jobs[0] : app.jobs
    return j?.title || '—'
  }

  function scoreColor(v: number | null) {
    if (v == null) return 'text-gray-400'
    if (v >= 70) return 'text-emerald-600'
    if (v >= 50) return 'text-amber-600'
    return 'text-red-500'
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/candidatos"
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2">
          <UserCheck className="w-6 h-6 text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Contratados</h1>
            <p className="text-sm text-muted-foreground">
              {contratados.length} candidato{contratados.length !== 1 ? 's' : ''} contratado{contratados.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Estado vazio */}
      {contratados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <Users className="w-8 h-8 text-gray-300" />
          </div>
          <div>
            <p className="font-medium text-gray-600">Nenhum contratado ainda</p>
            <p className="text-sm text-muted-foreground mt-1">
              Candidatos com status &ldquo;Contratado&rdquo; aparecem aqui.
            </p>
          </div>
          <Link
            href="/admin/candidatos"
            className="text-sm text-primary underline underline-offset-2"
          >
            Ver todos os candidatos
          </Link>
        </div>
      )}

      {/* Tabela */}
      {contratados.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Candidato</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Vaga</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Contato</th>
                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Cidade</th>
                <th className="px-4 py-3 text-center font-medium">Nota Final</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Cadastro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contratados.map(c => {
                const app = getApp(c)
                const photoUrl = app ? photoMap[app.id] : undefined
                return (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                    onClick={() => { window.location.href = `/admin/candidatos/${c.id}` }}
                  >
                    {/* Nome + foto */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photoUrl}
                            alt={c.full_name}
                            className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-emerald-700">
                              {c.full_name?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate group-hover:text-emerald-700 transition-colors">
                            {c.full_name}
                          </p>
                          <p className="text-xs text-muted-foreground sm:hidden">
                            {getJobTitle(app)}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Vaga */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {getJobTitle(app)}
                      </span>
                    </td>

                    {/* Contato */}
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                      <div>
                        <p>{c.phone || '—'}</p>
                        {c.email && (
                          <p className="text-xs text-muted-foreground truncate max-w-[160px]">{c.email}</p>
                        )}
                      </div>
                    </td>

                    {/* Cidade */}
                    <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                      {c.city || '—'}
                    </td>

                    {/* Nota final */}
                    <td className="px-4 py-3 text-center">
                      {app?.final_score != null ? (
                        <span className={`text-base font-bold ${scoreColor(app.final_score)}`}>
                          {Math.round(app.final_score)}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Cadastro */}
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell text-xs">
                      {formatDate(c.created_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
