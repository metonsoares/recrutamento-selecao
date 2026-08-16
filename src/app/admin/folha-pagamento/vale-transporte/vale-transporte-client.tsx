'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Bus, Search, CheckCircle2, XCircle, HelpCircle, ExternalLink, Download,
  ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, FileText,
  Check, Copy, Loader2, AlertCircle, History, Pencil, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { gerarPdfTabela } from '@/lib/pdf'

export interface LinhaVT {
  candidate_id: string
  nome: string
  /** só dígitos, para a busca por CPF */
  cpf: string | null
  cargo: string | null
  empresa_id: string | null
  empresa: string | null
  vinculo: 'contratado' | 'intermitente'
  /** null = a ficha ainda não informa */
  recebe: boolean | null
  empresa_transporte: string | null
  passagens: string | null
}

export interface EmpresaOpcao { id: string; nome: string }
export interface RegistroDias { candidate_id: string; competencia: string; dias: number }
interface CicloAprovado { total_dias: number; aprovado_por: string | null }

type Filtro = 'todos' | 'recebe' | 'nao' | 'sem_info'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function rotuloMes(c: string): string {
  const [ano, mes] = c.split('-').map(Number)
  return `${MESES[mes - 1]} de ${ano}`
}

function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function mesVizinho(c: string, delta: number): string {
  const [ano, mes] = c.split('-').map(Number)
  const d = new Date(ano, mes - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function ValeTransporteClient({
  competencia, linhas, empresas, historico, cicloAprovado,
}: {
  competencia: string
  linhas: LinhaVT[]
  empresas: EmpresaOpcao[]
  historico: RegistroDias[]
  cicloAprovado: CicloAprovado | null
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [situacao, setSituacao] = useState<Filtro>('todos')
  const [menuAberto, setMenuAberto] = useState(false)
  // Dias sempre em branco ao abrir: preenchido de saída convida a aprovar sem conferir.
  const [diasPadrao, setDiasPadrao] = useState('')
  const [dias, setDias] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [historicoAberto, setHistoricoAberto] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<{ linha: LinhaVT; registro: RegistroDias; dias: string } | null>(null)
  const [removendo, setRemovendo] = useState<{ linha: LinhaVT; registro: RegistroDias } | null>(null)
  const [processando, setProcessando] = useState(false)

  const padraoNum = Math.trunc(Number(diasPadrao)) || 0

  /** Dias da pessoa no mês: o que foi digitado, senão o padrão do mês. */
  function diasDe(l: LinhaVT): number {
    const d = dias[l.candidate_id]
    if (d !== undefined) return Math.trunc(Number(d)) || 0
    return padraoNum
  }

  const historicoPorCand = useMemo(() => {
    const m = new Map<string, RegistroDias[]>()
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
    if (situacao === 'recebe' && l.recebe !== true) return false
    if (situacao === 'nao' && l.recebe !== false) return false
    if (situacao === 'sem_info' && l.recebe !== null) return false
    const termo = busca.trim()
    if (!termo) return true
    const digitos = termo.replace(/\D/g, '')
    if (digitos.length >= 3 && (l.cpf ?? '').includes(digitos)) return true
    return `${l.nome} ${l.cargo ?? ''}`.toLowerCase().includes(termo.toLowerCase())
  })

  const recebem = filtradas.filter(l => l.recebe === true).length
  const naoRecebem = filtradas.filter(l => l.recebe === false).length
  const semInfo = filtradas.filter(l => l.recebe === null).length
  const comDias = filtradas.filter(l => diasDe(l) > 0).length
  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome
  const baseNome = `vale-transporte-${competencia.slice(0, 7)}${nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''}`

  const alternarHistorico = (id: string) => setHistoricoAberto(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  function aplicarATodos() {
    const texto = diasPadrao.trim()
    setDias(d => {
      const novo = { ...d }
      for (const l of filtradas) novo[l.candidate_id] = texto
      return novo
    })
    setOk(`${padraoNum} dia(s) aplicado(s) a ${filtradas.length} colaborador${filtradas.length !== 1 ? 'es' : ''}.`)
  }

  /** Dias já aprovados nesta competência, por colaborador. */
  const aprovadosNoMes = useMemo(
    () => new Map(historico.filter(h => h.competencia === competencia).map(h => [h.candidate_id, h.dias])),
    [historico, competencia],
  )

  async function aprovar() {
    setSalvando(true); setErro(''); setOk('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/vale-transporte', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competencia,
          dias_padrao: padraoNum,
          escopo_empresa: empresaFiltro || null,
          itens: filtradas.map(l => ({
            candidate_id: l.candidate_id, nome: l.nome, cargo: l.cargo,
            empresa_id: l.empresa_id, empresa_nome: l.empresa, dias: diasDe(l),
          })),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao aprovar.')
      setOk(`${d.aprovados} colaboradores registrados — ${d.total_dias} dia(s) no total.`)
      setConfirmando(false)
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setSalvando(false) }
  }

  async function chamar(metodo: 'PATCH' | 'DELETE', corpo: Record<string, unknown>, msg: string) {
    setProcessando(true); setErro('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/vale-transporte', {
        method: metodo, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro na operação.')
      setOk(msg); setEditando(null); setRemovendo(null)
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setProcessando(false) }
  }

  const CABECALHO = ['Funcionário', 'Empresa', 'Vínculo', 'Vale transporte', 'Dias trabalhados']
  const corpo = () => filtradas.map(l => [
    formatName(l.nome),
    l.empresa ?? '—',
    l.vinculo === 'intermitente' ? 'Intermitente' : 'Contratado',
    l.recebe === true ? 'Sim' : l.recebe === false ? 'Não' : 'Não informado',
    aprovadosNoMes.get(l.candidate_id) ?? diasDe(l) ?? 0,
  ])

  function exportarXlsx() {
    setMenuAberto(false)
    baixarArquivo(gerarXlsx([CABECALHO, ...corpo()], 'Vale transporte'), `${baseNome}.xlsx`)
  }

  async function exportarPdf() {
    setMenuAberto(false)
    const blob = await gerarPdfTabela({
      titulo: 'Vale transporte',
      subtitulo: `${maiuscula(rotuloMes(competencia))} · ${nomeEmpresa ?? 'Todas as empresas'} · ${filtradas.length} colaboradores · ${recebem} recebem`,
      cabecalho: CABECALHO,
      linhas: corpo(),
      paisagem: true,
    })
    baixarArquivo(blob, `${baseNome}.pdf`)
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">

      {/* ── Cabeçalho ── */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Bus className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold leading-tight">Vale transporte</h1>
          <p className="text-sm text-muted-foreground">
            Contratados e intermitentes — quem recebe vem da ficha; os dias você registra por mês.
          </p>
        </div>

        {/* Navegador de mês: o período fica escrito entre as setas. */}
        <div className="inline-flex items-center rounded-lg border bg-white overflow-hidden">
          <Link href={`?competencia=${mesVizinho(competencia, -1)}`} scroll={false}
            className="p-2 hover:bg-gray-50" title="Mês anterior">
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </Link>
          <span className="px-3 text-[13px] font-semibold text-gray-800 border-x whitespace-nowrap">
            {maiuscula(rotuloMes(competencia))}
          </span>
          <Link href={`?competencia=${mesVizinho(competencia, 1)}`} scroll={false}
            className="p-2 hover:bg-gray-50" title="Mês seguinte">
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </Link>
        </div>

        <div className="relative">
          <Button variant="outline" onClick={() => setMenuAberto(o => !o)}
            disabled={filtradas.length === 0} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />Exportar
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </Button>
          {menuAberto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
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
      </div>

      {cicloAprovado && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-[13px] text-emerald-900 flex-1">
            Mês <strong>registrado</strong> — {cicloAprovado.total_dias} dia(s)
            {cicloAprovado.aprovado_por ? ` por ${cicloAprovado.aprovado_por}` : ''}. Reaprovar substitui o registro.
          </p>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, cargo ou CPF…"
            className="h-9 w-full border border-gray-300 rounded-md pl-8 pr-2.5 text-sm bg-white" />
        </div>
        <select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)}
          className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white">
          <option value="">Todas as empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <select value={situacao} onChange={e => setSituacao(e.target.value as Filtro)}
          className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white">
          <option value="todos">Recebendo ou não</option>
          <option value="recebe">Só quem recebe</option>
          <option value="nao">Só quem não recebe</option>
          <option value="sem_info">Só sem informação na ficha</option>
        </select>
        <div className="flex gap-2">
          <input value={diasPadrao} onChange={e => setDiasPadrao(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="Dias do mês" inputMode="numeric"
            className="h-9 flex-1 min-w-0 border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
          <Button variant="outline" onClick={aplicarATodos} disabled={padraoNum <= 0 || filtradas.length === 0}
            className="gap-1.5 shrink-0" title="Aplicar a todos os listados">
            <Copy className="w-3.5 h-3.5" />Todos
          </Button>
          <Button onClick={() => { setErro(''); setOk(''); setConfirmando(true) }}
            disabled={comDias === 0}
            title={comDias === 0 ? 'Preencha os dias de pelo menos um colaborador' : undefined}
            className="gap-1.5 shrink-0">
            <Check className="w-3.5 h-3.5" />Aprovar
          </Button>
        </div>
      </div>

      {/* ── Resumo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Cartao titulo="Listados" valor={String(filtradas.length)} cor="text-gray-900" />
        <Cartao titulo="Recebem" valor={String(recebem)} cor="text-blue-700" />
        <Cartao titulo="Não recebem" valor={String(naoRecebem)} cor="text-red-600" />
        <Cartao titulo="Sem informação" valor={String(semInfo)} cor="text-amber-600" />
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
                <th className="px-4 py-2.5 font-semibold">Empresa</th>
                <th className="px-4 py-2.5 font-semibold">Vale transporte</th>
                <th className="px-4 py-2.5 font-semibold">Dias trabalhados</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtradas.map(l => {
                const hist = historicoPorCand.get(l.candidate_id) ?? []
                const jaAprovado = aprovadosNoMes.get(l.candidate_id)
                return (
                  <tr key={l.candidate_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-gray-900">{formatName(l.nome)}</span>
                      {l.vinculo === 'intermitente' && (
                        <span className="ml-2 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-sky-100 text-sky-700 align-middle">
                          Intermitente
                        </span>
                      )}
                      {l.cargo && <span className="block text-[11px] text-muted-foreground">{l.cargo}</span>}
                      {hist.length > 0 && (
                        <div className="mt-1">
                          <button onClick={() => alternarHistorico(l.candidate_id)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                            {historicoAberto.has(l.candidate_id)
                              ? <ChevronDown className="w-3 h-3" />
                              : <ChevronRight className="w-3 h-3" />}
                            <History className="w-3 h-3" />
                            {hist.length} mês(es) registrado(s)
                          </button>
                          {historicoAberto.has(l.candidate_id) && (
                            <div className="mt-1 ml-4 pl-2.5 border-l-2 border-emerald-200 space-y-0.5">
                              {hist.map(h => (
                                <p key={h.competencia} className="text-[11.5px] text-gray-600 font-normal flex items-center gap-1">
                                  <span>
                                    {maiuscula(rotuloMes(h.competencia))}{' — '}
                                    <strong className="text-emerald-700">{h.dias} dia{h.dias !== 1 ? 's' : ''}</strong>
                                  </span>
                                  <button onClick={() => setEditando({ linha: l, registro: h, dias: String(h.dias) })}
                                    title="Editar os dias" className="p-1 text-gray-400 hover:text-primary hover:bg-gray-100 rounded">
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => setRemovendo({ linha: l, registro: h })}
                                    title="Remover" className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{l.empresa ?? '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {l.recebe === true ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-blue-100 text-blue-700">
                          <CheckCircle2 className="w-3 h-3" />Recebe
                        </span>
                      ) : l.recebe === false ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                          <XCircle className="w-3 h-3" />Não recebe
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-700"
                          title="A ficha do colaborador ainda não informa">
                          <HelpCircle className="w-3 h-3" />Não informado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <input
                          value={dias[l.candidate_id] ?? ''}
                          onChange={e => setDias(d => ({ ...d, [l.candidate_id]: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                          placeholder={padraoNum ? String(padraoNum) : '0'}
                          inputMode="numeric"
                          className="h-8 w-16 border border-gray-300 rounded-md px-2 text-[13px] bg-white text-center"
                        />
                        {jaAprovado != null && (
                          <span className="text-[11px] text-emerald-700 font-medium whitespace-nowrap">
                            {jaAprovado} registrado{jaAprovado !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/admin/candidatos/${l.candidate_id}?tab=ficha`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline whitespace-nowrap">
                        Ficha<ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {filtradas.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nenhum colaborador encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Confirmação ── */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !salvando && setConfirmando(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-4 border-b">
              <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0"><Check className="w-4 h-4 text-emerald-600" /></div>
              <h2 className="text-base font-semibold">Registrar {rotuloMes(competencia)}</h2>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600 space-y-1.5">
              <p><strong>{comDias}</strong> colaboradores{nomeEmpresa ? ` de ${nomeEmpresa}` : ''} terão os dias registrados.</p>
              {comDias < filtradas.length && (
                <p className="text-[12px] text-amber-700">{filtradas.length - comDias} sem dias preenchidos ficam de fora.</p>
              )}
              <p className="text-[12px] text-gray-500">
                Fica registrado com seu usuário e a data.
                {nomeEmpresa
                  ? ` Reaprovar substitui apenas ${nomeEmpresa} neste mês.`
                  : ' Reaprovar substitui o registro inteiro deste mês.'}
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

      {/* ── Editar dias de um mês ── */}
      {editando && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !processando && setEditando(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-4 border-b">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Pencil className="w-4 h-4 text-primary" /></div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold truncate">{formatName(editando.linha.nome)}</h2>
                <p className="text-[11px] text-muted-foreground">{maiuscula(rotuloMes(editando.registro.competencia))}</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-1">
              <label className="text-[11px] font-medium text-gray-600">Dias trabalhados</label>
              <input value={editando.dias} inputMode="numeric" autoFocus
                onChange={e => setEditando(p => p && ({ ...p, dias: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
              <p className="text-[10px] text-muted-foreground">De 1 a 31 dias.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setEditando(null)} disabled={processando}>Cancelar</Button>
              <Button disabled={processando} className="gap-1.5"
                onClick={() => chamar('PATCH', {
                  candidate_id: editando.linha.candidate_id,
                  competencia: editando.registro.competencia,
                  dias: Number(editando.dias) || 0,
                }, `Dias de ${formatName(editando.linha.nome)} atualizados.`)}>
                {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remover registro de um mês ── */}
      {removendo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !processando && setRemovendo(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-4 border-b">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0"><Trash2 className="w-4 h-4 text-red-600" /></div>
              <h2 className="text-base font-semibold text-gray-900">Remover registro</h2>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600">
              Remover os <strong>{removendo.registro.dias} dia(s)</strong> de{' '}
              <strong>{formatName(removendo.linha.nome)}</strong> em{' '}
              <strong>{rotuloMes(removendo.registro.competencia)}</strong>?
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setRemovendo(null)} disabled={processando}>Cancelar</Button>
              <Button variant="destructive" disabled={processando} className="gap-1.5"
                onClick={() => chamar('DELETE', {
                  candidate_id: removendo.linha.candidate_id,
                  competencia: removendo.registro.competencia,
                }, `Registro de ${formatName(removendo.linha.nome)} removido.`)}>
                {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Remover
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Cartao({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div className="rounded-xl border bg-white p-3.5 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{titulo}</p>
      <p className={`text-2xl font-bold ${cor} mt-0.5`}>{valor}</p>
    </div>
  )
}
