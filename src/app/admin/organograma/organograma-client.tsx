'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Network, Plus, Building2, Store, Factory, Briefcase, Users,
  Pencil, X, Loader2, AlertCircle, UserPlus, FolderPlus, Search,
  ChevronDown, ChevronRight, CornerDownRight, ChevronsDownUp, ChevronsUpDown,
  GripVertical, Crown, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName } from '@/lib/helpers'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Unidade {
  id: string
  parent_id: string | null
  tipo: 'holding' | 'empresa' | 'unidade' | 'area'
  nome: string
  company_id: string | null
  /** Estabelecimentos (CNPJs) que a unidade engloba — ex.: matriz + filial juntas. */
  company_ids: string[] | null
  divisao: string | null
  matriz: boolean
  escopo: 'local' | 'grupo'
  /** Pessoa a quem este setor responde (ex.: Produção responde à Supervisora Comercial). */
  responsavel_no_id: string | null
  ordem: number
}

export interface No {
  id: string
  unidade_id: string
  reporta_a: string | null
  candidate_id: string | null
  nome: string
  cargo: string | null
  foto_url: string | null
  nivel: string | null
  ordem: number
}

export interface ColaboradorOpcao {
  candidate_id: string
  nome: string
  cargo: string | null
  company_id: string | null
  foto_url: string | null
  /** contratado (CLT) ou intermitente (status "aprovado" no app) */
  vinculo: 'contratado' | 'intermitente'
}

/** Selo do vínculo — só aparece para quem não é CLT padrão. */
function SeloVinculo({ vinculo }: { vinculo?: string }) {
  if (vinculo !== 'intermitente') return null
  return (
    <span className="text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-sky-100 text-sky-700 shrink-0">
      Intermitente
    </span>
  )
}

type Vista = 'juridica' | 'operacional'
type Arrasto =
  | { tipo: 'novo'; candidateId: string; nome: string }
  | { tipo: 'no'; noId: string; nome: string }
  | { tipo: 'unidade'; unidadeId: string; nome: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

const ICONE_DIVISAO: Record<string, React.ElementType> = {
  'Fábrica': Factory,
  'Lojas': Store,
  'Restaurante do Ton': Briefcase,
  'Backoffice': Users,
}

function iconeDe(u: Unidade): React.ElementType {
  if (u.tipo === 'area') return Users
  return ICONE_DIVISAO[u.divisao ?? ''] ?? Building2
}

function Avatar({ nome, foto, size = 28 }: { nome: string; foto?: string | null; size?: number }) {
  if (foto) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={foto} alt={nome}
        className="rounded-full object-cover shrink-0 bg-gray-100"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className="rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {iniciais(nome)}
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function OrganogramaClient({
  unidades, nos, colaboradores, fotos, vinculos, podeEditar,
}: {
  unidades: Unidade[]
  nos: No[]
  colaboradores: ColaboradorOpcao[]
  fotos: Record<string, string>
  vinculos: Record<string, string>
  podeEditar: boolean
}) {
  const router = useRouter()
  const [vista, setVista] = useState<Vista>('juridica')
  const [addOpen, setAddOpen] = useState(false)
  const [areaOpen, setAreaOpen] = useState(false)
  const [editando, setEditando] = useState<No | null>(null)
  const [lideranca, setLideranca] = useState<No | null>(null)
  const [setor, setSetor] = useState<Unidade | null>(null)
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set())
  const [pessoasRecolhidas, setPessoasRecolhidas] = useState<Set<string>>(new Set())
  const [arrastando, setArrastando] = useState<Arrasto | null>(null)
  const [alvoHover, setAlvoHover] = useState<string | null>(null)
  const [soltando, setSoltando] = useState(false)
  const [erroDrop, setErroDrop] = useState('')

  const holding = unidades.find(u => u.tipo === 'holding') ?? null

  const nosPorUnidade = useMemo(() => {
    const m = new Map<string, No[]>()
    for (const n of nos) {
      const arr = m.get(n.unidade_id) ?? []
      arr.push(n)
      m.set(n.unidade_id, arr)
    }
    return m
  }, [nos])

  const porId = useMemo(() => new Map(nos.map(n => [n.id, n])), [nos])
  const unidadePorId = useMemo(() => new Map(unidades.map(u => [u.id, u])), [unidades])
  const noPorCandidato = useMemo(
    () => new Map(nos.filter(n => n.candidate_id).map(n => [n.candidate_id as string, n])),
    [nos],
  )

  /** Subordinados que estão em OUTRA unidade (link cruzado). */
  const subordinadosExternos = useMemo(() => {
    const m = new Map<string, No[]>()
    for (const n of nos) {
      if (!n.reporta_a) continue
      const chefe = porId.get(n.reporta_a)
      if (!chefe || chefe.unidade_id === n.unidade_id) continue
      const arr = m.get(chefe.id) ?? []
      arr.push(n)
      m.set(chefe.id, arr)
    }
    return m
  }, [nos, porId])

  const diretoria = holding ? (nosPorUnidade.get(holding.id) ?? []) : []
  const unidadesOperacionais = unidades.filter(u => u.tipo === 'unidade')

  const gruposJuridicos = unidades
    .filter(u => u.tipo === 'empresa')
    .map(e => ({
      chave: e.id, titulo: e.nome, legenda: 'Empresa (CNPJ próprio)',
      unidades: unidadesOperacionais.filter(u => u.parent_id === e.id),
    }))

  const divisoes = Array.from(new Set(unidadesOperacionais.map(u => u.divisao).filter(Boolean) as string[]))
  const gruposOperacionais = divisoes.map(d => ({
    chave: d, titulo: d, legenda: 'Divisão do grupo',
    unidades: unidadesOperacionais.filter(u => u.divisao === d),
  }))

  const grupos = vista === 'juridica' ? gruposJuridicos : gruposOperacionais

  const alternarCaixa = (id: string) => setRecolhidas(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const alternarPessoa = (id: string) => setPessoasRecolhidas(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const todasCaixas = unidades.filter(u => u.tipo === 'unidade' || u.tipo === 'area').map(u => u.id)
  const tudoRecolhido = recolhidas.size >= todasCaixas.length && todasCaixas.length > 0

  /** Soltar um colaborador dentro de uma unidade/área. */
  async function soltarEm(unidadeId: string) {
    if (!arrastando || soltando) return
    if (arrastando.tipo === 'unidade' && arrastando.unidadeId === unidadeId) {
      setArrastando(null); setAlvoHover(null); return
    }
    setSoltando(true); setErroDrop('')
    try {
      const novo = arrastando.tipo === 'novo'
      const corpo =
        arrastando.tipo === 'novo' ? { candidate_id: arrastando.candidateId, unidade_id: unidadeId }
        : arrastando.tipo === 'no' ? { id: arrastando.noId, unidade_id: unidadeId }
        : { acao: 'mover_unidade', unidade_id: arrastando.unidadeId, parent_id: unidadeId }
      const res = await fetch('/api/admin/organograma', {
        method: novo ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Não foi possível mover.')
      router.refresh()
    } catch (e) {
      setErroDrop((e as Error).message)
    } finally {
      setSoltando(false); setArrastando(null); setAlvoHover(null)
    }
  }

  const alocados = new Set(nos.map(n => n.candidate_id).filter(Boolean) as string[])

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto">

      {/* ── Cabeçalho ── */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Network className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold leading-tight">Organograma</h1>
          <p className="text-sm text-muted-foreground">
            {holding?.nome ?? 'Grupo'} — {nos.length} na estrutura · {colaboradores.length - alocados.size} sem alocação
          </p>
        </div>
        {podeEditar && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setAreaOpen(true)} className="gap-1.5">
              <FolderPlus className="w-3.5 h-3.5" />Nova área
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="w-4 h-4" />Adicionar colaborador
            </Button>
          </div>
        )}
      </div>

      {/* ── Controles ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">
          {([
            { v: 'juridica' as Vista, label: 'Por empresa', hint: 'CNPJ' },
            { v: 'operacional' as Vista, label: 'Por divisão', hint: 'Operação' },
          ]).map(o => (
            <button key={o.v} onClick={() => setVista(o.v)}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${
                vista === o.v ? 'bg-primary text-primary-foreground' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              {o.label}
              <span className={`ml-1.5 text-[10px] font-medium ${vista === o.v ? 'text-primary-foreground/70' : 'text-gray-400'}`}>
                {o.hint}
              </span>
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm"
          onClick={() => setRecolhidas(tudoRecolhido ? new Set() : new Set(todasCaixas))} className="gap-1.5">
          {tudoRecolhido ? <ChevronsUpDown className="w-3.5 h-3.5" /> : <ChevronsDownUp className="w-3.5 h-3.5" />}
          {tudoRecolhido ? 'Expandir tudo' : 'Recolher tudo'}
        </Button>
        {erroDrop && (
          <span className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{erroDrop}</span>
        )}
      </div>

      {/* ── Layout: organograma + painel lateral ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">

        <div className="space-y-5 min-w-0">
          {/* Holding + diretoria */}
          {holding && (
            <div className="flex flex-col items-center">
              <div
                onDragOver={e => { if (arrastando) { e.preventDefault(); setAlvoHover(holding.id) } }}
                onDragLeave={() => setAlvoHover(null)}
                onDrop={e => { e.preventDefault(); soltarEm(holding.id) }}
                className={`rounded-2xl border-2 bg-gradient-to-br from-[#1a5c38] to-[#2d7a4f] text-white px-5 py-4 shadow-sm text-center min-w-[240px] max-w-full transition-all ${
                  alvoHover === holding.id ? 'border-amber-300 ring-4 ring-amber-200/50 scale-[1.02]' : 'border-primary/30'
                }`}
              >
                <p className="text-[10px] uppercase tracking-widest text-emerald-100/80 font-semibold">Holding</p>
                <p className="text-lg font-bold leading-tight">{holding.nome}</p>
                {diretoria.length > 0 && (
                  <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
                    {diretoria.map(d => (
                      <div key={d.id} className="flex items-center gap-2 bg-white/10 rounded-xl px-2.5 py-1.5 backdrop-blur group">
                        <Avatar nome={d.nome} foto={d.candidate_id ? fotos[d.candidate_id] : d.foto_url} size={32} />
                        <button onClick={() => podeEditar && setLideranca(d)} className="text-left">
                          <span className="block text-[13px] font-semibold leading-tight">{formatName(d.nome)}</span>
                          <span className="block text-[10px] text-emerald-100/80">{d.cargo ?? '—'}</span>
                        </button>
                        {podeEditar && (
                          <button onClick={() => setEditando(d)} title="Editar"
                            className="p-1 hover:bg-white/20 rounded">
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="w-px h-6 bg-gray-300" />
            </div>
          )}

          {/* Grupos */}
          <div className="columns-1 lg:columns-2 gap-4">
            {grupos.map(g => (
              <div key={g.chave} className="rounded-2xl border bg-gray-50/70 p-3 space-y-3 mb-4 break-inside-avoid">
                <div className="px-1">
                  <p className="text-sm font-bold text-gray-800 leading-tight">{g.titulo}</p>
                  <p className="text-[11px] text-muted-foreground">{g.legenda}</p>
                </div>

                {g.unidades.map(u => {
                  const props = {
                    porId, unidadePorId, subordinadosExternos, fotos, vinculos,
                    pessoasRecolhidas, onAlternarPessoa: alternarPessoa,
                    podeEditar, onEditar: setEditando, onLideranca: setLideranca,
                    arrastando, alvoHover, setAlvoHover, onSoltar: soltarEm, setArrastando,
                    onSetor: setSetor,
                  }
                  return (
                    <div key={u.id} className="space-y-2">
                      <UnidadeCard
                        unidade={u} pessoas={nosPorUnidade.get(u.id) ?? []}
                        recolhida={recolhidas.has(u.id)} onAlternar={() => alternarCaixa(u.id)}
                        {...props}
                      />
                      <SetoresFilhos
                        parentId={u.id} unidades={unidades} nosPorUnidade={nosPorUnidade}
                        recolhidas={recolhidas} onAlternarCaixa={alternarCaixa} props={props}
                      />
                    </div>
                  )
                })}
                {g.unidades.length === 0 && (
                  <p className="text-[12px] text-muted-foreground px-1 pb-1">Sem unidades nesta divisão.</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Painel lateral: todos os colaboradores ── */}
        <PainelColaboradores
          colaboradores={colaboradores} noPorCandidato={noPorCandidato} unidadePorId={unidadePorId}
          podeEditar={podeEditar} soltando={soltando}
          onArrastar={setArrastando} onFimArrasto={() => { setArrastando(null); setAlvoHover(null) }}
        />
      </div>

      {/* ── Modais ── */}
      {addOpen && (
        <ModalColaborador unidades={unidades} nos={nos}
          disponiveis={colaboradores.filter(c => !alocados.has(c.candidate_id))}
          onClose={() => setAddOpen(false)} />
      )}
      {areaOpen && <ModalArea unidades={unidades} onClose={() => setAreaOpen(false)} />}
      {editando && (
        <ModalColaborador unidades={unidades} nos={nos}
          disponiveis={colaboradores.filter(c => !alocados.has(c.candidate_id))}
          editando={editando} onClose={() => setEditando(null)} />
      )}
      {lideranca && (
        <ModalLideranca
          no={lideranca} nos={nos} unidadePorId={unidadePorId} porId={porId}
          onClose={() => setLideranca(null)} />
      )}
      {setor && (
        <ModalSetor
          setor={setor} nos={nos} unidades={unidades} unidadePorId={unidadePorId} porId={porId}
          onClose={() => setSetor(null)} />
      )}
    </div>
  )
}

// ─── Painel lateral (lista + arrastar) ────────────────────────────────────────

function PainelColaboradores({
  colaboradores, noPorCandidato, unidadePorId, podeEditar, soltando, onArrastar, onFimArrasto,
}: {
  colaboradores: ColaboradorOpcao[]
  noPorCandidato: Map<string, No>
  unidadePorId: Map<string, Unidade>
  podeEditar: boolean
  soltando: boolean
  onArrastar: (a: Arrasto) => void
  onFimArrasto: () => void
}) {
  const [busca, setBusca] = useState('')
  const [somenteSem, setSomenteSem] = useState(true)

  const lista = colaboradores.filter(c => {
    const alocado = noPorCandidato.has(c.candidate_id)
    if (somenteSem && alocado) return false
    if (!busca.trim()) return true
    const t = `${c.nome} ${c.cargo ?? ''}`.toLowerCase()
    return t.includes(busca.trim().toLowerCase())
  })

  const semAlocacao = colaboradores.filter(c => !noPorCandidato.has(c.candidate_id)).length

  return (
    <aside className="rounded-2xl border bg-white shadow-sm xl:sticky xl:top-4 flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden">
      <div className="px-4 py-3 border-b space-y-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm font-bold text-gray-800 flex-1">Colaboradores</p>
          <span className="text-[11px] font-semibold text-gray-400">{lista.length}</span>
        </div>
        {podeEditar && (
          <p className="text-[11px] text-muted-foreground leading-snug">
            Arraste um nome para dentro de uma unidade ou área para alocá-lo.
          </p>
        )}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar nome ou cargo…"
            className="h-8 w-full border border-gray-300 rounded-md pl-8 pr-2.5 text-[13px] bg-white"
          />
        </div>
        <button
          onClick={() => setSomenteSem(s => !s)}
          className={`w-full text-[11px] font-semibold rounded-md px-2 py-1.5 transition-colors ${
            somenteSem ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-50 text-gray-600 border border-gray-200'
          }`}
        >
          {somenteSem ? `Mostrando só os ${semAlocacao} sem alocação` : 'Mostrando todos'}
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-2 space-y-1">
        {lista.map(c => {
          const no = noPorCandidato.get(c.candidate_id)
          const unidade = no ? unidadePorId.get(no.unidade_id) : undefined
          return (
            <div
              key={c.candidate_id}
              draggable={podeEditar && !soltando}
              onDragStart={() => onArrastar(no
                ? { tipo: 'no', noId: no.id, nome: c.nome }
                : { tipo: 'novo', candidateId: c.candidate_id, nome: c.nome })}
              onDragEnd={onFimArrasto}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border transition-colors ${
                no ? 'border-transparent bg-gray-50' : 'border-gray-200 bg-white hover:border-primary/40'
              } ${podeEditar ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
              {podeEditar && <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
              <Avatar nome={c.nome} foto={c.foto_url} size={30} />
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] font-medium text-gray-800 truncate">{formatName(c.nome)}</span>
                <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                  <span className="truncate">{c.cargo ?? '—'}</span>
                  <SeloVinculo vinculo={c.vinculo} />
                </span>
                {unidade && (
                  <span className="block text-[10px] text-emerald-700 truncate">✓ {unidade.nome}</span>
                )}
              </span>
            </div>
          )
        })}
        {lista.length === 0 && (
          <p className="text-[12px] text-muted-foreground text-center py-6">
            {somenteSem ? 'Todo mundo já está alocado. 🎉' : 'Nenhum colaborador encontrado.'}
          </p>
        )}
      </div>
    </aside>
  )
}

// ─── Card de unidade / área (recolhível + alvo de arraste) ────────────────────

interface CardProps {
  unidade: Unidade
  pessoas: No[]
  recolhida: boolean
  onAlternar: () => void
  porId: Map<string, No>
  unidadePorId: Map<string, Unidade>
  subordinadosExternos: Map<string, No[]>
  fotos: Record<string, string>
  vinculos: Record<string, string>
  pessoasRecolhidas: Set<string>
  onAlternarPessoa: (id: string) => void
  podeEditar: boolean
  onEditar: (n: No) => void
  onLideranca: (n: No) => void
  arrastando: Arrasto | null
  alvoHover: string | null
  setAlvoHover: (id: string | null) => void
  onSoltar: (unidadeId: string) => void
  setArrastando: (a: Arrasto | null) => void
  onSetor: (u: Unidade) => void
}

/** Setores aninhados — um setor pode ficar dentro de outro. */
function SetoresFilhos({
  parentId, unidades, nosPorUnidade, recolhidas, onAlternarCaixa, props,
}: {
  parentId: string
  unidades: Unidade[]
  nosPorUnidade: Map<string, No[]>
  recolhidas: Set<string>
  onAlternarCaixa: (id: string) => void
  props: Omit<CardProps, 'unidade' | 'pessoas' | 'recolhida' | 'onAlternar'>
}) {
  const filhos = unidades.filter(u => u.tipo === 'area' && u.parent_id === parentId)
  if (filhos.length === 0) return null
  return (
    <div className="pl-4 border-l-2 border-dashed border-gray-200 ml-3 space-y-2">
      {filhos.map(a => (
        <div key={a.id} className="space-y-2">
          <UnidadeCard
            unidade={a} pessoas={nosPorUnidade.get(a.id) ?? []}
            recolhida={recolhidas.has(a.id)} onAlternar={() => onAlternarCaixa(a.id)}
            {...props}
          />
          <SetoresFilhos
            parentId={a.id} unidades={unidades} nosPorUnidade={nosPorUnidade}
            recolhidas={recolhidas} onAlternarCaixa={onAlternarCaixa} props={props}
          />
        </div>
      ))}
    </div>
  )
}

function UnidadeCard(p: CardProps) {
  const {
    unidade, pessoas, recolhida, onAlternar, arrastando, alvoHover, setAlvoHover,
    onSoltar, setArrastando, podeEditar, onSetor, porId, unidadePorId,
  } = p
  const Icone = iconeDe(unidade)
  const isArea = unidade.tipo === 'area'
  const ativo = alvoHover === unidade.id
  const responsavel = unidade.responsavel_no_id ? porId.get(unidade.responsavel_no_id) : undefined
  const unidadeResp = responsavel ? unidadePorId.get(responsavel.unidade_id) : undefined

  const idsLocais = new Set(pessoas.map(x => x.id))
  const raizes = pessoas.filter(x => !x.reporta_a || !idsLocais.has(x.reporta_a))
  const filhosDe = (id: string) => pessoas.filter(x => x.reporta_a === id)

  return (
    <div
      onDragOver={e => { if (arrastando) { e.preventDefault(); setAlvoHover(unidade.id) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvoHover(null) }}
      onDrop={e => { e.preventDefault(); onSoltar(unidade.id) }}
      className={`rounded-xl border bg-white shadow-sm overflow-hidden transition-all ${
        ativo ? 'border-amber-400 ring-4 ring-amber-200/50' : isArea ? 'border-gray-200' : 'border-gray-300'
      }`}
    >
      <div
        draggable={podeEditar && isArea}
        onDragStart={e => { if (isArea) { e.stopPropagation(); setArrastando({ tipo: 'unidade', unidadeId: unidade.id, nome: unidade.nome }) } }}
        onDragEnd={() => setArrastando(null)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 transition-colors ${
          isArea ? 'bg-gray-50 hover:bg-gray-100' : 'bg-primary/5 hover:bg-primary/10'
        } ${podeEditar && isArea ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        <button type="button" onClick={onAlternar} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        {recolhida
          ? <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
        <Icone className={`w-4 h-4 shrink-0 ${isArea ? 'text-gray-400' : 'text-primary'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-gray-800 truncate">{unidade.nome}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            {!isArea && (
              <span className={`text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 ${
                unidade.matriz ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {(unidade.company_ids?.length ?? 0) > 1
                  ? `Matriz + filial · ${unidade.company_ids!.length} CNPJs`
                  : unidade.matriz ? 'Matriz' : 'Filial'}
              </span>
            )}
            {unidade.escopo === 'grupo' && (
              <span className="text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-amber-100 text-amber-700">
                Atende o grupo
              </span>
            )}
            {unidade.divisao && !isArea && (
              <span className="text-[10px] text-muted-foreground">{unidade.divisao}</span>
            )}
          </div>
          {responsavel && (
            <span className="flex items-center gap-1 text-[10px] text-amber-700 mt-0.5">
              <CornerDownRight className="w-3 h-3 shrink-0" />
              responde a {formatName(responsavel.nome)}
              {responsavel.cargo ? ` · ${responsavel.cargo}` : unidadeResp ? ` · ${unidadeResp.nome}` : ''}
            </span>
          )}
        </div>
        </button>
        {podeEditar && isArea && (
          <button
            type="button" onClick={() => onSetor(unidade)} title="Definir a quem o setor responde"
            className="p-1 text-gray-400 hover:text-primary rounded shrink-0"
          >
            <Crown className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="text-[11px] font-semibold text-gray-400 shrink-0">{pessoas.length}</span>
      </div>

      {ativo && (
        <p className="px-3 py-2 text-[11px] font-semibold text-amber-700 bg-amber-50 border-t border-amber-200">
          Soltar aqui para alocar em {unidade.nome}
        </p>
      )}

      {!recolhida && (
        pessoas.length > 0 ? (
          <div className="p-2 space-y-1">
            {raizes.map(x => (
              <PessoaLinha key={x.id} pessoa={x} nivel={0} filhosDe={filhosDe} {...p} />
            ))}
          </div>
        ) : (
          <p className="px-3 py-3 text-[12px] text-muted-foreground">
            Ninguém alocado ainda{p.podeEditar ? ' — arraste alguém da lista ao lado.' : '.'}
          </p>
        )
      )}
    </div>
  )
}

interface LinhaProps {
  pessoa: No
  nivel: number
  filhosDe: (id: string) => No[]
  porId: Map<string, No>
  unidadePorId: Map<string, Unidade>
  subordinadosExternos: Map<string, No[]>
  fotos: Record<string, string>
  vinculos: Record<string, string>
  pessoasRecolhidas: Set<string>
  onAlternarPessoa: (id: string) => void
  podeEditar: boolean
  onEditar: (n: No) => void
  onLideranca: (n: No) => void
  setArrastando: (a: Arrasto | null) => void
}

function PessoaLinha({
  pessoa, nivel, filhosDe, porId, unidadePorId, subordinadosExternos, fotos, vinculos,
  pessoasRecolhidas, onAlternarPessoa, podeEditar, onEditar, onLideranca, setArrastando,
}: LinhaProps) {
  const filhos = filhosDe(pessoa.id)
  const recolhida = pessoasRecolhidas.has(pessoa.id)
  const externos = subordinadosExternos.get(pessoa.id) ?? []

  const chefe = pessoa.reporta_a ? porId.get(pessoa.reporta_a) : undefined
  const chefeExterno = chefe && chefe.unidade_id !== pessoa.unidade_id ? chefe : undefined
  const unidadeChefe = chefeExterno ? unidadePorId.get(chefeExterno.unidade_id) : undefined
  const ehLider = pessoa.nivel === 'lider' || filhos.length + externos.length > 0

  return (
    <>
      <div
        draggable={podeEditar}
        onDragStart={() => setArrastando({ tipo: 'no', noId: pessoa.id, nome: pessoa.nome })}
        onDragEnd={() => setArrastando(null)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-gray-50 group"
        style={{ marginLeft: nivel * 14 }}
      >
        {filhos.length > 0 ? (
          <button onClick={() => onAlternarPessoa(pessoa.id)}
            title={recolhida ? 'Expandir equipe' : 'Recolher equipe'}
            className="p-0.5 text-gray-400 hover:text-gray-600 shrink-0">
            {recolhida ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        ) : <span className="w-[18px] shrink-0" />}

        <span className="relative shrink-0">
          <Avatar nome={pessoa.nome} foto={pessoa.candidate_id ? fotos[pessoa.candidate_id] : pessoa.foto_url} />
          {pessoa.nivel === 'lider' && (
            <Crown className="w-3 h-3 text-amber-500 absolute -top-1 -right-1 drop-shadow" />
          )}
        </span>

        <button
          onClick={() => podeEditar && onLideranca(pessoa)}
          disabled={!podeEditar}
          title={podeEditar ? 'Definir liderança' : undefined}
          className="flex-1 min-w-0 text-left disabled:cursor-default"
        >
          <span className="block text-[13px] font-medium text-gray-800 truncate group-hover:text-primary transition-colors">
            {formatName(pessoa.nome)}
            {ehLider && filhos.length + externos.length > 0 && (
              <span className="ml-1.5 text-[10px] font-semibold text-primary/70">
                +{filhos.length + externos.length}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="truncate">{pessoa.cargo ?? '—'}</span>
            <SeloVinculo vinculo={pessoa.candidate_id ? vinculos[pessoa.candidate_id] : undefined} />
          </span>
          {chefeExterno && (
            <span className="flex items-center gap-1 text-[10px] text-amber-700 mt-0.5">
              <CornerDownRight className="w-3 h-3 shrink-0" />
              responde a {formatName(chefeExterno.nome)}{unidadeChefe ? ` · ${unidadeChefe.nome}` : ''}
            </span>
          )}
          {externos.length > 0 && (
            <span className="block text-[10px] text-gray-400 mt-0.5">
              + {externos.length} em outra unidade: {externos.map(e => formatName(e.nome).split(' ')[0]).join(', ')}
            </span>
          )}
        </button>

        {podeEditar && (
          <button onClick={() => onEditar(pessoa)} title="Editar dados"
            className="p-1 text-gray-400 hover:text-primary rounded shrink-0">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {!recolhida && filhos.map(f => (
        <PessoaLinha
          key={f.id} pessoa={f} nivel={nivel + 1} filhosDe={filhosDe}
          porId={porId} unidadePorId={unidadePorId} subordinadosExternos={subordinadosExternos}
          fotos={fotos} vinculos={vinculos}
          pessoasRecolhidas={pessoasRecolhidas} onAlternarPessoa={onAlternarPessoa}
          podeEditar={podeEditar} onEditar={onEditar} onLideranca={onLideranca} setArrastando={setArrastando}
        />
      ))}
    </>
  )
}

// ─── Modal: liderança ─────────────────────────────────────────────────────────

const INPUT = 'h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white'

function ModalLideranca({
  no, nos, unidadePorId, porId, onClose,
}: {
  no: No
  nos: No[]
  unidadePorId: Map<string, Unidade>
  porId: Map<string, No>
  onClose: () => void
}) {
  const router = useRouter()
  const [reportaA, setReportaA] = useState(no.reporta_a ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmandoEquipe, setConfirmandoEquipe] = useState(false)

  const unidade = unidadePorId.get(no.unidade_id)
  const daUnidade = nos.filter(n => n.unidade_id === no.unidade_id && n.id !== no.id)
  const chefeAtual = no.reporta_a ? porId.get(no.reporta_a) : undefined

  const lotacoes = Array.from(new Set(nos.map(n => n.unidade_id)))
    .map(uid => ({ unidade: unidadePorId.get(uid), pessoas: nos.filter(n => n.unidade_id === uid && n.id !== no.id) }))
    .filter(g => g.unidade && g.pessoas.length > 0)

  async function chamar(body: Record<string, unknown>) {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/organograma', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao salvar.')
      onClose(); router.refresh()
    } catch (e) {
      setError((e as Error).message); setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar nome={no.nome} foto={no.foto_url} size={36} />
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate">{formatName(no.nome)}</h2>
              <p className="text-[11px] text-muted-foreground truncate">
                {no.cargo ?? '—'}{unidade ? ` · ${unidade.nome}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* A quem responde */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Responde a</label>
            <select value={reportaA} onChange={e => setReportaA(e.target.value)} className={INPUT}>
              <option value="">Sem chefia definida</option>
              {lotacoes.map(g => (
                <optgroup key={g.unidade!.id} label={g.unidade!.nome}>
                  {g.pessoas.map(n => (
                    <option key={n.id} value={n.id}>{formatName(n.nome)}{n.cargo ? ` — ${n.cargo}` : ''}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {chefeAtual && (
              <p className="text-[10px] text-muted-foreground">Hoje responde a {formatName(chefeAtual.nome)}.</p>
            )}
            <Button size="sm" onClick={() => chamar({ id: no.id, reporta_a: reportaA || null })}
              disabled={saving || reportaA === (no.reporta_a ?? '')} className="gap-1.5 mt-1">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Salvar chefia
            </Button>
          </div>

          <div className="border-t pt-3 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Liderança</p>

            <Button
              variant="outline" size="sm" className="w-full gap-1.5 justify-start"
              disabled={saving}
              onClick={() => chamar({ id: no.id, nivel: no.nivel === 'lider' ? null : 'lider' })}
            >
              <Crown className={`w-3.5 h-3.5 ${no.nivel === 'lider' ? 'text-amber-500' : 'text-gray-400'}`} />
              {no.nivel === 'lider' ? 'Remover marcação de liderança' : 'Marcar como liderança'}
            </Button>

            {unidade && daUnidade.length > 0 && (
              confirmandoEquipe ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 space-y-2">
                  <p className="text-[12px] text-amber-900">
                    Os <strong>{daUnidade.length}</strong> colaboradores de <strong>{unidade.nome}</strong> passarão a
                    responder a {formatName(no.nome)}. Quem já tinha outra chefia será sobrescrito.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setConfirmandoEquipe(false)} disabled={saving}>Cancelar</Button>
                    <Button size="sm" disabled={saving} className="gap-1.5"
                      onClick={() => chamar({ acao: 'equipe', chefe_id: no.id, unidade_id: no.unidade_id })}>
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Confirmar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start"
                  onClick={() => setConfirmandoEquipe(true)} disabled={saving}>
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  Toda a unidade reporta a ele ({daUnidade.length})
                </Button>
              )
            )}
          </div>

          {error && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Modal: setor (a quem responde + onde fica) ───────────────────────────────

function ModalSetor({
  setor, nos, unidades, unidadePorId, porId, onClose,
}: {
  setor: Unidade
  nos: No[]
  unidades: Unidade[]
  unidadePorId: Map<string, Unidade>
  porId: Map<string, No>
  onClose: () => void
}) {
  const router = useRouter()
  const [responsavel, setResponsavel] = useState(setor.responsavel_no_id ?? '')
  const [parentId, setParentId] = useState(setor.parent_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const atual = setor.responsavel_no_id ? porId.get(setor.responsavel_no_id) : undefined

  const porUnidade = Array.from(new Set(nos.map(n => n.unidade_id)))
    .map(uid => ({ unidade: unidadePorId.get(uid), pessoas: nos.filter(n => n.unidade_id === uid) }))
    .filter(g => g.unidade && g.pessoas.length > 0)

  // Destinos possíveis: qualquer unidade ou setor, menos ele mesmo e seus descendentes.
  const descendentes = (() => {
    const set = new Set<string>([setor.id])
    let mudou = true
    while (mudou) {
      mudou = false
      for (const u of unidades) {
        if (u.parent_id && set.has(u.parent_id) && !set.has(u.id)) { set.add(u.id); mudou = true }
      }
    }
    return set
  })()
  const destinos = unidades.filter(u => (u.tipo === 'unidade' || u.tipo === 'area') && !descendentes.has(u.id))

  async function chamar(body: Record<string, unknown>) {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/organograma', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao salvar.')
      onClose(); router.refresh()
    } catch (e) {
      setError((e as Error).message); setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate">{setor.nome}</h2>
              <p className="text-[11px] text-muted-foreground">Setor / área</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Este setor responde a</label>
            <select value={responsavel} onChange={e => setResponsavel(e.target.value)} className={INPUT}>
              <option value="">Ninguém definido</option>
              {porUnidade.map(g => (
                <optgroup key={g.unidade!.id} label={g.unidade!.nome}>
                  {g.pessoas.map(n => (
                    <option key={n.id} value={n.id}>{formatName(n.nome)}{n.cargo ? ` — ${n.cargo}` : ''}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {atual && <p className="text-[10px] text-muted-foreground">Hoje responde a {formatName(atual.nome)}.</p>}
            <Button size="sm" className="gap-1.5 mt-1" disabled={saving || responsavel === (setor.responsavel_no_id ?? '')}
              onClick={() => chamar({ acao: 'responsavel_setor', unidade_id: setor.id, responsavel_no_id: responsavel || null })}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Salvar
            </Button>
          </div>

          <div className="border-t pt-3 space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Este setor fica dentro de</label>
            <select value={parentId} onChange={e => setParentId(e.target.value)} className={INPUT}>
              {destinos.map(u => (
                <option key={u.id} value={u.id}>{u.tipo === 'area' ? `↳ ${u.nome}` : u.nome}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">Também dá para arrastar a caixa do setor para o destino.</p>
            <Button variant="outline" size="sm" className="gap-1.5 mt-1" disabled={saving || parentId === (setor.parent_id ?? '')}
              onClick={() => chamar({ acao: 'mover_unidade', unidade_id: setor.id, parent_id: parentId })}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Mover setor
            </Button>
          </div>

          {error && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Modal: adicionar / editar colaborador ────────────────────────────────────

function ModalColaborador({
  unidades, nos, disponiveis, editando, onClose,
}: {
  unidades: Unidade[]
  nos: No[]
  disponiveis: ColaboradorOpcao[]
  editando?: No
  onClose: () => void
}) {
  const router = useRouter()
  const isEdit = !!editando
  const [modo, setModo] = useState<'sistema' | 'manual'>(isEdit ? 'manual' : 'sistema')
  const [candidateId, setCandidateId] = useState('')
  const [nome, setNome] = useState(editando?.nome ?? '')
  const [cargo, setCargo] = useState(editando?.cargo ?? '')
  const [unidadeId, setUnidadeId] = useState(editando?.unidade_id ?? '')
  const [reportaA, setReportaA] = useState(editando?.reporta_a ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const lotacoes = unidades.filter(u => u.tipo !== 'empresa')
  const nomeUnidade = (u: Unidade) =>
    u.tipo === 'holding' ? `${u.nome} (diretoria)` : u.tipo === 'area' ? `   ↳ ${u.nome}` : u.nome

  const chefesPorUnidade = lotacoes
    .map(u => ({ unidade: u, pessoas: nos.filter(n => n.unidade_id === u.id && n.id !== editando?.id) }))
    .filter(g => g.pessoas.length > 0)

  async function salvar() {
    setSaving(true); setError('')
    try {
      const body: Record<string, unknown> = { unidade_id: unidadeId, reporta_a: reportaA || null, cargo }
      if (isEdit) { body.id = editando!.id; body.nome = nome }
      else if (modo === 'sistema') body.candidate_id = candidateId
      else body.nome = nome

      const res = await fetch('/api/admin/organograma', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao salvar.')
      onClose(); router.refresh()
    } catch (e) {
      setError((e as Error).message || 'Erro ao salvar.')
    } finally { setSaving(false) }
  }

  const podeSalvar = unidadeId && (isEdit ? nome.trim() : (modo === 'sistema' ? candidateId : nome.trim()))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />{isEdit ? 'Editar colaborador' : 'Adicionar colaborador'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {!isEdit && (
            <div className="inline-flex rounded-lg border p-0.5 w-full">
              {([{ m: 'sistema' as const, label: 'Do sistema' }, { m: 'manual' as const, label: 'Cadastrar na mão' }]).map(o => (
                <button key={o.m} onClick={() => setModo(o.m)}
                  className={`flex-1 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                    modo === o.m ? 'bg-primary text-primary-foreground' : 'text-gray-600 hover:bg-gray-100'
                  }`}>{o.label}</button>
              ))}
            </div>
          )}

          {!isEdit && modo === 'sistema' ? (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600">Colaborador contratado</label>
              <select value={candidateId} onChange={e => setCandidateId(e.target.value)} className={INPUT}>
                <option value="">Selecione…</option>
                {disponiveis.map(c => (
                  <option key={c.candidate_id} value={c.candidate_id}>
                    {formatName(c.nome)}{c.cargo ? ` — ${c.cargo}` : ''}
                  </option>
                ))}
              </select>
              {disponiveis.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Todos os contratados já estão no organograma.</p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600">Nome</label>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" className={INPUT} />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Cargo</label>
            <input value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ex.: Gerente, CEO, Atendente" className={INPUT} />
            {!isEdit && modo === 'sistema' && (
              <p className="text-[10px] text-muted-foreground">Em branco, usa o cargo da ficha de admissão.</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Onde se encaixa</label>
            <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)} className={INPUT}>
              <option value="">Selecione a unidade / área…</option>
              {lotacoes.map(u => <option key={u.id} value={u.id}>{nomeUnidade(u)}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Reporta a (opcional)</label>
            <select value={reportaA} onChange={e => setReportaA(e.target.value)} className={INPUT}>
              <option value="">Sem chefia definida</option>
              {chefesPorUnidade.map(g => (
                <optgroup key={g.unidade.id} label={g.unidade.nome}>
                  {g.pessoas.map(n => (
                    <option key={n.id} value={n.id}>{formatName(n.nome)}{n.cargo ? ` — ${n.cargo}` : ''}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {error && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !podeSalvar} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: nova área ─────────────────────────────────────────────────────────

function ModalArea({ unidades, onClose }: { unidades: Unidade[]; onClose: () => void }) {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [parentId, setParentId] = useState('')
  const [escopo, setEscopo] = useState<'grupo' | 'local'>('grupo')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function salvar() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/organograma', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'area', nome, parent_id: parentId, escopo }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao salvar.')
      onClose(); router.refresh()
    } catch (e) {
      setError((e as Error).message || 'Erro ao salvar.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold flex items-center gap-2"><FolderPlus className="w-4 h-4 text-primary" />Nova área / setor</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Nome da área</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Financeiro, RH, Marketing" className={INPUT} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Fica em qual unidade</label>
            <select value={parentId} onChange={e => setParentId(e.target.value)} className={INPUT}>
              <option value="">Selecione…</option>
              {unidades.filter(u => u.tipo === 'unidade').map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Abrangência</label>
            <select value={escopo} onChange={e => setEscopo(e.target.value as 'grupo' | 'local')} className={INPUT}>
              <option value="grupo">Atende todo o grupo (backoffice)</option>
              <option value="local">Atende só esta unidade</option>
            </select>
          </div>
          {error && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !nome.trim() || !parentId} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Criar
          </Button>
        </div>
      </div>
    </div>
  )
}
