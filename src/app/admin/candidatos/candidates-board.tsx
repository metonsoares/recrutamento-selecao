'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { CandidateStatus } from '@/types'
import { formatDate, formatName } from '@/lib/helpers'
import { inferSex } from '@/lib/infer-sex'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { Search, SortAsc, GripVertical, BrainCircuit, Loader2, AlertCircle, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Idade a partir da data de nascimento ('YYYY-MM-DD' ou 'DD/MM/YYYY'). */
function ageFrom(birth?: string | null): number | null {
  if (!birth) return null
  let y = 0, m = 0, d = 0
  const iso = birth.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3] }
  else {
    const br = birth.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (!br) return null
    d = +br[1]; m = +br[2]; y = +br[3]
  }
  const t = new Date()
  let age = t.getFullYear() - y
  const mo = t.getMonth() + 1
  if (mo < m || (mo === m && t.getDate() < d)) age--
  return age >= 0 && age < 120 ? age : null
}

// ─── Colunas do Kanban ────────────────────────────────────────────────────────

const COLUMNS = [
  {
    key: 'novo',
    label: 'Novo Currículo',
    targetStatus: 'novo' as CandidateStatus,
    dot: 'bg-gray-400',
    header: 'bg-gray-50 border-gray-200',
    drop: 'bg-gray-100 border-gray-300',
    statuses: [
      'novo', 'pre_cadastro_whatsapp',
      'aguardando_formulario_experiencia', 'experiencia_preenchida',
      'aguardando_teste_cultural', 'teste_cultural_preenchido',
      'analise_ia_concluida',
    ],
  },
  {
    key: 'apto',
    label: 'Apto para Entrevista',
    targetStatus: 'apto_para_entrevista' as CandidateStatus,
    dot: 'bg-blue-500',
    header: 'bg-blue-50 border-blue-200',
    drop: 'bg-blue-100 border-blue-300',
    statuses: ['apto_para_entrevista'],
  },
  {
    key: 'agendada',
    label: 'Entrevista Agendada',
    targetStatus: 'entrevista_agendada' as CandidateStatus,
    dot: 'bg-purple-500',
    header: 'bg-purple-50 border-purple-200',
    drop: 'bg-purple-100 border-purple-300',
    statuses: ['entrevista_agendada', 'entrevistado'],
  },
  {
    key: 'aprovados',
    label: 'Aprovados',
    targetStatus: 'aprovado_processo' as CandidateStatus,
    dot: 'bg-green-600',
    header: 'bg-green-50 border-green-200',
    drop: 'bg-green-100 border-green-300',
    statuses: ['aprovado_processo'],
  },
  {
    key: 'aprovados_barraca',
    label: 'Aprovados - Barraca',
    targetStatus: 'aprovado_barraca' as CandidateStatus,
    dot: 'bg-teal-600',
    header: 'bg-teal-50 border-teal-200',
    drop: 'bg-teal-100 border-teal-300',
    statuses: ['aprovado_barraca'],
  },
  {
    key: 'aprovados_carrinho',
    label: 'Aprovados - Carrinho',
    targetStatus: 'aprovado_carrinho' as CandidateStatus,
    dot: 'bg-cyan-600',
    header: 'bg-cyan-50 border-cyan-200',
    drop: 'bg-cyan-100 border-cyan-300',
    statuses: ['aprovado_carrinho'],
  },
  {
    key: 'aprovado',
    label: 'Intermitentes',
    targetStatus: 'aprovado' as CandidateStatus,
    dot: 'bg-emerald-500',
    header: 'bg-emerald-50 border-emerald-200',
    drop: 'bg-emerald-100 border-emerald-300',
    statuses: ['aprovado', 'banco_de_talentos'],
  },
  {
    key: 'reprovado',
    label: 'Reprovado',
    targetStatus: 'reprovado' as CandidateStatus,
    dot: 'bg-red-400',
    header: 'bg-red-50 border-red-200',
    drop: 'bg-red-100 border-red-300',
    statuses: ['reprovado', 'desistente'],
  },
  {
    key: 'em_contrato',
    label: 'Em contrato',
    targetStatus: 'em_contrato' as CandidateStatus,
    dot: 'bg-teal-500',
    header: 'bg-teal-50 border-teal-300',
    drop: 'bg-teal-100 border-teal-400',
    statuses: ['em_contrato'],
  },
  {
    key: 'contratado',
    label: 'Contratado',
    targetStatus: 'contratado' as CandidateStatus,
    dot: 'bg-[#1a5c38]',
    header: 'bg-emerald-100 border-emerald-400',
    drop: 'bg-emerald-200 border-emerald-500',
    statuses: ['contratado'],
  },
  {
    key: 'freelancer',
    label: 'Freelancer',
    targetStatus: 'freelancer' as CandidateStatus,
    dot: 'bg-sky-500',
    header: 'bg-sky-50 border-sky-300',
    drop: 'bg-sky-100 border-sky-400',
    statuses: ['freelancer'],
  },
] as const

type ColKey = typeof COLUMNS[number]['key']
type SortOption = 'date_desc' | 'date_asc' | 'name' | 'score'

// Rótulos exibidos no gatilho de cada filtro (categoria quando "all"/padrão)
const AGE_LABELS: Record<string, string> = {
  all: 'Faixa etária', '18-24': '18 a 24 anos', '25-34': '25 a 34 anos',
  '35-44': '35 a 44 anos', '45-54': '45 a 54 anos', '55+': '55+ anos',
}
const SORT_LABELS: Record<SortOption, string> = {
  date_desc: 'Ordenação', date_asc: 'Data (antigo)', name: 'Nome A→Z', score: 'Nota (maior)',
}

// ─── Compatibilidade: borda esquerda + badge de nota ─────────────────────────

function scoreStyle(score: number | null | undefined): {
  border: string
  badgeClass: string | null
  label: string | null
} {
  if (score == null) return { border: 'border-l-gray-200', badgeClass: null, label: null }
  if (score >= 70) return {
    border: 'border-l-emerald-400',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    label: Math.round(score).toString(),
  }
  if (score >= 50) return {
    border: 'border-l-amber-400',
    badgeClass: 'bg-amber-100 text-amber-700',
    label: Math.round(score).toString(),
  }
  return {
    border: 'border-l-red-400',
    badgeClass: 'bg-red-100 text-red-700',
    label: Math.round(score).toString(),
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CandidateRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  city: string | null
  created_at: string
  previously_registered?: boolean
  birth_date?: string | null
  applications?: {
    id: string
    status: string
    job_id: string | null
    final_score: number | null
    culture_score: number | null
    created_at: string
    jobs?: { title: string } | { title: string }[] | null
  } | null
}

interface Props {
  candidates: CandidateRow[]
  jobs: Array<{ id: string; title: string }>
  columnOrder?: string[] | null
  settingsId?: string | null
  appJobTitleMap?: Record<string, string>
  role?: 'master' | 'gestor'
  canVerReprovados?: boolean
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CandidatesBoard({ candidates: initial, jobs, columnOrder, settingsId, appJobTitleMap = {}, role = 'master', canVerReprovados = true }: Props) {
  const isMaster = role === 'master'
  const router = useRouter()
  const [candidates, setCandidates] = useState<CandidateRow[]>(initial)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('date_desc')
  const [filterJob, setFilterJob] = useState('all')
  const [filterAge, setFilterAge] = useState('all')
  const [filterSex, setFilterSex] = useState('all')

  // ── Busca semântica por IA na coluna "Novo Currículo" ─────────────────────
  const [aiQuery, setAiQuery] = useState('')
  const [aiSearching, setAiSearching] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  // null = busca inativa; Map = resultado ativo (candidateId -> {score, reason})
  const [aiMatches, setAiMatches] = useState<Map<string, { score: number; reason: string }> | null>(null)
  const [aiQueryActive, setAiQueryActive] = useState('')

  async function handleAiSearch() {
    const q = aiQuery.trim()
    if (q.length < 3) { setAiError('Descreva o perfil desejado (mín. 3 caracteres).'); return }
    setAiSearching(true)
    setAiError(null)
    try {
      const res = await fetch('/api/admin/ai/search-curriculos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: q }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro na busca.')
      const map = new Map<string, { score: number; reason: string }>()
      for (const m of (data.matches || []) as Array<{ candidateId: string; score: number; reason: string }>) {
        map.set(m.candidateId, { score: m.score, reason: m.reason })
      }
      setAiMatches(map)
      setAiQueryActive(q)
    } catch (e) {
      setAiError((e as Error).message || 'Erro na busca.')
    } finally {
      setAiSearching(false)
    }
  }

  function clearAiSearch() {
    setAiMatches(null)
    setAiQueryActive('')
    setAiError(null)
  }

  // ── Drag state (candidatos) ───────────────────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<ColKey | null>(null)
  const [dropMsg, setDropMsg] = useState<string | null>(null)

  // ── Drag state (colunas) ──────────────────────────────────────────────────
  const [colOrder, setColOrder] = useState<string[]>(() => {
    if (columnOrder && columnOrder.length > 0) {
      return [
        ...columnOrder.filter(k => COLUMNS.some(c => c.key === k)),
        ...COLUMNS.map(c => c.key).filter(k => !columnOrder.includes(k)),
      ]
    }
    return COLUMNS.map(c => c.key)
  })
  const colDragKey = useRef<string | null>(null)
  const [colDragOverKey, setColDragOverKey] = useState<string | null>(null)
  const [isDraggingCol, setIsDraggingCol] = useState(false)

  // Colunas de colaboradores não aparecem no quadro de Candidatos
  // (têm menu próprio em "Colaboradores").
  const HIDDEN_COLUMNS = new Set(['contratado', 'em_contrato', 'aprovado', 'freelancer'])

  // ── orderedColumns a partir do estado local ───────────────────────────────
  // Esconde "Reprovado" para perfis sem a permissão candidatos.ver_reprovados.
  const orderedColumns = colOrder
    .map(key => COLUMNS.find(c => c.key === key))
    .filter((c): c is typeof COLUMNS[number] =>
      c !== undefined && !HIDDEN_COLUMNS.has(c.key) && (canVerReprovados || c.key !== 'reprovado'))

  // ── Salva ordem das colunas no banco ──────────────────────────────────────
  async function saveColumnOrder(order: string[]) {
    const supabase = createSupabaseBrowserClient()
    if (settingsId) {
      await supabase
        .from('ai_settings')
        .update({ kanban_column_order: order, updated_at: new Date().toISOString() })
        .eq('id', settingsId)
    } else {
      await supabase
        .from('ai_settings')
        .insert({ kanban_column_order: order })
    }
  }

  // ── Handlers drag de coluna ───────────────────────────────────────────────
  function onColDragStart(e: React.DragEvent, key: string) {
    if (!isMaster) { e.preventDefault(); return }
    colDragKey.current = key
    setIsDraggingCol(true)
    e.dataTransfer.setData('text/column', key)
    e.dataTransfer.effectAllowed = 'move'
    e.stopPropagation()
  }

  function onColDragOver(e: React.DragEvent, key: string) {
    if (!colDragKey.current) return
    e.preventDefault()
    e.stopPropagation()
    setColDragOverKey(key)
  }

  function onColDrop(e: React.DragEvent, targetKey: string) {
    const sourceKey = e.dataTransfer.getData('text/column')
    if (!sourceKey) return
    e.preventDefault()
    e.stopPropagation()

    if (sourceKey !== targetKey) {
      setColOrder(prev => {
        const next = [...prev]
        const fromIdx = next.indexOf(sourceKey)
        const toIdx = next.indexOf(targetKey)
        if (fromIdx !== -1 && toIdx !== -1) {
          next.splice(fromIdx, 1)
          next.splice(toIdx, 0, sourceKey)
        }
        saveColumnOrder(next)
        return next
      })
    }

    colDragKey.current = null
    setColDragOverKey(null)
    setIsDraggingCol(false)
  }

  function onColDragEnd() {
    colDragKey.current = null
    setColDragOverKey(null)
    setIsDraggingCol(false)
  }

  // ── Filtragem + ordenação ─────────────────────────────────────────────────
  const getItems = useCallback((statuses: readonly string[]) => {
    return candidates
      .filter(c => statuses.includes(c.applications?.status ?? 'novo'))
      // Busca por IA ativa: mantém apenas os currículos que casaram com a descrição
      .filter(c => !aiMatches || aiMatches.has(c.id))
      .filter(c => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return [c.full_name, c.phone, c.email, c.city].join(' ').toLowerCase().includes(q)
      })
      .filter(c => {
        if (filterJob === 'all') return true
        return (c.applications as Record<string, unknown> | null | undefined)?.job_id === filterJob
      })
      .filter(c => {
        if (filterAge === 'all') return true
        const age = ageFrom(c.birth_date)
        if (age == null) return false
        if (filterAge === '55+') return age >= 55
        const [lo, hi] = filterAge.split('-').map(Number)
        return age >= lo && age <= hi
      })
      .filter(c => {
        if (filterSex === 'all') return true
        return inferSex(c.full_name) === filterSex
      })
      .sort((a, b) => {
        // Com busca por IA ativa, ordena pelo grau de aderência (maior primeiro)
        if (aiMatches) return (aiMatches.get(b.id)?.score ?? 0) - (aiMatches.get(a.id)?.score ?? 0)
        if (sortBy === 'name') return a.full_name.localeCompare(b.full_name, 'pt-BR')
        if (sortBy === 'score') return (b.applications?.final_score ?? -1) - (a.applications?.final_score ?? -1)
        if (sortBy === 'date_asc') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [candidates, search, filterJob, filterAge, filterSex, sortBy, aiMatches])

  // ── Drag & Drop (candidatos) ──────────────────────────────────────────────
  async function handleDrop(candidateId: string, targetStatus: CandidateStatus) {
    const candidate = candidates.find(c => c.id === candidateId)
    const appId = candidate?.applications?.id
    if (!appId) return
    const currentStatus = candidate?.applications?.status
    if (currentStatus === targetStatus) return

    // Recrutador: pode mudar status, MAS não pode mexer em candidatos contratados
    // (nem mover um candidato PARA contratado). Apenas Master pode.
    if (!isMaster) {
      if (currentStatus === 'contratado' || targetStatus === 'contratado') {
        setDropMsg('Apenas o administrador master pode alterar candidatos contratados.')
        setTimeout(() => setDropMsg(null), 4000)
        return
      }
    }

    setCandidates(prev => prev.map(c =>
      c.id === candidateId && c.applications
        ? { ...c, applications: { ...c.applications, status: targetStatus } }
        : c
    ))

    let ok = false
    try {
      const res = await fetch(`/api/admin/applications/${appId}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      })
      const d = await res.json().catch(() => ({}))
      ok = res.ok && d.ok
    } catch { ok = false }

    if (!ok) {
      const prevStatus = candidate!.applications!.status
      setCandidates(prev => prev.map(c =>
        c.id === candidateId && c.applications
          ? { ...c, applications: { ...c.applications, status: prevStatus } }
          : c
      ))
    }
  }

  const total = orderedColumns.flatMap(col => getItems(col.statuses)).length

  // ── Migração: preenche job_id a partir de form_answers (roda 1x no mount) ──
  useEffect(() => {
    fetch('/api/admin/candidatos/fix-job-ids', { method: 'POST' })
      .then(r => r.json())
      .then(data => { if (data.fixed > 0) router.refresh() })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Análise em lote ───────────────────────────────────────────────────────
  const pendingCount = candidates.filter(c => c.applications?.final_score == null).length
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null)

  async function handleAnalyzePending() {
    setAnalyzing(true)
    setAnalyzeMsg(null)
    try {
      const res = await fetch('/api/admin/ai/analyze-pending', { method: 'POST' })
      const data = await res.json()
      if (data.queued === 0) {
        setAnalyzeMsg('Nenhum candidato pendente encontrado.')
      } else {
        setAnalyzeMsg(`${data.queued} análise${data.queued !== 1 ? 's' : ''} iniciada${data.queued !== 1 ? 's' : ''}. Os resultados aparecem em instantes.`)
      }
    } catch {
      setAnalyzeMsg('Erro ao iniciar análises.')
    } finally {
      setAnalyzing(false)
      setTimeout(() => setAnalyzeMsg(null), 6000)
    }
  }

  return (
    <div className="p-4 sm:p-6 flex flex-col h-[calc(100vh-56px)] gap-4">

      {/* Toast de análise em lote */}
      {analyzeMsg && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium bg-emerald-600 text-white max-w-sm">
          <BrainCircuit className="w-4 h-4 shrink-0" />
          {analyzeMsg}
        </div>
      )}

      {/* Toast bloqueio de contratado */}
      {dropMsg && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium bg-amber-600 text-white max-w-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {dropMsg}
        </div>
      )}

      {/* Cabeçalho */}
      <div className="shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Candidatos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total} candidato{total !== 1 ? 's' : ''}{search || filterJob !== 'all' || filterAge !== 'all' || filterSex !== 'all' ? ' filtrados' : ' no total'}
          </p>
        </div>
        {isMaster && pendingCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleAnalyzePending}
            disabled={analyzing}
            className="gap-1.5 shrink-0 mt-0.5 border-purple-300 text-purple-700 hover:bg-purple-50"
            title="Executar análise IA para todos os candidatos sem pontuação"
          >
            {analyzing
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analisando...</>
              : <><BrainCircuit className="w-3.5 h-3.5" />Analisar pendentes ({pendingCount})</>
            }
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 shrink-0">
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
            <span className="line-clamp-1 text-left flex-1">{filterJob === 'all' ? 'Vagas' : (jobs.find(j => j.id === filterJob)?.title ?? 'Vagas')}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as vagas</SelectItem>
            {jobs.map(j => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAge} onValueChange={v => v && setFilterAge(v)}>
          <SelectTrigger className="w-[150px]">
            <span className="line-clamp-1 text-left flex-1">{AGE_LABELS[filterAge] ?? 'Faixa etária'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as idades</SelectItem>
            <SelectItem value="18-24">18 a 24 anos</SelectItem>
            <SelectItem value="25-34">25 a 34 anos</SelectItem>
            <SelectItem value="35-44">35 a 44 anos</SelectItem>
            <SelectItem value="45-54">45 a 54 anos</SelectItem>
            <SelectItem value="55+">55+ anos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSex} onValueChange={v => v && setFilterSex(v)}>
          <SelectTrigger className="w-[140px]">
            <span className="line-clamp-1 text-left flex-1">{filterSex === 'F' ? 'Feminino' : filterSex === 'M' ? 'Masculino' : 'Sexo'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Ambos os sexos</SelectItem>
            <SelectItem value="F">Feminino</SelectItem>
            <SelectItem value="M">Masculino</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => v && setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[160px]">
            <SortAsc className="w-4 h-4 mr-1.5 text-muted-foreground" />
            <span className="line-clamp-1 text-left flex-1">{SORT_LABELS[sortBy] ?? 'Ordenação'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Data (recente)</SelectItem>
            <SelectItem value="date_asc">Data (antigo)</SelectItem>
            <SelectItem value="name">Nome A→Z</SelectItem>
            <SelectItem value="score">Nota (maior)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Busca semântica por IA (coluna "Novo Currículo") */}
      <div className="shrink-0 space-y-2">
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="relative flex-1 min-w-[260px]">
            <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500" />
            <Input
              className="pl-9 border-purple-200 focus-visible:ring-purple-400"
              placeholder="Descreva o currículo que procura (ex.: experiência como cozinheiro e disponibilidade noturna)..."
              value={aiQuery}
              onChange={e => { setAiQuery(e.target.value); setAiError(null) }}
              onKeyDown={e => { if (e.key === 'Enter' && !aiSearching) handleAiSearch() }}
            />
          </div>
          <Button
            onClick={handleAiSearch}
            disabled={aiSearching || aiQuery.trim().length < 3}
            className="gap-1.5 shrink-0 bg-purple-600 hover:bg-purple-700 text-white"
            title="Buscar currículos com IA na coluna Novo Currículo"
          >
            {aiSearching
              ? <><Loader2 className="w-4 h-4 animate-spin" />Buscando...</>
              : <><Sparkles className="w-4 h-4" />Buscar com IA</>
            }
          </Button>
          {aiMatches && (
            <Button variant="outline" onClick={clearAiSearch} className="gap-1.5 shrink-0" title="Limpar busca por IA">
              <X className="w-4 h-4" />Limpar
            </Button>
          )}
        </div>
        {aiError && (
          <p className="text-[12px] text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />{aiError}</p>
        )}
        {aiMatches && !aiError && (
          <p className="text-[12px] text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span><strong>{aiMatches.size}</strong> currículo{aiMatches.size !== 1 ? 's' : ''} compatíve{aiMatches.size !== 1 ? 'is' : 'l'} com: <em>“{aiQueryActive}”</em></span>
          </p>
        )}
      </div>

      {/* Legenda de compatibilidade */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground shrink-0">
        <span className="font-medium text-[11px] text-gray-500">Compatibilidade:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-400 inline-block" />Alta (≥70)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-400 inline-block" />Média (50–69)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-400 inline-block" />Baixa (&lt;50)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-200 border inline-block" />Não analisado
        </span>
      </div>

      {/* ── Colunas Kanban ── */}
      <div className="flex gap-3 overflow-x-auto pb-3 flex-1 min-h-0">
        {orderedColumns.map(col => {
          const items = getItems(col.statuses)
          const isCardOver = !isDraggingCol && dragOverCol === col.key
          const isColOver = isDraggingCol && colDragOverKey === col.key && colDragKey.current !== col.key
          const isColDragging = colDragKey.current === col.key

          return (
            <div
              key={col.key}
              className={[
                'flex flex-col shrink-0 w-[240px] transition-all duration-150',
                isColDragging ? 'opacity-40 scale-[0.97]' : '',
                isColOver ? 'ring-2 ring-primary/40 rounded-xl' : '',
              ].join(' ')}
              onDragOver={e => {
                e.preventDefault()
                if (isDraggingCol) {
                  setColDragOverKey(col.key)
                } else {
                  setDragOverCol(col.key)
                }
              }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  if (isDraggingCol) setColDragOverKey(null)
                  else setDragOverCol(null)
                }
              }}
              onDrop={e => {
                // tenta primeiro drop de coluna
                const colKey = e.dataTransfer.getData('text/column')
                if (colKey) {
                  onColDrop(e, col.key)
                  return
                }
                // senão, drop de candidato
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain')
                if (id) handleDrop(id, col.targetStatus)
                setDragOverCol(null)
                setDragId(null)
              }}
            >
              {/* ── Cabeçalho da coluna (arrastável) ── */}
              <div
                draggable
                onDragStart={e => onColDragStart(e, col.key)}
                onDragOver={e => onColDragOver(e, col.key)}
                onDrop={e => onColDrop(e, col.key)}
                onDragEnd={onColDragEnd}
                title="Arraste para reordenar a coluna"
                className={[
                  'flex items-center justify-between px-3 py-2 rounded-t-xl border select-none',
                  isMaster ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                  col.header,
                  isColOver ? 'border-primary/40' : '',
                ].join(' ')}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${col.dot}`} />
                  <span className="text-[11px] font-semibold text-[#333] truncate">{col.label}</span>
                </div>
                <span className="text-[11px] font-mono bg-white/80 border px-1.5 py-0.5 rounded-full text-[#666] shrink-0 ml-1">
                  {items.length}
                </span>
              </div>

              {/* Área de drop (candidatos) */}
              <div className={[
                'flex-1 space-y-2 border border-t-0 rounded-b-xl p-2 overflow-y-auto transition-all duration-150',
                isCardOver
                  ? `${col.drop} border-dashed`
                  : 'bg-[#f8f9fb]',
              ].join(' ')}>

                {isCardOver && (
                  <div className="border-2 border-dashed border-primary/30 rounded-lg h-14 flex items-center justify-center">
                    <p className="text-xs text-primary/50 font-medium">Solte aqui</p>
                  </div>
                )}

                {items.length === 0 && !isCardOver && (
                  <p className="text-center text-xs text-muted-foreground/60 py-8">
                    Nenhum candidato
                  </p>
                )}

                {items.map(c => {
                  // Recrutador não pode arrastar candidatos contratados
                  const lockedForRecruiter = !isMaster && c.applications?.status === 'contratado'
                  return (
                    <CandidateCard
                      key={c.id}
                      candidate={c}
                      isDragging={dragId === c.id}
                      draggable={!lockedForRecruiter}
                      jobTitleFallback={c.applications?.id ? appJobTitleMap[c.applications.id] : undefined}
                      aiMatch={aiMatches?.get(c.id) ?? null}
                      onDragStart={() => setDragId(c.id)}
                      onDragEnd={() => { setDragId(null); setDragOverCol(null) }}
                      onClick={() => router.push(`/admin/candidatos/${c.id}`)}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Card do candidato ────────────────────────────────────────────────────────

function CandidateCard({
  candidate: c,
  isDragging,
  draggable = true,
  jobTitleFallback,
  aiMatch = null,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  candidate: CandidateRow
  isDragging: boolean
  draggable?: boolean
  jobTitleFallback?: string
  aiMatch?: { score: number; reason: string } | null
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}) {
  const { border, badgeClass, label } = scoreStyle(c.applications?.final_score)
  const rawJobs = (c.applications as Record<string, unknown> | null | undefined)?.jobs
  const jobTitleFromJoin = Array.isArray(rawJobs)
    ? (rawJobs[0] as { title?: string } | undefined)?.title
    : (rawJobs as { title?: string } | null)?.title
  const jobTitle = jobTitleFromJoin || jobTitleFallback
  const isReprovado = c.applications?.status === 'reprovado'

  return (
    <div
      draggable={draggable}
      onDragStart={e => {
        if (!draggable) { e.preventDefault(); return }
        e.dataTransfer.setData('text/plain', c.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
        e.stopPropagation()
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={[
        'border border-l-4 rounded-lg px-3 py-2.5 shadow-sm',
        isReprovado ? 'bg-red-50 hover:bg-red-100/70' : 'bg-white',
        'hover:shadow-md transition-all select-none cursor-pointer',
        border,
        isDragging ? 'opacity-40 scale-95 rotate-1' : 'opacity-100',
      ].join(' ')}
    >
      {/* Nome + badge de nota */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0 flex-1">
          <GripVertical className="w-3 h-3 text-muted-foreground/30 shrink-0 mt-0.5 cursor-grab" />
          <div className="min-w-0">
            <p className="font-semibold text-[13px] text-[#1a1a1a] truncate leading-tight">{formatName(c.full_name)}</p>
            {jobTitle && (
              <p className="text-[11px] text-muted-foreground truncate">{jobTitle}</p>
            )}
            {c.previously_registered && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 mt-0.5">
                Já cadastrado antes
              </span>
            )}
          </div>
        </div>
        {badgeClass && label ? (
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 ${badgeClass}`}>
            {label}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/40 shrink-0 mt-0.5">—</span>
        )}
      </div>

      {/* Data */}
      <div className="mt-1 pl-5">
        <p className="text-[10px] text-muted-foreground">{formatDate(c.created_at)}</p>
      </div>

      {/* Aderência da busca por IA */}
      {aiMatch && (
        <div className="mt-1.5 pl-5">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-1.5 py-0.5">
              <Sparkles className="w-2.5 h-2.5" />{aiMatch.score}% aderência
            </span>
          </div>
          {aiMatch.reason && (
            <p className="text-[10px] text-muted-foreground italic mt-0.5 leading-snug">{aiMatch.reason}</p>
          )}
        </div>
      )}
    </div>
  )
}
