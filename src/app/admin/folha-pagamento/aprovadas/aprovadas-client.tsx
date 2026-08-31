'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCheck, Download, ChevronDown, ChevronRight, ChevronLeft, ExternalLink,
  MessageSquare, FileSpreadsheet, FileText, Search, Building2, Loader2, Trash2,
  AlertCircle, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatName, contemBusca } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { gerarPdfTabela } from '@/lib/pdf'
import { maiuscula, mesVizinho, rotuloMes } from '@/lib/competencia'

export interface ItemAprovado {
  candidate_id: string
  nome: string
  cargo: string | null
  vinculo: 'contratado' | 'intermitente'
  dias_trabalhados: number
  faltas: number
  /** null = a ficha não tinha resposta na hora da aprovação */
  vale_transporte: boolean | null
  mensalidade_sindical: boolean | null
  gorjeta: number
  cargo_confianca: boolean | null
  insalubridade_20: boolean | null
  quebra_caixa_15: boolean | null
  /** como veio da ficha: "R$ 1.892,34" */
  salario: string | null
  comentario: string
}

export interface EmpresaAprovada {
  ciclo_id: string
  empresa_id: string | null
  empresa_nome: string
  aprovado_por: string | null
  aprovado_em: string
  totais: {
    colaboradores: number
    total_dias: number
    total_faltas: number
    total_gorjeta: number
    total_salario: number
  }
  linhas: ItemAprovado[]
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
/** "R$ 1.892,34" → 1892.34 */
function paraNumero(v: string | null): number {
  if (!v) return 0
  return Number(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
}
function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
const simNaoTexto = (v: boolean | null) => (v === null ? '' : v ? 'Sim' : 'Não')

/** Sim/Não/— num selo compacto, igual ao Fechamento de folha. */
function Selo({ v, tom = 'neutro' }: { v: boolean | null; tom?: 'neutro' | 'alerta' }) {
  if (v === null) return <span className="text-[11px] text-gray-400" title="A ficha não respondeu">—</span>
  if (!v) return <span className="text-[11px] text-gray-400">Não</span>
  return (
    <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
      tom === 'alerta' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
    }`}>Sim</span>
  )
}

const CABECALHO = [
  'Colaborador', 'Vínculo', 'Dias', 'Faltas', 'Vale transporte', 'Mensalidade sindical',
  'Gorjeta', 'Cargo de confiança', 'Insalubridade 20%', 'Quebra de caixa 15%', 'Salário', 'Comentário',
]

export function AprovadasClient({
  competencia, empresas, outras,
}: {
  competencia: string
  empresas: EmpresaAprovada[]
  /** Outros fechamentos do mesmo mês (gorjetas, vale transporte, lançamentos). */
  outras: string[]
}) {
  const router = useRouter()
  // Poucas empresas por mês: todas já abertas evita um clique por cartão.
  const [abertos, setAbertos] = useState<Set<string>>(
    () => new Set(empresas.map(e => e.ciclo_id)),
  )
  const [menu, setMenu] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  const [comentarios, setComentarios] = useState<Record<string, string>>(
    () => Object.fromEntries(empresas.flatMap(e => e.linhas.map(l => [l.candidate_id, l.comentario]))),
  )
  const [salvando, setSalvando] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<EmpresaAprovada | null>(null)

  const alternarCard = (id: string) => setAbertos(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  function filtrar(e: EmpresaAprovada): ItemAprovado[] {
    const termo = busca.trim()
    if (!termo) return e.linhas
    return e.linhas.filter(l => contemBusca(`${l.nome} ${l.cargo ?? ''}`, termo))
  }

  async function salvarComentario(l: ItemAprovado) {
    const texto = comentarios[l.candidate_id] ?? ''
    if (texto === l.comentario) return          // nada mudou
    setSalvando(l.candidate_id); setErro(''); setOk('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/fechamento', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competencia, candidate_id: l.candidate_id, comentario: texto }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao salvar o comentário.')
      l.comentario = texto                      // evita regravar no próximo blur
      setOk(`Comentário de ${formatName(l.nome)} salvo.`)
    } catch (err) {
      setErro((err as Error).message)
    } finally { setSalvando(null) }
  }

  /**
   * Exclui a folha aprovada da empresa. Não existe "reaprovar por cima": o
   * mesmo colaborador não pode constar duas vezes na folha do mês, então
   * refazer é excluir aqui e aprovar de novo no Fechamento.
   */
  async function excluir(e: EmpresaAprovada) {
    setExcluindo(e.ciclo_id); setErro(''); setOk('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/fechamento', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competencia, empresa_id: e.empresa_id }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao excluir a folha.')
      setOk(
        `Folha de ${e.empresa_nome} em ${rotuloMes(competencia)} excluída. `
        + 'Para tê-la de volta, aprove de novo no Fechamento de folha.',
      )
      setConfirmando(null)
      router.refresh()
    } catch (err) {
      setErro((err as Error).message)
    } finally { setExcluindo(null) }
  }

  async function exportarXlsx(e: EmpresaAprovada) {
    setMenu(null)
    const corpo = filtrar(e).map(l => [
      formatName(l.nome), l.vinculo === 'intermitente' ? 'Intermitente' : 'Contratado',
      l.dias_trabalhados, l.faltas,
      simNaoTexto(l.vale_transporte), simNaoTexto(l.mensalidade_sindical), l.gorjeta,
      simNaoTexto(l.cargo_confianca), simNaoTexto(l.insalubridade_20), simNaoTexto(l.quebra_caixa_15),
      paraNumero(l.salario), comentarios[l.candidate_id] ?? '',
    ])
    baixarArquivo(
      await gerarXlsx([CABECALHO, ...corpo], 'Folha aprovada'),
      `folha-aprovada-${competencia.slice(0, 7)}-${e.empresa_nome.replace(/[^\w]+/g, '-')}.xlsx`,
    )
  }

  async function exportarPdf(e: EmpresaAprovada) {
    setMenu(null)
    const [mes, ano] = maiuscula(rotuloMes(competencia)).split(' de ')
    const linhas = filtrar(e)
    const blob = await gerarPdfTabela({
      // A empresa sobe para o título e não se repete em toda linha.
      titulo: `Folha aprovada — ${e.empresa_nome}`,
      subtitulo: `${mes} / ${ano} · ${linhas.length} colaboradores · aprovada${e.aprovado_por ? ` por ${e.aprovado_por}` : ''} em ${dataHora(e.aprovado_em)}`,
      cabecalho: ['Colaborador', 'Dias', 'Faltas', 'VT', 'Sindical', 'Gorjeta', 'Confiança', 'Insal.', 'Quebra', 'Salário'],
      linhas: linhas.map(l => [
        formatName(l.nome), l.dias_trabalhados, l.faltas,
        simNaoTexto(l.vale_transporte), simNaoTexto(l.mensalidade_sindical),
        l.gorjeta > 0 ? brl(l.gorjeta) : '—',
        simNaoTexto(l.cargo_confianca), simNaoTexto(l.insalubridade_20), simNaoTexto(l.quebra_caixa_15),
        l.salario ? brl(paraNumero(l.salario)) : '—',
      ]),
      paisagem: true,
    })
    baixarArquivo(blob, `folha-aprovada-${competencia.slice(0, 7)}-${e.empresa_nome.replace(/[^\w]+/g, '-')}.pdf`)
  }

  const todasEmpresas = Array.from(new Set(empresas.map(e => e.empresa_nome)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const visiveis = empresas.filter(e => !empresaFiltro || e.empresa_nome === empresaFiltro)

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <CheckCheck className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold leading-tight">Folhas aprovadas</h1>
          <p className="text-sm text-muted-foreground">
            No mês escolhido, só as empresas que já tiveram a folha aprovada — com o
            retrato de cada colaborador na hora da aprovação. O comentário continua
            editável; para refazer uma folha, exclua e aprove de novo no Fechamento.
          </p>
        </div>

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

      {empresas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome ou cargo…"
              className="h-9 w-full border border-gray-300 rounded-md pl-8 pr-2.5 text-sm bg-white" />
          </div>
          <select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)}
            className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white">
            <option value="">Todas as empresas</option>
            {todasEmpresas.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}

      {erro && <p className="text-[13px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{erro}</p>}
      {ok && <p className="text-[13px] text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{ok}</p>}

      {visiveis.length === 0 && (
        <div className="rounded-2xl border bg-white shadow-sm p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma folha aprovada em {maiuscula(rotuloMes(competencia))}. Aprove o mês em{' '}
            <Link href={`/admin/folha-pagamento/fechamento?competencia=${competencia}`}
              className="text-primary underline">Fechamento de folha</Link>{' '}
            que ele aparece aqui.
          </p>
        </div>
      )}

      {visiveis.length > 0 && (
        <p className="text-[12.5px] text-muted-foreground">
          {visiveis.length === 1 ? '1 empresa aprovada' : `${visiveis.length} empresas aprovadas`}
          {outras.length > 0 && <> · também aprovado no mês: {outras.join(', ')}</>}
        </p>
      )}

      {confirmando && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setConfirmando(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3"
            onClick={ev => ev.stopPropagation()}>
            <h2 className="text-base font-semibold">Excluir a folha aprovada</h2>
            <p className="text-[13px] text-gray-700">
              A folha de <strong>{confirmando.empresa_nome}</strong> em{' '}
              <strong>{maiuscula(rotuloMes(competencia))}</strong> sai da lista, com os{' '}
              {confirmando.totais.colaboradores} colaboradores dela.
            </p>
            <p className="text-[12.5px] text-muted-foreground">
              Para tê-la de volta é preciso aprovar o mês outra vez no Fechamento de
              folha — não dá para aprovar por cima, porque o mesmo colaborador não pode
              constar duas vezes na folha do mês.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmando(null)}
                disabled={excluindo === confirmando.ciclo_id}>Cancelar</Button>
              <Button onClick={() => excluir(confirmando)}
                disabled={excluindo === confirmando.ciclo_id}
                className="gap-1.5 bg-red-600 hover:bg-red-700">
                {excluindo === confirmando.ciclo_id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {visiveis.map(e => {
              const aberto = abertos.has(e.ciclo_id)
              const linhas = filtrar(e)
              return (
                <div key={e.ciclo_id} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 p-4 flex-wrap">
                    <button onClick={() => alternarCard(e.ciclo_id)}
                      className="flex items-center gap-2 flex-1 min-w-[260px] text-left">
                      {aberto ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      <Building2 className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-bold text-gray-900">{e.empresa_nome}</span>
                      <span className="text-[12px] text-muted-foreground">
                        {e.totais.colaboradores} colaboradores · {e.totais.total_dias} dias · {brl(e.totais.total_salario)}
                      </span>
                    </button>
                    <span className="text-[11.5px] text-muted-foreground">
                      aprovada{e.aprovado_por ? ` por ${e.aprovado_por}` : ''} em {dataHora(e.aprovado_em)}
                    </span>
                    <div className="relative">
                      <Button variant="outline" size="sm"
                        onClick={() => setMenu(m => (m === e.ciclo_id ? null : e.ciclo_id))}
                        disabled={linhas.length === 0} className="gap-1.5">
                        <Download className="w-3.5 h-3.5" />Exportar
                        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                      </Button>
                      {menu === e.ciclo_id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                          <div className="absolute right-0 mt-1 z-20 w-48 rounded-xl border bg-white shadow-lg overflow-hidden">
                            <button onClick={() => exportarXlsx(e)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-gray-50">
                              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />Excel
                            </button>
                            <button onClick={() => exportarPdf(e)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-gray-50 border-t">
                              <FileText className="w-4 h-4 text-red-600 shrink-0" />PDF
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <Button size="sm" variant="outline"
                      onClick={() => { setErro(''); setOk(''); setConfirmando(e) }}
                      disabled={excluindo === e.ciclo_id}
                      className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
                      {excluindo === e.ciclo_id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                      Excluir
                    </Button>
                  </div>

                  {aberto && (
                    <div className="border-t overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2 font-semibold">Colaborador</th>
                            <th className="px-3 py-2 font-semibold text-center">Dias</th>
                            <th className="px-3 py-2 font-semibold text-center">Faltas</th>
                            <th className="px-3 py-2 font-semibold text-center">VT</th>
                            <th className="px-3 py-2 font-semibold text-center">Sindical</th>
                            <th className="px-3 py-2 font-semibold text-right">Gorjeta</th>
                            <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Confiança</th>
                            <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Insal. 20%</th>
                            <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Quebra 15%</th>
                            <th className="px-3 py-2 font-semibold text-right">Salário</th>
                            <th className="px-3 py-2 font-semibold min-w-[180px]">Comentário</th>
                            <th className="px-3 py-2 w-px" />
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {linhas.map(l => (
                            <tr key={l.candidate_id} className="hover:bg-gray-50 align-top">
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className="font-medium text-gray-900">{formatName(l.nome)}</span>
                                {l.vinculo === 'intermitente' && (
                                  <span className="ml-1.5 text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 bg-sky-100 text-sky-700 align-middle">
                                    Interm.
                                  </span>
                                )}
                                {l.cargo && <span className="block text-[11px] text-muted-foreground">{l.cargo}</span>}
                              </td>
                              <td className="px-3 py-2 text-center font-semibold text-gray-900">{l.dias_trabalhados || '—'}</td>
                              <td className="px-3 py-2 text-center">
                                {l.faltas > 0
                                  ? <span className="font-semibold text-red-600">{l.faltas}</span>
                                  : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-3 py-2 text-center"><Selo v={l.vale_transporte} /></td>
                              <td className="px-3 py-2 text-center"><Selo v={l.mensalidade_sindical} /></td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                {l.gorjeta > 0
                                  ? <span className="font-medium text-amber-700">{brl(l.gorjeta)}</span>
                                  : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-3 py-2 text-center"><Selo v={l.cargo_confianca} tom="alerta" /></td>
                              <td className="px-3 py-2 text-center"><Selo v={l.insalubridade_20} tom="alerta" /></td>
                              <td className="px-3 py-2 text-center"><Selo v={l.quebra_caixa_15} tom="alerta" /></td>
                              <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-gray-900">
                                {l.salario
                                  ? <>{brl(paraNumero(l.salario))}
                                      {paraNumero(l.salario) < 100 && (
                                        <span className="block text-[10px] font-normal text-muted-foreground">/hora</span>
                                      )}
                                    </>
                                  : <span className="text-gray-400 font-normal">—</span>}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <MessageSquare className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                                  <input
                                    value={comentarios[l.candidate_id] ?? ''}
                                    onChange={ev => setComentarios(c => ({ ...c, [l.candidate_id]: ev.target.value }))}
                                    onBlur={() => salvarComentario(l)}
                                    placeholder="Anotação do mês…"
                                    className="h-8 w-full min-w-[150px] border border-gray-300 rounded-md px-2 text-[13px] bg-white"
                                  />
                                  {salvando === l.candidate_id && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Link href={`/admin/candidatos/${l.candidate_id}?tab=ficha`}
                                  className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline whitespace-nowrap">
                                  Ficha<ExternalLink className="w-3 h-3" />
                                </Link>
                              </td>
                            </tr>
                          ))}
                          {linhas.length === 0 && (
                            <tr>
                              <td colSpan={12} className="px-4 py-8 text-center text-sm text-muted-foreground">
                                Nenhum colaborador nesta busca.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
