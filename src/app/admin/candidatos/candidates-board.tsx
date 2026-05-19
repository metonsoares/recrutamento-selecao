'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CandidateStatus } from '@/types'
import { formatDate } from '@/lib/helpers'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { Search, SortAsc, GripVertical } from 'lucide-react'

// ─── Colunas do Kanban ────────────────────────────────────────────────────────

const COLUMNS = [
  {
    key: 'novo',
    label: 'Novo Currículo',
    targetStatus: 'novo' as CandidateStatus,
    dot: 'bg-gray-400',
    header: 'bg-gray-50 border-gray-200',
    drop: 'bg-gray-100 border-gray-300',
    // todos os status "em andamento" caem aqui
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
    key: 'aprovado',
    label: 'Aprovado',
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
    key: 'contratado',
    label: 'Contratado',
    targetStatus: 'contratado' as CandidateStatus,
    dot: 'bg-[#1a5c38]',
    header: 'bg-emerald-100 border-emerald-400',
    drop: 'bg-emerald-200 border-emerald-500',
    statuses: ['contratado'],
  },
] as const

type ColKey = typeof COLUMNS[number]['key']
type SortOption = 'date_desc' | 'date_asc' | 'name' | 'score'

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
  applications?: {
    id: string
    status: string
    final_score: number | null
    culture_score: number | null
    created_at: string
    jobs?: { title: string } | null
  } | null
}

interface Props {
  candidates: CandidateRow[]
  jobs: Array<{ id: string; title: string }>
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CandidatesBoard({ candidates: initial, jobs }: Props) {
  const router = useRouter()
  const [candidates, setCandidates] = useState<CandidateRow[]>(initial)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('date_desc')
  const [filterJob, setFilterJob] = useState('all')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<ColKey | null>(null)

  // ── Filtragem + ordenação ────────────────────────────────────────────────
  const getItems = useCallback((statuses: readonly string[]) => {
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
        if (sortBy === 'score') return (b.applications?.final_score ?? -1) - (a.applications?.final_score ?? -1)
        if (sortBy === 'date_asc') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [candidates, search, filterJob, sortBy])

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  async function handleDrop(candidateId: string, targetStatus: CandidateStatus) {
    const candidate = candidates.find(c => c.id === candidateId)
    const appId = candidate?.applications?.id
    if (!appId) return
    if (candidate?.applications?.status === targetStatus) return

    // Atualização otimista
    setCandidates(prev => prev.map(c =>
      c.id === candidateId && c.applications
        ? { ...c, applications: { ...c.applications, status: targetStatus } }
        : c
    ))

    // Persistir no banco
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase
      .from('applications')
      .update({ status: targetStatus, updated_at: new Date().toISOString() })
      .eq('id', appId)

    if (error) {
      // Reverter em caso de erro
      const prevStatus = candidate!.applications!.status
      setCandidates(prev => prev.map(c =>
        c.id === candidateId && c.applications
          ? { ...c, applications: { ...c.applications, status: prevStatus } }
          : c
      ))
    }
  }

  const total = COLUMNS.flatMap(col => getItems(col.statuses)).length

  return (
    <div className="p-4 sm:p-6 flex flex-col h-[calc(100vh-56px)] gap-4">

      {/* Cabeçalho */}
      <div className="shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold">Candidatos</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {total} candidato{total !== 1 ? 's' : ''}{search || filterJob !== 'all' ? ' filtrados' : ' no total'}
        </p>
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
            <SelectValue placeholder="Vaga" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as vagas</SelectItem>
            {jobs.map(j => <SelectItem key={j.id} value={j.title}>{j.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => v && setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[160px]">
            <SortAsc className="w-4 h-4 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Data (recente)</SelectItem>
            <SelectItem value="date_asc">Data (antigo)</SelectItem>
            <SelectItem value="name">Nome A→Z</SelectItem>
            <SelectItem value="score">Nota (maior)</SelectItem>
          </SelectContent>
        </Select>
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
        {COLUMNS.map(col => {
          const items = getItems(col.statuses)
          const isOver = dragOverCol === col.key

          return (
            <div
              key={col.key}
              className="flex flex-col shrink-0 w-[240px]"
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverCol(null)
                }
              }}
              onDrop={e => {
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain')
                if (id) handleDrop(id, col.targetStatus)
                setDragOverCol(null)
                setDragId(null)
              }}
            >
              {/* Cabeçalho da coluna */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border ${col.header}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${col.dot}`} />
                  <span className="text-[11px] font-semibold text-[#333] truncate">{col.label}</span>
                </div>
                <span className="text-[11px] font-mono bg-white/80 border px-1.5 py-0.5 rounded-full text-[#666] shrink-0 ml-1">
                  {items.length}
                </span>
              </div>

              {/* Área de drop */}
              <div className={[
                'flex-1 space-y-2 border border-t-0 rounded-b-xl p-2 overflow-y-auto transition-all duration-150',
                isOver
                  ? `${col.drop} border-dashed`
                  : 'bg-[#f8f9fb]',
              ].join(' ')}>

                {/* Placeholder de drop */}
                {isOver && (
                  <div className="border-2 border-dashed border-primary/30 rounded-lg h-14 flex items-center justify-center">
                    <p className="text-xs text-primary/50 font-medium">Solte aqui</p>
                  </div>
                )}

                {/* Mensagem vazia */}
                {items.length === 0 && !isOver && (
                  <p className="text-center text-xs text-muted-foreground/60 py-8">
                    Nenhum candidato
                  </p>
                )}

                {/* Cards */}
                {items.map(c => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    isDragging={dragId === c.id}
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => { setDragId(null); setDragOverCol(null) }}
                    onClick={() => router.push(`/admin/candidatos/${c.id}`)}
                  />
                ))}
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
  onDragStart,
  onDragEnd,
  onClick,
}: {
  candidate: CandidateRow
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}) {
  const { border, badgeClass, label } = scoreStyle(c.applications?.final_score)
  const jobTitle = (c.applications?.jobs as { title?: string } | null)?.title

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', c.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={[
        'bg-white border border-l-4 rounded-lg px-3 py-2.5 shadow-sm',
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
            <p className="font-semibold text-[13px] text-[#1a1a1a] truncate leading-tight">{c.full_name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{c.phone || c.email || '—'}</p>
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

      {/* Vaga + data */}
      <div className="mt-1.5 pl-4.5 space-y-0.5">
        {jobTitle && (
          <p className="text-[10px] text-muted-foreground truncate">{jobTitle}</p>
        )}
        <p className="text-[10px] text-muted-foreground">{formatDate(c.created_at)}</p>
      </div>
    </div>
  )
}
