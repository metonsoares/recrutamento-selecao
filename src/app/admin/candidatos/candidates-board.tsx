'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STATUS_LABELS, STATUS_COLORS, CandidateStatus } from '@/types'
import { formatDate, formatDateTime } from '@/lib/helpers'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import {
  Search, SortAsc, UserCheck, UserX, PhoneOff,
  ExternalLink, Loader2, User, Briefcase,
  ChevronDown, ChevronUp, ChevronsUpDown,
  CalendarCheck, Trash2,
} from 'lucide-react'

// ─── Grupos de status para cada quadro ───────────────────────────────────────

const GROUPS = {
  novos: {
    label: 'Novos Cadastros',
    headerColor: 'bg-[#f3f4f6] border-[#e5e7eb]',
    dotColor: 'bg-[#9ca3af]',
    statuses: [
      'novo', 'pre_cadastro_whatsapp',
      'aguardando_formulario_experiencia', 'experiencia_preenchida',
      'aguardando_teste_cultural', 'teste_cultural_preenchido',
      'analise_ia_concluida',
    ],
  },
  entrevista: {
    label: 'Para Entrevista',
    headerColor: 'bg-emerald-50 border-emerald-200',
    dotColor: 'bg-emerald-500',
    statuses: [
      'apto_para_entrevista', 'entrevista_agendada',
      'entrevistado', 'aprovado', 'banco_de_talentos', 'contratado',
    ],
  },
  reprovados: {
    label: 'Não Aprovados',
    headerColor: 'bg-red-50 border-red-200',
    dotColor: 'bg-red-400',
    statuses: ['reprovado', 'desistente', 'removido'],
  },
} as const

type GroupKey = keyof typeof GROUPS
type SortOption = 'date_desc' | 'date_asc' | 'name' | 'score'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CandidateRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  city: string | null
  created_at: string
  applications?: {
    id: string
    status: string
    final_score: number | null
    culture_score: number | null
    created_at: string
    jobs?: { title: string } | null
  } | null
}

interface DetailData {
  candidate: Record<string, unknown>
  latestApp: Record<string, unknown> | null
  applications: Record<string, unknown>[]
  formAnswers: Record<string, unknown>[]
  cultureAnswers: Record<string, unknown>[]
  notes: Record<string, unknown>[]
}

interface Props {
  candidates: CandidateRow[]
  jobs: Array<{ id: string; title: string }>
}

// ─── Componente principal ────────────────────────────────────────────────────

export function CandidatesBoard({ candidates: initial, jobs }: Props) {
  const router = useRouter()
  const [candidates, setCandidates] = useState<CandidateRow[]>(initial)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('date_desc')
  const [filterJob, setFilterJob] = useState('all')

  // Modal
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailData | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [changing, setChanging] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Fetch candidate detail when selected
  useEffect(() => {
    async function fetchDetail() {
      if (!selectedId) { setDetail(null); return }
      setLoadingDetail(true)
      setDetail(null)
      try {
        const r = await fetch(`/api/admin/candidatos/${selectedId}`)
        const d = await r.json()
        setDetail(d)
        setLoadingDetail(false)
      } catch {
        setLoadingDetail(false)
      }
    }
    void fetchDetail()
  }, [selectedId])

  const filterAndSort = useCallback((statuses: readonly string[]) => {
    return candidates
      .filter(c => statuses.includes(c.applications?.status ?? 'novo'))
      .filter(c => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return [c.full_name, c.phone, c.email, c.city].join(' ').toLowerCase().includes(q)
      })
      .filter(c => {
        if (filterJob === 'all') return true
        const title = (c.applications?.jobs as { title?: string } | null)?.title
        return title === filterJob
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.full_name.localeCompare(b.full_name, 'pt-BR')
        if (sortBy === 'score') {
          return (b.applications?.final_score ?? -1) - (a.applications?.final_score ?? -1)
        }
        if (sortBy === 'date_asc') {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [candidates, search, filterJob, sortBy])

  async function changeStatus(newStatus: CandidateStatus) {
    if (!detail?.latestApp || changing) return
    setChanging(true)
    const appId = (detail.latestApp as { id: string }).id
    const candId = (detail.candidate as { id: string }).id
    const supabase = createSupabaseBrowserClient()
    await supabase.from('applications').update({ status: newStatus }).eq('id', appId)
    setCandidates(prev => prev.map(c =>
      c.id === candId && c.applications
        ? { ...c, applications: { ...c.applications, status: newStatus } }
        : c
    ))
    setChanging(false)
    setSelectedId(null)
    router.refresh()
  }

  async function handleScheduleInterview() {
    if (!selectedId || scheduling) return
    setScheduling(true)
    const res = await fetch(`/api/admin/candidatos/${selectedId}/schedule-interview`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setScheduling(false)
    if (!res.ok) { alert(data.error || 'Erro ao agendar entrevista.'); return }
    // Update local state
    setCandidates(prev => prev.map(c =>
      c.id === selectedId && c.applications
        ? { ...c, applications: { ...c.applications, status: 'entrevista_agendada' } }
        : c
    ))
    setSelectedId(null)
    router.refresh()
  }

  async function handleDeleteCandidate() {
    if (!selectedId || deleting) return
    setDeleting(true)
    const res = await fetch(`/api/admin/candidatos/${selectedId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setDeleting(false)
    if (!res.ok) { alert(data.error || 'Erro ao remover candidato.'); return }
    setCandidates(prev => prev.filter(c => c.id !== selectedId))
    setSelectedId(null)
    router.refresh()
  }

  const totalVisible = Object.values(GROUPS).flatMap(g => filterAndSort(g.statuses)).length

  return (
    <div className="p-4 sm:p-6 space-y-4">

      {/* ── Cabeçalho ─────────────────────────────────────── */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Candidatos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {totalVisible} candidatos {search || filterJob !== 'all' ? 'filtrados' : 'no total'}
        </p>
      </div>

      {/* ── Filtros ───────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, telefone, e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterJob} onValueChange={v => v && setFilterJob(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Vaga" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as vagas</SelectItem>
            {jobs.map(j => <SelectItem key={j.id} value={j.title}>{j.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => v && setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[180px]">
            <SortAsc className="w-4 h-4 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Data (mais recente)</SelectItem>
            <SelectItem value="date_asc">Data (mais antigo)</SelectItem>
            <SelectItem value="name">Nome A→Z</SelectItem>
            <SelectItem value="score">Nota (maior)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Quadros Kanban ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.entries(GROUPS) as [GroupKey, typeof GROUPS[GroupKey]][]).map(([key, group]) => {
          const items = filterAndSort(group.statuses)
          return (
            <div key={key} className="flex flex-col min-h-[200px]">
              {/* Column header */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border ${group.headerColor}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${group.dotColor}`} />
                  <span className="text-sm font-semibold text-[#333]">{group.label}</span>
                </div>
                <span className="text-xs font-mono bg-white/80 border px-1.5 py-0.5 rounded-full text-[#666]">
                  {items.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 space-y-2 bg-[#f8f9fb] border border-t-0 rounded-b-xl p-2 min-h-[120px]">
                {items.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-6">
                    Nenhum candidato
                  </p>
                )}
                {items.map(c => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    onClick={() => setSelectedId(c.id)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Modal Ficha do Candidato ─────────────────────── */}
      <Dialog open={!!selectedId} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0">
          {loadingDetail && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Carregando ficha...</span>
            </div>
          )}
          {detail && !loadingDetail && (
            <CandidateModal
              detail={detail}
              selectedId={selectedId!}
              changing={changing}
              scheduling={scheduling}
              deleting={deleting}
              onChangeStatus={changeStatus}
              onScheduleInterview={handleScheduleInterview}
              onDeleteCandidate={handleDeleteCandidate}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Card do candidato no quadro ─────────────────────────────────────────────

function CandidateCard({ candidate: c, onClick }: { candidate: CandidateRow; onClick: () => void }) {
  const status = (c.applications?.status ?? 'novo') as CandidateStatus
  const jobTitle = (c.applications?.jobs as { title?: string } | null)?.title
  const score = c.applications?.final_score

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border rounded-lg px-3 py-2.5 shadow-sm hover:shadow-md hover:border-[#bbb] transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[14px] text-[#1a1a1a] truncate">{c.full_name}</p>
          <p className="text-xs text-muted-foreground truncate">{c.phone || c.email || '—'}</p>
        </div>
        {score != null && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
            score >= 70 ? 'bg-emerald-100 text-emerald-700'
              : score >= 50 ? 'bg-yellow-100 text-yellow-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {Math.round(score)}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <Badge className={`text-[10px] px-1.5 py-0 h-4 ${STATUS_COLORS[status]}`}>
          {STATUS_LABELS[status]}
        </Badge>
        {jobTitle && (
          <span className="text-[10px] text-muted-foreground truncate">{jobTitle}</span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{formatDate(c.created_at)}</p>
    </button>
  )
}

// ─── Modal com ficha completa ─────────────────────────────────────────────────

function CandidateModal({
  detail,
  selectedId,
  changing,
  scheduling,
  deleting,
  onChangeStatus,
  onScheduleInterview,
  onDeleteCandidate,
}: {
  detail: DetailData
  selectedId: string
  changing: boolean
  scheduling: boolean
  deleting: boolean
  onChangeStatus: (s: CandidateStatus) => void
  onScheduleInterview: () => void
  onDeleteCandidate: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const c = detail.candidate as {
    id: string; full_name: string; phone: string | null; email: string | null
    city: string | null; neighborhood: string | null; source: string | null
    lgpd_accepted: boolean; lgpd_accepted_at: string | null; created_at: string
  }
  const app = detail.latestApp as {
    id: string; status: string; final_score: number | null
    culture_score: number | null; experience_score: number | null
    availability_score: number | null; ai_summary: string | null
    ai_recommendation: string | null; ai_status_suggestion: string | null
    ai_strengths: string[]; ai_risks: string[]
    jobs: { title: string } | null; created_at: string
  } | null

  const currentStatus = (app?.status ?? 'novo') as CandidateStatus
  const currentGroupKey = Object.entries(GROUPS).find(([, g]) =>
    (g.statuses as readonly string[]).includes(currentStatus)
  )?.[0] as GroupKey | undefined

  return (
    <>
      {/* Header fixo */}
      <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <DialogTitle className="text-lg">{c.full_name}</DialogTitle>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={`text-xs ${STATUS_COLORS[currentStatus]}`}>
                {STATUS_LABELS[currentStatus]}
              </Badge>
              {app?.jobs?.title && (
                <span className="text-xs text-muted-foreground">{app.jobs.title}</span>
              )}
            </div>
          </div>
          <a
            href={`/admin/candidatos/${selectedId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              Abrir / PDF
            </Button>
          </a>
        </div>
      </DialogHeader>

      {/* Corpo com scroll */}
      <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

        {/* Dados pessoais */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="w-3.5 h-3.5" />Dados Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <InfoRow label="Telefone" value={c.phone} />
            <InfoRow label="E-mail" value={c.email} />
            <InfoRow label="Cidade" value={c.city} />
            <InfoRow label="Bairro" value={c.neighborhood} />
            <InfoRow label="Origem" value={c.source} />
            <InfoRow label="Cadastro" value={formatDate(c.created_at)} />
          </CardContent>
        </Card>

        {/* Candidatura */}
        {app && (
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5" />Candidatura
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <InfoRow label="Vaga" value={app.jobs?.title} />
              <InfoRow label="Data" value={formatDate(app.created_at)} />
              <InfoRow
                label="Cultural"
                value={app.culture_score != null ? `${app.culture_score.toFixed(0)}/100` : undefined}
              />
              <InfoRow
                label="Experiência"
                value={app.experience_score != null ? `${app.experience_score.toFixed(0)}/100` : undefined}
              />
              <InfoRow
                label="Disponib."
                value={app.availability_score != null ? `${app.availability_score.toFixed(0)}/100` : undefined}
              />
              <InfoRow
                label="Nota Final"
                value={app.final_score != null
                  ? <strong className="text-[#1a1a1a]">{app.final_score.toFixed(0)}/100</strong>
                  : undefined
                }
              />
            </CardContent>
          </Card>
        )}

        {/* Parecer IA */}
        {app?.ai_summary && (
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm">Parecer da IA</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">{app.ai_summary}</p>
              {app.ai_recommendation && (
                <p className="text-xs font-medium border-t pt-2">{app.ai_recommendation}</p>
              )}
              {(app.ai_strengths?.length > 0 || app.ai_risks?.length > 0) && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {app.ai_strengths?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-emerald-700 mb-1">Pontos Fortes</p>
                      <ul className="space-y-0.5">
                        {(app.ai_strengths as string[]).map((p, i) => (
                          <li key={i} className="text-xs flex gap-1.5">
                            <span className="text-emerald-500 shrink-0">✓</span>{p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {app.ai_risks?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-amber-700 mb-1">Atenção</p>
                      <ul className="space-y-0.5">
                        {(app.ai_risks as string[]).map((p, i) => (
                          <li key={i} className="text-xs flex gap-1.5">
                            <span className="text-amber-500 shrink-0">!</span>{p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Formulário de Experiência */}
        {detail.formAnswers.length > 0 && (
          <CollapsibleSection title="Formulário de Experiência" defaultOpen={false}>
            <div className="space-y-2">
              {detail.formAnswers.map((a, i) => {
                const ans = a as { id: string; answer_text: string | null; form_questions: { question_text: string } | null }
                return (
                  <div key={ans.id ?? i} className="text-xs border-b pb-2 last:border-0">
                    <p className="text-muted-foreground">{ans.form_questions?.question_text}</p>
                    <p className="font-medium mt-0.5">{ans.answer_text || '—'}</p>
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Teste Cultural */}
        {detail.cultureAnswers.length > 0 && (
          <CollapsibleSection title="Teste Cultural" defaultOpen={false}>
            <div className="space-y-2">
              {detail.cultureAnswers.map((a, i) => {
                const ans = a as { id: string; selected_option: string | null; score: number | null; culture_questions: { question_text: string; culture_value: string | null } | null }
                return (
                  <div key={ans.id ?? i} className="text-xs border-b pb-2 last:border-0 flex justify-between gap-3">
                    <div>
                      <p className="text-muted-foreground">{ans.culture_questions?.question_text}</p>
                      <p className="mt-0.5">{ans.selected_option || '—'}</p>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ${
                      (ans.score ?? 0) >= 8 ? 'text-emerald-600'
                        : (ans.score ?? 0) >= 5 ? 'text-amber-600'
                        : 'text-red-600'
                    }`}>
                      {ans.score ?? 0}/10
                    </span>
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Observações */}
        {detail.notes.length > 0 && (
          <CollapsibleSection title="Observações Internas" defaultOpen={false}>
            <div className="space-y-2">
              {detail.notes.map((n, i) => {
                const note = n as { id: string; note: string; created_at: string }
                return (
                  <div key={note.id ?? i} className="text-xs border-l-2 border-primary/30 pl-2">
                    <p>{note.note}</p>
                    <p className="text-muted-foreground mt-0.5">{formatDateTime(note.created_at)}</p>
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Footer: botões de ação */}
      <div className="px-5 py-3 border-t bg-[#f9fafb] shrink-0 space-y-3">

        {/* Agendar Entrevista — exibido somente quando apto */}
        {currentStatus === 'apto_para_entrevista' && (
          <Button
            size="sm"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={scheduling}
            onClick={onScheduleInterview}
          >
            {scheduling
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Agendando...</>
              : <><CalendarCheck className="w-3.5 h-3.5 mr-1.5" />Agendar Entrevista (envia WhatsApp)</>
            }
          </Button>
        )}

        {/* Demais mudanças de status */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Alterar situação:</p>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              disabled={changing || currentGroupKey === 'entrevista'}
              onClick={() => onChangeStatus('apto_para_entrevista')}
            >
              <UserCheck className="w-3.5 h-3.5 mr-1" />
              {changing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Entrevistar'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-gray-300 text-gray-600 hover:bg-gray-50"
              disabled={changing || currentStatus === 'desistente'}
              onClick={() => onChangeStatus('desistente')}
            >
              <PhoneOff className="w-3.5 h-3.5 mr-1" />
              {changing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Não Retornou'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
              disabled={changing || currentStatus === 'reprovado'}
              onClick={() => onChangeStatus('reprovado')}
            >
              <UserX className="w-3.5 h-3.5 mr-1" />
              {changing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Não Aprovado'}
            </Button>

            {/* Remover currículo */}
            {!confirmDelete ? (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-red-500 hover:text-red-700 hover:bg-red-50"
                disabled={deleting}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Remover
              </Button>
            ) : (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-red-600 font-medium">Confirmar remoção?</span>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white h-7 px-2.5 text-xs"
                  disabled={deleting}
                  onClick={onDeleteCandidate}
                >
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sim'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setConfirmDelete(false)}
                >
                  Não
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Sub-componentes helpers ───────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-muted-foreground block text-[11px]">{label}</span>
      <span className="font-medium text-[13px]">{value || '—'}</span>
    </div>
  )
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left"
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <CardContent className="px-4 pb-3 pt-0 border-t">
          {children}
        </CardContent>
      )}
    </Card>
  )
}

// Suppress unused import warning
const _unused = ChevronsUpDown
void _unused
