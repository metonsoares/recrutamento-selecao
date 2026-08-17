'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Coins, Search, Download, CheckCircle2, AlertCircle, Loader2, Check,
  ExternalLink, History, ChevronLeft, ChevronRight, ChevronDown, Trash2, Pencil,
  FileSpreadsheet, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { gerarPdfTabela } from '@/lib/pdf'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LinhaGorjeta {
  candidate_id: string
  nome: string
  cpf: string | null
  cargo: string | null
  empresa_id: string | null
  empresa: string | null
  vinculo: 'contratado' | 'intermitente'
}

export interface EmpresaOpcao { id: string; nome: string }
export interface PagamentoGorjeta { candidate_id: string; competencia: string; valor: number }

interface CicloAprovado { total: number; aprovado_por: string | null }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const INPUT = 'h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white'

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

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function GorjetasClient({
  competencia, linhas, empresas, historico, pesos, diasTrabalhados, cicloAprovado,
}: {
  competencia: string
  linhas: LinhaGorjeta[]
  empresas: EmpresaOpcao[]
  historico: PagamentoGorjeta[]
  /** candidate_id → peso da função no rateio (padrão 1) */
  pesos: Record<string, number>
  /** candidate_id → dias trabalhados no mês (vem do Vale transporte) */
  diasTrabalhados: Record<string, number>
  cicloAprovado: CicloAprovado | null
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  // Sempre em branco: valor preenchido de saída convida a aprovar sem conferir.
  const [valorPadrao, setValorPadrao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [historicoAberto, setHistoricoAberto] = useState<Set<string>>(new Set())
  const [menuExportar, setMenuExportar] = useState(false)
  const [editando, setEditando] = useState<{ linha: LinhaGorjeta; pagamento: PagamentoGorjeta; valor: string } | null>(null)
  const [removendo, setRemovendo] = useState<{ linha: LinhaGorjeta; pagamento: PagamentoGorjeta } | null>(null)
  const [processando, setProcessando] = useState(false)
  const [pesoEdit, setPesoEdit] = useState<Record<string, string>>({})
  const [diasEdit, setDiasEdit] = useState<Record<string, string>>({})
  const [salvandoPeso, setSalvandoPeso] = useState<string | null>(null)
  const [retencao, setRetencao] = useState('27')
  const [descontos, setDescontos] = useState('')

  const padraoNum = Number(valorPadrao.replace(/\./g, '').replace(',', '.')) || 0

  /** Peso da função no rateio (padrão 1). */
  function pesoDe(l: LinhaGorjeta): number {
    const edit = pesoEdit[l.candidate_id]
    if (edit !== undefined) return Number(edit.replace(',', '.')) || 0
    return pesos[l.candidate_id] ?? 1
  }

  /** Dias trabalhados no mês (vêm do Vale transporte, editáveis aqui). */
  function diasDe(l: LinhaGorjeta): number {
    const edit = diasEdit[l.candidate_id]
    if (edit !== undefined) return Math.trunc(Number(edit)) || 0
    return diasTrabalhados[l.candidate_id] ?? 0
  }

  const historicoPorCand = useMemo(() => {
    const m = new Map<string, PagamentoGorjeta[]>()
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
    const termo = busca.trim()
    if (!termo) return true
    const digitos = termo.replace(/\D/g, '')
    if (digitos.length >= 3 && (l.cpf ?? '').includes(digitos)) return true
    return `${l.nome} ${l.cargo ?? ''}`.toLowerCase().includes(termo.toLowerCase())
  })

  // ── Rateio ponderado (mesma conta da planilha de comissões) ─────────────
  //   líquido = apurado - (apurado x retenção%) - descontos
  //   fator   = dias trabalhados x peso da função
  //   valor   = líquido x fator / soma dos fatores
  // Quem tem mais dias e maior peso puxa a maior fatia; o maior número de
  // dias equivale a 100% do próprio peso, pois se cancela na proporção.
  const retencaoPct = Number(retencao.replace(',', '.')) || 0
  const descontosNum = Number(descontos.replace(/\./g, '').replace(',', '.')) || 0
  const valorRetido = Math.round(padraoNum * (retencaoPct / 100) * 100) / 100
  const liquido = Math.max(0, Math.round((padraoNum - valorRetido - descontosNum) * 100) / 100)

  function fatorDe(l: LinhaGorjeta): number {
    return diasDe(l) * pesoDe(l)
  }
  const somaFatores = filtradas.reduce((s, l) => s + fatorDe(l), 0)

  /** Quanto a pessoa recebe do líquido. */
  function valorDe(l: LinhaGorjeta): number {
    if (somaFatores <= 0 || liquido <= 0) return 0
    return Math.round((liquido * fatorDe(l) / somaFatores) * 100) / 100
  }

  const comValor = filtradas.filter(l => valorDe(l) > 0).length
  const totalPagar = filtradas.reduce((s, l) => s + valorDe(l), 0)
  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome
  const baseNome = `gorjetas-${competencia.slice(0, 7)}${nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''}`

  const alternarHistorico = (id: string) => setHistoricoAberto(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  /** Salva o peso do colaborador (persiste para os próximos meses). */
  async function salvarPeso(l: LinhaGorjeta) {
    const valor = pesoDe(l)
    setSalvandoPeso(l.candidate_id); setErro('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/gorjetas/peso', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: l.candidate_id, peso: valor }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao salvar o peso.')
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setSalvandoPeso(null) }
  }

  async function aprovar() {
    setSalvando(true); setErro(''); setOk('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/gorjetas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competencia,
          valor_padrao: padraoNum,
          retencao_pct: retencaoPct,
          descontos: descontosNum,
          liquido,
          escopo_empresa: empresaFiltro || null,
          itens: filtradas.map(l => ({
            candidate_id: l.candidate_id, nome: l.nome, cargo: l.cargo,
            empresa_id: l.empresa_id, empresa_nome: l.empresa, valor: valorDe(l),
            peso: pesoDe(l), dias: diasDe(l), fator: fatorDe(l),
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

  async function chamar(metodo: 'PATCH' | 'DELETE', corpo: Record<string, unknown>, msg: string) {
    setProcessando(true); setErro('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/gorjetas', {
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

  const CABECALHO = ['Funcionário', 'Empresa', 'Valor']
  function itensExport() {
    const aprovados = historico.filter(h => h.competencia === competencia)
    const porCand = new Map(aprovados.map(h => [h.candidate_id, h.valor]))
    return filtradas
      .map(l => ({ nome: l.nome, empresa: l.empresa, valor: porCand.get(l.candidate_id) ?? valorDe(l) }))
      .filter(i => i.valor > 0)
  }

  function exportarXlsx() {
    setMenuExportar(false)
    const itens = itensExport()
    const total = itens.reduce((s, i) => s + i.valor, 0)
    baixarArquivo(
      gerarXlsx([CABECALHO, ...itens.map(i => [formatName(i.nome), i.empresa ?? '—', i.valor]), ['TOTAL', '', total]], 'Gorjetas'),
      `${baseNome}.xlsx`,
    )
  }

  async function exportarPdf() {
    setMenuExportar(false)
    const itens = itensExport()
    const total = itens.reduce((s, i) => s + i.valor, 0)
    const blob = await gerarPdfTabela({
      titulo: 'Gorjetas',
      subtitulo: `${maiuscula(rotuloMes(competencia))} · ${nomeEmpresa ?? 'Todas as empresas'} · ${itens.length} colaboradores · Total ${brl(total)}`,
      cabecalho: CABECALHO,
      linhas: [...itens.map(i => [formatName(i.nome), i.empresa ?? '—', brl(i.valor)]), ['TOTAL', '', brl(total)]],
    })
    baixarArquivo(blob, `${baseNome}.pdf`)
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Coins className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold leading-tight">Gorjetas</h1>
          <p className="text-sm text-muted-foreground">
            {linhas.length} colaborador{linhas.length !== 1 ? 'es' : ''} com gorjeta marcada na ficha
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

      {/* Filtros e valor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, cargo ou CPF…"
            className="h-9 w-full border border-gray-300 rounded-md pl-8 pr-2.5 text-sm bg-white" />
        </div>
        <select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)} className={INPUT}>
          <option value="">Todas as empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <div className="flex gap-2">
          <Button onClick={() => { setErro(''); setOk(''); setConfirmando(true) }}
            disabled={comValor === 0}
            title={comValor === 0 ? 'Informe o valor apurado e os dias trabalhados' : undefined}
            className="gap-1.5 flex-1">
            <Check className="w-3.5 h-3.5" />Aprovar
          </Button>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Button variant="outline" onClick={() => setMenuExportar(o => !o)} className="gap-1.5 w-full">
              <Download className="w-3.5 h-3.5" />Exportar
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </Button>
            {menuExportar && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuExportar(false)} />
                <div className="absolute right-0 mt-1 z-20 w-52 rounded-xl border bg-white shadow-lg overflow-hidden">
                  <button onClick={exportarXlsx} className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-gray-50">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Excel <span className="text-muted-foreground">(.xlsx)</span></span>
                  </button>
                  <button onClick={exportarPdf} className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-gray-50 border-t">
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

      {/* Apuração do mês: apurado − retenção − descontos = líquido a ratear */}
      <div className="rounded-2xl border bg-white shadow-sm p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Valor apurado no mês</label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
            <input value={valorPadrao} onChange={e => setValorPadrao(e.target.value.replace(/[^\d,.]/g, ''))}
              placeholder="0,00" inputMode="decimal"
              className="h-9 w-full border border-gray-300 rounded-md pl-9 pr-2.5 text-sm bg-white" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Retenção</label>
          <div className="relative">
            <input value={retencao} onChange={e => setRetencao(e.target.value.replace(/[^\d,.]/g, '').slice(0, 5))}
              inputMode="decimal" className="h-9 w-full border border-gray-300 rounded-md px-2.5 pr-7 text-sm bg-white" />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
          </div>
          <p className="text-[10px] text-muted-foreground">−{brl(valorRetido)}</p>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Descontos</label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
            <input value={descontos} onChange={e => setDescontos(e.target.value.replace(/[^\d,.]/g, ''))}
              placeholder="0,00" inputMode="decimal"
              className="h-9 w-full border border-gray-300 rounded-md pl-9 pr-2.5 text-sm bg-white" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Líquido a ratear</label>
          <div className="h-9 flex items-center px-3 rounded-md bg-emerald-50 border border-emerald-200">
            <span className="text-sm font-bold text-emerald-800">{brl(liquido)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Soma dos fatores: {somaFatores.toFixed(2)}</p>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Cartao titulo="Listados" valor={String(filtradas.length)} cor="text-gray-900" />
        <Cartao titulo="Com valor" valor={String(comValor)} cor="text-emerald-700" />
        <Cartao titulo="Total do mês" valor={brl(totalPagar)} cor="text-gray-900" />
      </div>

      {erro && <p className="text-[13px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{erro}</p>}
      {ok && <p className="text-[13px] text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{ok}</p>}

      {/* Lista */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Colaborador</th>
                <th className="px-4 py-2.5 font-semibold hidden md:table-cell">Cargo</th>
                <th className="px-4 py-2.5 font-semibold">Peso</th>
                <th className="px-4 py-2.5 font-semibold">Dias</th>
                <th className="px-4 py-2.5 font-semibold hidden lg:table-cell">Fator</th>
                <th className="px-4 py-2.5 font-semibold hidden sm:table-cell">Empresa</th>
                <th className="px-4 py-2.5 font-semibold">Valor</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtradas.map(l => {
                const hist = historicoPorCand.get(l.candidate_id) ?? []
                return (
                  <tr key={l.candidate_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                      {formatName(l.nome)}
                      {l.vinculo === 'intermitente' && (
                        <span className="ml-2 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-sky-100 text-sky-700 align-middle">
                          Intermitente
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
                            {hist.length} gorjeta{hist.length !== 1 ? 's' : ''} recebida{hist.length !== 1 ? 's' : ''}
                          </button>
                          {historicoAberto.has(l.candidate_id) && (
                            <div className="mt-1 ml-4 pl-2.5 border-l-2 border-emerald-200 space-y-0.5">
                              {hist.map(h => (
                                <p key={h.competencia} className="text-[11.5px] text-gray-600 font-normal flex items-center gap-1">
                                  <span>
                                    {maiuscula(rotuloMes(h.competencia))}{' — '}
                                    <strong className="text-emerald-700">{brl(h.valor)}</strong>
                                  </span>
                                  <button onClick={() => setEditando({ linha: l, pagamento: h, valor: String(h.valor).replace('.', ',') })}
                                    title="Editar o valor" className="p-1 text-gray-400 hover:text-primary hover:bg-gray-100 rounded">
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => setRemovendo({ linha: l, pagamento: h })}
                                    title="Remover" className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
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
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <input
                          value={pesoEdit[l.candidate_id] ?? String(pesos[l.candidate_id] ?? 1).replace('.', ',')}
                          onChange={e => setPesoEdit(pv => ({ ...pv, [l.candidate_id]: e.target.value.replace(/[^\d,.]/g, '').slice(0, 4) }))}
                          onBlur={() => salvarPeso(l)}
                          inputMode="decimal" title="Peso da função (ex.: 1 ou 0,7). Salva ao sair do campo."
                          className="h-8 w-16 border border-gray-300 rounded-md px-2 text-[13px] bg-white text-center"
                        />
                        {salvandoPeso === l.candidate_id && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        value={diasEdit[l.candidate_id] ?? String(diasTrabalhados[l.candidate_id] ?? '')}
                        onChange={e => setDiasEdit(d => ({ ...d, [l.candidate_id]: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                        placeholder="0" inputMode="numeric"
                        title="Dias trabalhados no mês (vêm do Vale transporte)"
                        className="h-8 w-14 border border-gray-300 rounded-md px-2 text-[13px] bg-white text-center"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 hidden lg:table-cell whitespace-nowrap">
                      {fatorDe(l).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 hidden sm:table-cell whitespace-nowrap">{l.empresa ?? '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="font-semibold text-gray-900">{brl(valorDe(l))}</span>
                      {somaFatores > 0 && fatorDe(l) > 0 && (
                        <span className="block text-[10px] text-muted-foreground">
                          {((fatorDe(l) / somaFatores) * 100).toFixed(1)}% do líquido
                        </span>
                      )}
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
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  {linhas.length === 0
                    ? 'Nenhum colaborador está com “Gorjeta: Sim” na ficha do funcionário.'
                    : 'Nenhum colaborador encontrado.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmação de aprovação */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !salvando && setConfirmando(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-4 border-b">
              <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0"><Check className="w-4 h-4 text-emerald-600" /></div>
              <h2 className="text-base font-semibold">Aprovar {rotuloMes(competencia)}</h2>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600 space-y-1.5">
              <p><strong>{comValor}</strong> colaboradores{nomeEmpresa ? ` de ${nomeEmpresa}` : ''} vão receber gorjeta.</p>
              <p>Total: <strong className="text-gray-900">{brl(totalPagar)}</strong>.</p>
              {comValor < filtradas.length && (
                <p className="text-[12px] text-amber-700">{filtradas.length - comValor} sem valor preenchido ficam de fora.</p>
              )}
              <p className="text-[12px] text-gray-500">
                Fica registrado com seu usuário e a data.
                {nomeEmpresa
                  ? ` Reaprovar substitui apenas ${nomeEmpresa} neste mês.`
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

      {/* Editar valor de um período */}
      {editando && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !processando && setEditando(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-4 border-b">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Pencil className="w-4 h-4 text-primary" /></div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold truncate">{formatName(editando.linha.nome)}</h2>
                <p className="text-[11px] text-muted-foreground">{maiuscula(rotuloMes(editando.pagamento.competencia))}</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-1">
              <label className="text-[11px] font-medium text-gray-600">Valor da gorjeta</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
                <input value={editando.valor} inputMode="decimal" autoFocus
                  onChange={e => setEditando(p => p && ({ ...p, valor: e.target.value.replace(/[^\d,.]/g, '') }))}
                  className="h-9 w-full border border-gray-300 rounded-md pl-9 pr-2.5 text-sm bg-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setEditando(null)} disabled={processando}>Cancelar</Button>
              <Button disabled={processando} className="gap-1.5"
                onClick={() => chamar('PATCH', {
                  candidate_id: editando.linha.candidate_id,
                  competencia: editando.pagamento.competencia,
                  valor: Number(editando.valor.replace(/\./g, '').replace(',', '.')) || 0,
                }, `Gorjeta de ${formatName(editando.linha.nome)} atualizada.`)}>
                {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remover gorjeta de um período */}
      {removendo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !processando && setRemovendo(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-4 border-b">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0"><Trash2 className="w-4 h-4 text-red-600" /></div>
              <h2 className="text-base font-semibold text-gray-900">Remover gorjeta</h2>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600">
              Remover a gorjeta de <strong>{formatName(removendo.linha.nome)}</strong> referente a{' '}
              <strong>{rotuloMes(removendo.pagamento.competencia)}</strong> ({brl(removendo.pagamento.valor)})?
              <span className="block mt-1 text-gray-500">O total do mês é recalculado. Se ninguém mais restar, o fechamento é desfeito.</span>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setRemovendo(null)} disabled={processando}>Cancelar</Button>
              <Button variant="destructive" disabled={processando} className="gap-1.5"
                onClick={() => chamar('DELETE', {
                  candidate_id: removendo.linha.candidate_id,
                  competencia: removendo.pagamento.competencia,
                }, `Gorjeta de ${formatName(removendo.linha.nome)} removida.`)}>
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
