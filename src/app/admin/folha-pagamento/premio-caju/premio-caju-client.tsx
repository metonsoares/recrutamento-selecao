'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Gift, Search, Download, CheckCircle2, AlertCircle, Loader2, Check,
  ExternalLink, History, X, ChevronLeft, ChevronRight, Ban,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LinhaCaju {
  candidate_id: string
  nome: string
  cargo: string | null
  empresa_id: string | null
  empresa: string | null
  faltas: number
  advertencias: number
  elegivel: boolean
  valor_aprovado: number | null
}

export interface EmpresaOpcao { id: string; nome: string }
export interface PagamentoHistorico { candidate_id: string; competencia: string; valor: number }

interface CicloAprovado {
  valor_padrao: number
  total: number
  aprovado_por: string | null
  aprovado_em: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "2026-07-01" → "julho de 2026" (sem passar por Date, que desloca fuso). */
function rotuloCompetencia(c: string): string {
  const [ano, mes] = c.split('-').map(Number)
  return `${MESES[mes - 1]} de ${ano}`
}

function competenciaVizinha(c: string, delta: number): string {
  const [ano, mes] = c.split('-').map(Number)
  const d = new Date(ano, mes - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Prazo de pagamento: dia 10 do mês seguinte à competência. */
function prazoPagamento(c: string): string {
  const [ano, mes] = c.split('-').map(Number)
  const d = new Date(ano, mes, 10)
  return `10/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function PremioCajuClient({
  competencia, linhas, empresas, historico, cicloAprovado,
}: {
  competencia: string
  linhas: LinhaCaju[]
  empresas: EmpresaOpcao[]
  historico: PagamentoHistorico[]
  cicloAprovado: CicloAprovado | null
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [valorPadrao, setValorPadrao] = useState(
    cicloAprovado ? String(cicloAprovado.valor_padrao).replace('.', ',') : '',
  )
  const [ajustes, setAjustes] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [verHistorico, setVerHistorico] = useState<LinhaCaju | null>(null)

  const padraoNum = Number(valorPadrao.replace(/\./g, '').replace(',', '.')) || 0

  /** Valor efetivo da pessoa: ajuste individual > valor já aprovado > padrão do mês. */
  function valorDe(l: LinhaCaju): number {
    const aj = ajustes[l.candidate_id]
    if (aj !== undefined && aj !== '') return Number(aj.replace(/\./g, '').replace(',', '.')) || 0
    if (aj === '') return 0
    if (l.valor_aprovado != null) return l.valor_aprovado
    return padraoNum
  }

  const historicoPorCand = useMemo(() => {
    const m = new Map<string, PagamentoHistorico[]>()
    for (const h of historico) {
      const arr = m.get(h.candidate_id) ?? []
      arr.push(h)
      m.set(h.candidate_id, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => b.competencia.localeCompare(a.competencia))
    return m
  }, [historico])

  const filtradas = linhas.filter(l => {
    if (empresaFiltro && l.empresa_id !== empresaFiltro) return false
    if (!busca.trim()) return true
    const t = `${l.nome} ${l.cargo ?? ''}`.toLowerCase()
    return t.includes(busca.trim().toLowerCase())
  })

  const elegiveis = filtradas.filter(l => l.elegivel)
  const bloqueados = filtradas.length - elegiveis.length
  const totalPagar = elegiveis.reduce((s, l) => s + valorDe(l), 0)
  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome

  function exportar() {
    const cabecalho = ['Funcionário', 'Valor']
    const corpo = elegiveis.map(l => [formatName(l.nome), valorDe(l)])
    const rodape = [['TOTAL', totalPagar]]
    const nome = `premio-caju-${competencia.slice(0, 7)}${nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''}.xlsx`
    baixarArquivo(gerarXlsx([cabecalho, ...corpo, ...rodape], 'Prêmio Caju'), nome)
  }

  async function aprovar() {
    setSalvando(true); setErro(''); setOk('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/premio-caju', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competencia,
          valor_padrao: padraoNum,
          itens: elegiveis.map(l => ({
            candidate_id: l.candidate_id, nome: l.nome, cargo: l.cargo,
            empresa_id: l.empresa_id, empresa_nome: l.empresa, valor: valorDe(l),
          })),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao aprovar.')
      setOk(`${d.aprovados} colaboradores aprovados — ${brl(d.total)}.`)
      setConfirmando(false)
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setSalvando(false) }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">

      {/* ── Cabeçalho ── */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Gift className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold leading-tight">Prêmio Caju</h1>
          <p className="text-sm text-muted-foreground">
            Competência <strong className="text-gray-700">{rotuloCompetencia(competencia)}</strong> · pagar até {prazoPagamento(competencia)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`?competencia=${competenciaVizinha(competencia, -1)}`} scroll={false}
            className="p-2 rounded-lg border bg-white hover:bg-gray-50" title="Mês anterior">
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </Link>
          <Link href={`?competencia=${competenciaVizinha(competencia, 1)}`} scroll={false}
            className="p-2 rounded-lg border bg-white hover:bg-gray-50" title="Mês seguinte">
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </Link>
        </div>
      </div>

      {cicloAprovado && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-[13px] text-emerald-900 flex-1">
            Mês <strong>aprovado</strong> — {brl(cicloAprovado.total)}
            {cicloAprovado.aprovado_por ? ` por ${cicloAprovado.aprovado_por}` : ''}. Reaprovar substitui o fechamento.
          </p>
        </div>
      )}

      {/* ── Regra ── */}
      <div className="rounded-xl border bg-white p-3.5 text-[12.5px] text-gray-600 shadow-sm">
        Recebem os contratados <strong>sem falta injustificada e sem advertência</strong> em {rotuloCompetencia(competencia)}.
        Quem está com “Não aplicável” no documento não entra na lista. Afastamento e atestado não tiram o prêmio.
      </div>

      {/* ── Filtros e valor ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou cargo…"
            className="h-9 w-full border border-gray-300 rounded-md pl-8 pr-2.5 text-sm bg-white" />
        </div>
        <select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)}
          className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white">
          <option value="">Todas as empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
          <input value={valorPadrao} onChange={e => setValorPadrao(e.target.value.replace(/[^\d,.]/g, ''))}
            placeholder="Valor do mês" inputMode="decimal"
            className="h-9 w-full border border-gray-300 rounded-md pl-9 pr-2.5 text-sm bg-white" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportar} disabled={elegiveis.length === 0} className="gap-1.5 flex-1">
            <Download className="w-3.5 h-3.5" />Exportar
          </Button>
          <Button onClick={() => { setErro(''); setOk(''); setConfirmando(true) }}
            disabled={elegiveis.length === 0 || padraoNum <= 0} className="gap-1.5 flex-1">
            <Check className="w-3.5 h-3.5" />Aprovar
          </Button>
        </div>
      </div>

      {/* ── Resumo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Cartao titulo="Vão receber" valor={String(elegiveis.length)} cor="text-emerald-700" />
        <Cartao titulo="Sem direito" valor={String(bloqueados)} cor="text-red-600" />
        <Cartao titulo="Total do mês" valor={brl(totalPagar)} cor="text-gray-900" />
        <Cartao titulo="Empresa" valor={nomeEmpresa ?? 'Todas'} cor="text-gray-900" pequeno />
      </div>

      {erro && <p className="text-[13px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{erro}</p>}
      {ok && <p className="text-[13px] text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{ok}</p>}

      {/* ── Lista ── */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Colaborador</th>
                <th className="px-4 py-2.5 font-semibold hidden md:table-cell">Cargo</th>
                <th className="px-4 py-2.5 font-semibold hidden sm:table-cell">Empresa</th>
                <th className="px-4 py-2.5 font-semibold">Situação no mês</th>
                <th className="px-4 py-2.5 font-semibold">Valor</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtradas.map(l => {
                const hist = historicoPorCand.get(l.candidate_id) ?? []
                return (
                  <tr key={l.candidate_id} className={l.elegivel ? 'hover:bg-gray-50' : 'bg-red-50/40'}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {formatName(l.nome)}
                      {hist.length > 0 && (
                        <button onClick={() => setVerHistorico(l)}
                          className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline align-middle">
                          <History className="w-3 h-3" />{hist.length}×
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 hidden md:table-cell">{l.cargo ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 hidden sm:table-cell">{l.empresa ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {l.elegivel ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />Sem ocorrência
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-red-600">
                          <Ban className="w-3.5 h-3.5" />
                          {[l.faltas > 0 ? `${l.faltas} falta${l.faltas !== 1 ? 's' : ''}` : null,
                            l.advertencias > 0 ? `${l.advertencias} advertência${l.advertencias !== 1 ? 's' : ''}` : null,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {l.elegivel ? (
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">R$</span>
                          <input
                            value={ajustes[l.candidate_id] ?? (l.valor_aprovado != null ? String(l.valor_aprovado).replace('.', ',') : '')}
                            onChange={e => setAjustes(a => ({ ...a, [l.candidate_id]: e.target.value.replace(/[^\d,.]/g, '') }))}
                            placeholder={padraoNum ? String(padraoNum).replace('.', ',') : '0,00'}
                            inputMode="decimal"
                            className="h-8 w-full border border-gray-300 rounded-md pl-7 pr-2 text-[13px] bg-white"
                          />
                        </div>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/admin/candidatos/${l.candidate_id}?tab=documentos`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline">
                        Ficha<ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {filtradas.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhum colaborador encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Confirmação de aprovação ── */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !salvando && setConfirmando(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-4 border-b">
              <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0"><Check className="w-4 h-4 text-emerald-600" /></div>
              <h2 className="text-base font-semibold">Aprovar {rotuloCompetencia(competencia)}</h2>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600 space-y-1.5">
              <p><strong>{elegiveis.length}</strong> colaboradores{nomeEmpresa ? ` de ${nomeEmpresa}` : ''} vão receber.</p>
              <p>Total: <strong className="text-gray-900">{brl(totalPagar)}</strong>.</p>
              <p className="text-[12px] text-gray-500">Fica registrado com seu usuário e a data. Reaprovar substitui o fechamento anterior deste mês.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setConfirmando(false)} disabled={salvando}>Cancelar</Button>
              <Button onClick={aprovar} disabled={salvando} className="gap-1.5">
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Aprovar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Histórico da pessoa ── */}
      {verHistorico && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setVerHistorico(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="min-w-0">
                <h2 className="text-base font-semibold truncate">{formatName(verHistorico.nome)}</h2>
                <p className="text-[11px] text-muted-foreground">Prêmios recebidos</p>
              </div>
              <button onClick={() => setVerHistorico(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-3 divide-y">
              {(historicoPorCand.get(verHistorico.candidate_id) ?? []).map(h => (
                <div key={h.competencia} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-600 capitalize">{rotuloCompetencia(h.competencia)}</span>
                  <span className="font-semibold text-emerald-700">{brl(h.valor)}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t bg-gray-50 rounded-b-2xl flex items-center justify-between text-sm">
              <span className="text-gray-600 font-medium">Total recebido</span>
              <span className="font-bold text-gray-900">
                {brl((historicoPorCand.get(verHistorico.candidate_id) ?? []).reduce((s, h) => s + h.valor, 0))}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Cartao({ titulo, valor, cor, pequeno }: { titulo: string; valor: string; cor: string; pequeno?: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-3.5 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{titulo}</p>
      <p className={`${pequeno ? 'text-sm font-semibold' : 'text-2xl font-bold'} ${cor} mt-0.5 truncate`}>{valor}</p>
    </div>
  )
}
