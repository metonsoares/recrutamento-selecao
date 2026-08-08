'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Gift, Search, Download, CheckCircle2, AlertCircle, Loader2, Check,
  ExternalLink, History, ChevronLeft, ChevronRight, ChevronDown, Ban, Copy,
  FileSpreadsheet, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { gerarPdfTabela } from '@/lib/pdf'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LinhaCaju {
  candidate_id: string
  nome: string
  cargo: string | null
  empresa_id: string | null
  empresa: string | null
  faltas: number
  advertencias: number
  em_experiencia: boolean
  /** yyyy-mm-dd — fim do período de experiência (null = sem experiência ou sem data) */
  fim_experiencia: string | null
  sem_data_admissao: boolean
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
  const [historicoAberto, setHistoricoAberto] = useState<Set<string>>(new Set())
  const [menuExportar, setMenuExportar] = useState(false)

  const alternarHistorico = (id: string) => setHistoricoAberto(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

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
  // Só entram no fechamento quem tem valor > 0 — é isso que habilita o Aprovar
  // (antes o botão exigia o campo "Valor do mês", mesmo com valores por linha).
  const comValor = elegiveis.filter(l => valorDe(l) > 0).length
  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome

  /** Replica o valor do mês nas linhas que estão listadas no filtro atual. */
  function aplicarATodos() {
    const texto = valorPadrao.trim()
    setAjustes(a => {
      const novo = { ...a }
      for (const l of elegiveis) novo[l.candidate_id] = texto
      return novo
    })
    setOk(`Valor aplicado a ${elegiveis.length} colaborador${elegiveis.length !== 1 ? 'es' : ''}${nomeEmpresa ? ` de ${nomeEmpresa}` : ''}.`)
  }

  const CABECALHO = ['Funcionário', 'Valor']
  const baseNome = `premio-caju-${competencia.slice(0, 7)}${nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''}`

  function exportarXlsx() {
    setMenuExportar(false)
    const corpo = elegiveis.map(l => [formatName(l.nome), valorDe(l)])
    baixarArquivo(gerarXlsx([CABECALHO, ...corpo, ['TOTAL', totalPagar]], 'Prêmio Caju'), `${baseNome}.xlsx`)
  }

  async function exportarPdf() {
    setMenuExportar(false)
    const corpo = elegiveis.map(l => [formatName(l.nome), brl(valorDe(l))])
    const blob = await gerarPdfTabela({
      titulo: 'Prêmio Caju',
      subtitulo: `${rotuloCompetencia(competencia)} · ${nomeEmpresa ?? 'Todas as empresas'} · ${elegiveis.length} colaboradores · Total ${brl(totalPagar)} · pagar até ${prazoPagamento(competencia)}`,
      cabecalho: CABECALHO,
      linhas: [...corpo, ['TOTAL', brl(totalPagar)]],
    })
    baixarArquivo(blob, `${baseNome}.pdf`)
  }

  async function aprovar() {
    setSalvando(true); setErro(''); setOk('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/premio-caju', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competencia,
          valor_padrao: padraoNum,
          escopo_empresa: empresaFiltro || null,
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
        Recebem os contratados <strong>já efetivados</strong> e <strong>sem falta injustificada e sem advertência</strong> em {rotuloCompetencia(competencia)}.
        Quem ainda estava <strong>em experiência no último dia do mês</strong> não recebe — quem foi efetivado durante o mês recebe.
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
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
            <input value={valorPadrao} onChange={e => setValorPadrao(e.target.value.replace(/[^\d,.]/g, ''))}
              placeholder="Valor do mês" inputMode="decimal"
              className="h-9 w-full border border-gray-300 rounded-md pl-9 pr-2.5 text-sm bg-white" />
          </div>
          <Button
            variant="outline" onClick={aplicarATodos} disabled={padraoNum <= 0 || elegiveis.length === 0}
            title={nomeEmpresa ? `Aplicar a todos de ${nomeEmpresa}` : 'Aplicar a todos os listados'}
            className="gap-1.5 shrink-0"
          >
            <Copy className="w-3.5 h-3.5" />Aplicar a todos
          </Button>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Button variant="outline" onClick={() => setMenuExportar(o => !o)}
              disabled={elegiveis.length === 0} className="gap-1.5 w-full">
              <Download className="w-3.5 h-3.5" />Exportar
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </Button>
            {menuExportar && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuExportar(false)} />
                <div className="absolute right-0 mt-1 z-20 w-52 rounded-xl border bg-white shadow-lg overflow-hidden">
                  <button onClick={exportarXlsx}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-gray-50">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Excel <span className="text-muted-foreground">(.xlsx)</span></span>
                  </button>
                  <button onClick={exportarPdf}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-gray-50 border-t">
                    <FileText className="w-4 h-4 text-red-600 shrink-0" />
                    <span>PDF <span className="text-muted-foreground">(.pdf)</span></span>
                  </button>
                </div>
              </>
            )}
          </div>
          <Button onClick={() => { setErro(''); setOk(''); setConfirmando(true) }}
            disabled={comValor === 0}
            title={comValor === 0 ? 'Preencha o valor de pelo menos um colaborador' : undefined}
            className="gap-1.5 flex-1">
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
                    <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                      {formatName(l.nome)}
                      {l.em_experiencia ? (
                        <span
                          title={l.fim_experiencia ? `Experiência até ${l.fim_experiencia.split('-').reverse().join('/')}` : undefined}
                          className="ml-2 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-amber-100 text-amber-700 align-middle"
                        >
                          Em experiência
                        </span>
                      ) : (
                        <span className="ml-2 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-emerald-100 text-emerald-700 align-middle">
                          Efetivado
                        </span>
                      )}
                      {l.sem_data_admissao && (
                        <span title="Ficha sem data de admissão — não dá para calcular a experiência"
                          className="ml-1.5 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-gray-100 text-gray-500 align-middle">
                          Sem data
                        </span>
                      )}
                      {hist.length > 0 && (
                        <div className="mt-1">
                          <button onClick={() => alternarHistorico(l.candidate_id)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                            {historicoAberto.has(l.candidate_id)
                              ? <ChevronDown className="w-3 h-3" />
                              : <ChevronRight className="w-3 h-3" />}
                            <History className="w-3 h-3" />
                            {hist.length} prêmio{hist.length !== 1 ? 's' : ''} recebido{hist.length !== 1 ? 's' : ''}
                          </button>
                          {historicoAberto.has(l.candidate_id) && (
                            <div className="mt-1 ml-4 pl-2.5 border-l-2 border-emerald-200 space-y-0.5">
                              {hist.map(h => (
                                <p key={h.competencia} className="text-[11.5px] text-gray-600 font-normal">
                                  <span className="capitalize">{rotuloCompetencia(h.competencia)}</span>
                                  {' — '}
                                  <strong className="text-emerald-700">{brl(h.valor)}</strong>
                                </p>
                              ))}
                              <p className="text-[11px] text-gray-500 font-normal pt-0.5 border-t mt-1">
                                Total: <strong className="text-gray-700">{brl(hist.reduce((s, h) => s + h.valor, 0))}</strong>
                              </p>
                            </div>
                          )}
                        </div>
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
                          {[l.em_experiencia ? 'Em experiência' : null,
                            l.faltas > 0 ? `${l.faltas} falta${l.faltas !== 1 ? 's' : ''}` : null,
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
              <p><strong>{comValor}</strong> colaboradores{nomeEmpresa ? ` de ${nomeEmpresa}` : ''} vão receber.</p>
              <p>Total: <strong className="text-gray-900">{brl(totalPagar)}</strong>.</p>
              {comValor < elegiveis.length && (
                <p className="text-[12px] text-amber-700">
                  {elegiveis.length - comValor} sem valor preenchido ficam de fora.
                </p>
              )}
              <p className="text-[12px] text-gray-500">
                Fica registrado com seu usuário e a data.
                {nomeEmpresa
                  ? ` Reaprovar substitui apenas o fechamento de ${nomeEmpresa} neste mês; as outras empresas ficam intactas.`
                  : ' Reaprovar substitui o fechamento inteiro deste mês.'}
              </p>
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
