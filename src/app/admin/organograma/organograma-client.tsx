'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Network, Plus, Building2, Store, Factory, Briefcase, Users,
  Pencil, Trash2, X, Loader2, AlertCircle, UserPlus, FolderPlus,
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
  divisao: string | null
  matriz: boolean
  escopo: 'local' | 'grupo'
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
}

type Vista = 'juridica' | 'operacional'

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

// ─── Componente principal ─────────────────────────────────────────────────────

export function OrganogramaClient({
  unidades, nos, disponiveis, podeEditar,
}: {
  unidades: Unidade[]
  nos: No[]
  disponiveis: ColaboradorOpcao[]
  podeEditar: boolean
}) {
  const [vista, setVista] = useState<Vista>('juridica')
  const [addOpen, setAddOpen] = useState(false)
  const [areaOpen, setAreaOpen] = useState(false)
  const [editando, setEditando] = useState<No | null>(null)
  const [removendo, setRemovendo] = useState<No | null>(null)

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

  const diretoria = holding ? (nosPorUnidade.get(holding.id) ?? []) : []

  // Unidades operacionais (com suas áreas) — a base das duas vistas.
  const unidadesOperacionais = unidades.filter(u => u.tipo === 'unidade')
  const areasDe = (unidadeId: string) => unidades.filter(u => u.tipo === 'area' && u.parent_id === unidadeId)

  // Vista jurídica: Empresa → Unidades (matriz/filiais) → Áreas
  const gruposJuridicos = unidades
    .filter(u => u.tipo === 'empresa')
    .map(e => ({
      chave: e.id,
      titulo: e.nome,
      legenda: 'Empresa (CNPJ próprio)',
      unidades: unidadesOperacionais.filter(u => u.parent_id === e.id),
    }))

  // Vista operacional: Divisão → Unidades daquela divisão (cruza empresas)
  const divisoes = Array.from(new Set(unidadesOperacionais.map(u => u.divisao).filter(Boolean) as string[]))
  const gruposOperacionais = divisoes.map(d => ({
    chave: d,
    titulo: d,
    legenda: 'Divisão do grupo',
    unidades: unidadesOperacionais.filter(u => u.divisao === d),
  }))

  const grupos = vista === 'juridica' ? gruposJuridicos : gruposOperacionais
  const totalPessoas = nos.length

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">

      {/* ── Cabeçalho ── */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Network className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold leading-tight">Organograma</h1>
          <p className="text-sm text-muted-foreground">
            {holding?.nome ?? 'Grupo'} — {totalPessoas} pessoa{totalPessoas !== 1 ? 's' : ''} na estrutura
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

      {/* ── Alternância de vista ── */}
      <div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">
        {([
          { v: 'juridica' as Vista, label: 'Por empresa', hint: 'CNPJ' },
          { v: 'operacional' as Vista, label: 'Por divisão', hint: 'Operação' },
        ]).map(o => (
          <button
            key={o.v}
            onClick={() => setVista(o.v)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${
              vista === o.v ? 'bg-primary text-primary-foreground' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {o.label}
            <span className={`ml-1.5 text-[10px] font-medium ${vista === o.v ? 'text-primary-foreground/70' : 'text-gray-400'}`}>
              {o.hint}
            </span>
          </button>
        ))}
      </div>

      {/* ── Topo: holding + diretoria ── */}
      {holding && (
        <div className="flex flex-col items-center">
          <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-[#1a5c38] to-[#2d7a4f] text-white px-5 py-4 shadow-sm text-center min-w-[240px]">
            <p className="text-[10px] uppercase tracking-widest text-emerald-100/80 font-semibold">Holding</p>
            <p className="text-lg font-bold leading-tight">{holding.nome}</p>
            {diretoria.length > 0 && (
              <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
                {diretoria.map(d => (
                  <div key={d.id} className="flex items-center gap-2 bg-white/10 rounded-xl px-2.5 py-1.5 backdrop-blur group">
                    <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold shrink-0">
                      {iniciais(d.nome)}
                    </span>
                    <span className="text-left">
                      <span className="block text-[13px] font-semibold leading-tight">{formatName(d.nome)}</span>
                      <span className="block text-[10px] text-emerald-100/80">{d.cargo ?? '—'}</span>
                    </span>
                    {podeEditar && (
                      <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditando(d)} title="Editar" className="p-1 hover:bg-white/20 rounded"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => setRemovendo(d)} title="Remover" className="p-1 hover:bg-white/20 rounded"><Trash2 className="w-3 h-3" /></button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="w-px h-6 bg-gray-300" />
        </div>
      )}

      {/* ── Grupos (empresas ou divisões) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        {grupos.map(g => (
          <div key={g.chave} className="rounded-2xl border bg-gray-50/70 p-3 space-y-3">
            <div className="px-1">
              <p className="text-sm font-bold text-gray-800 leading-tight">{g.titulo}</p>
              <p className="text-[11px] text-muted-foreground">{g.legenda}</p>
            </div>

            {g.unidades.map(u => {
              const areas = areasDe(u.id)
              return (
                <div key={u.id} className="space-y-2">
                  <UnidadeCard
                    unidade={u}
                    pessoas={nosPorUnidade.get(u.id) ?? []}
                    podeEditar={podeEditar}
                    onEditar={setEditando}
                    onRemover={setRemovendo}
                  />
                  {areas.length > 0 && (
                    <div className="pl-4 border-l-2 border-dashed border-gray-200 ml-3 space-y-2">
                      {areas.map(a => (
                        <UnidadeCard
                          key={a.id}
                          unidade={a}
                          pessoas={nosPorUnidade.get(a.id) ?? []}
                          podeEditar={podeEditar}
                          onEditar={setEditando}
                          onRemover={setRemovendo}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {g.unidades.length === 0 && (
              <p className="text-[12px] text-muted-foreground px-1 pb-1">Sem unidades nesta divisão.</p>
            )}
          </div>
        ))}
      </div>

      {/* ── Modais ── */}
      {addOpen && (
        <ModalColaborador
          unidades={unidades} nos={nos} disponiveis={disponiveis}
          onClose={() => setAddOpen(false)}
        />
      )}
      {areaOpen && (
        <ModalArea unidades={unidades} onClose={() => setAreaOpen(false)} />
      )}
      {editando && (
        <ModalColaborador
          unidades={unidades} nos={nos} disponiveis={disponiveis} editando={editando}
          onClose={() => setEditando(null)}
        />
      )}
      {removendo && (
        <ModalRemover no={removendo} onClose={() => setRemovendo(null)} />
      )}
    </div>
  )
}

// ─── Card de unidade / área ───────────────────────────────────────────────────

function UnidadeCard({
  unidade, pessoas, podeEditar, onEditar, onRemover,
}: {
  unidade: Unidade
  pessoas: No[]
  podeEditar: boolean
  onEditar: (n: No) => void
  onRemover: (n: No) => void
}) {
  const Icone = iconeDe(unidade)
  const isArea = unidade.tipo === 'area'

  // Hierarquia interna: quem reporta a quem dentro da mesma unidade.
  const idsLocais = new Set(pessoas.map(p => p.id))
  const raizes = pessoas.filter(p => !p.reporta_a || !idsLocais.has(p.reporta_a))
  const filhosDe = (id: string) => pessoas.filter(p => p.reporta_a === id)

  return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden ${isArea ? 'border-gray-200' : 'border-gray-300'}`}>
      <div className={`flex items-center gap-2 px-3 py-2.5 ${isArea ? 'bg-gray-50' : 'bg-primary/5'}`}>
        <Icone className={`w-4 h-4 shrink-0 ${isArea ? 'text-gray-400' : 'text-primary'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-gray-800 truncate">{unidade.nome}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            {!isArea && (
              <span className={`text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 ${
                unidade.matriz ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {unidade.matriz ? 'Matriz' : 'Filial'}
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
        </div>
        <span className="text-[11px] font-semibold text-gray-400 shrink-0">{pessoas.length}</span>
      </div>

      {pessoas.length > 0 ? (
        <div className="p-2 space-y-1">
          {raizes.map(p => (
            <PessoaLinha
              key={p.id} pessoa={p} nivel={0} filhosDe={filhosDe}
              podeEditar={podeEditar} onEditar={onEditar} onRemover={onRemover}
            />
          ))}
        </div>
      ) : (
        <p className="px-3 py-3 text-[12px] text-muted-foreground">Ninguém alocado ainda.</p>
      )}
    </div>
  )
}

function PessoaLinha({
  pessoa, nivel, filhosDe, podeEditar, onEditar, onRemover,
}: {
  pessoa: No
  nivel: number
  filhosDe: (id: string) => No[]
  podeEditar: boolean
  onEditar: (n: No) => void
  onRemover: (n: No) => void
}) {
  const filhos = filhosDe(pessoa.id)
  return (
    <>
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 group"
        style={{ marginLeft: nivel * 14 }}
      >
        <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
          {iniciais(pessoa.nome)}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-medium text-gray-800 truncate">{formatName(pessoa.nome)}</span>
          <span className="block text-[11px] text-muted-foreground truncate">{pessoa.cargo ?? '—'}</span>
        </span>
        {podeEditar && (
          <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => onEditar(pessoa)} title="Editar" className="p-1 text-gray-400 hover:text-primary rounded"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={() => onRemover(pessoa)} title="Remover" className="p-1 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
          </span>
        )}
      </div>
      {filhos.map(f => (
        <PessoaLinha
          key={f.id} pessoa={f} nivel={nivel + 1} filhosDe={filhosDe}
          podeEditar={podeEditar} onEditar={onEditar} onRemover={onRemover}
        />
      ))}
    </>
  )
}

// ─── Modal: adicionar / editar colaborador ────────────────────────────────────

const INPUT = 'h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white'

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

  // Opções de lotação: holding, unidades e áreas (empresa é só agrupador).
  const lotacoes = unidades.filter(u => u.tipo !== 'empresa')
  const nomeUnidade = (u: Unidade) =>
    u.tipo === 'holding' ? `${u.nome} (diretoria)` : u.tipo === 'area' ? `   ↳ ${u.nome}` : u.nome

  async function salvar() {
    setSaving(true); setError('')
    try {
      const body: Record<string, unknown> = {
        unidade_id: unidadeId,
        reporta_a: reportaA || null,
        cargo,
      }
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
              {([
                { m: 'sistema' as const, label: 'Do sistema' },
                { m: 'manual' as const, label: 'Cadastrar na mão' },
              ]).map(o => (
                <button key={o.m} onClick={() => setModo(o.m)}
                  className={`flex-1 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                    modo === o.m ? 'bg-primary text-primary-foreground' : 'text-gray-600 hover:bg-gray-100'
                  }`}>
                  {o.label}
                </button>
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
              {nos.filter(n => n.id !== editando?.id).map(n => (
                <option key={n.id} value={n.id}>{formatName(n.nome)}{n.cargo ? ` — ${n.cargo}` : ''}</option>
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

// ─── Modal: remover (alerta estilizado) ───────────────────────────────────────

function ModalRemover({ no, onClose }: { no: No; onClose: () => void }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function remover() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/organograma', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: no.id }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao remover.')
      onClose(); router.refresh()
    } catch (e) {
      setError((e as Error).message || 'Erro ao remover.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b">
          <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0"><Trash2 className="w-4 h-4 text-red-600" /></div>
          <h2 className="text-base font-semibold text-gray-900">Remover do organograma</h2>
        </div>
        <div className="px-5 py-4 text-sm text-gray-600">
          Remover <strong>{formatName(no.nome)}</strong> do organograma?
          <span className="block mt-1 text-gray-500">
            Isso não desliga o colaborador nem apaga a ficha — só tira da estrutura. Quem reportava a ele fica sem chefia definida.
          </span>
        </div>
        {error && <p className="px-5 pb-2 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="destructive" onClick={remover} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Remover
          </Button>
        </div>
      </div>
    </div>
  )
}
