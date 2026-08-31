'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ClipboardList, Search, ChevronLeft, ChevronRight, Download, ExternalLink,
  AlertCircle, CheckCircle2, Loader2, MessageSquare, Check, ChevronDown,
  FileSpreadsheet, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName, contemBusca } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { gerarPdfTabela } from '@/lib/pdf'
import { maiuscula, mesVizinho, rotuloMes } from '@/lib/competencia'

export interface LinhaFechamento {
  candidate_id: string
  nome: string
  cpf: string | null
  cargo: string | null
  empresa_id: string | null
  empresa: string | null
  vinculo: 'contratado' | 'intermitente'
  dias_trabalhados: number
  faltas: number
  /** null = a ficha ainda não respondeu */
  vale_transporte: boolean | null
  mensalidade_sindical: boolean | null
  gorjeta: number
  cargo_confianca: boolean | null
  insalubridade_20: boolean | null
  quebra_caixa_15: boolean | null
  /** como veio da ficha: "1.892,34" */
  salario: string | null
  comentario: string
}

export interface EmpresaOpcao { id: string; nome: string }

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** "1.892,34" → 1892.34 */
function paraNumero(v: string | null): number {
  if (!v) return 0
  return Number(v.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
}

/** Sim/Não/— num selo compacto: a tela tem 12 colunas, texto longo não cabe. */
function Selo({ v, tom = 'neutro' }: { v: boolean | null; tom?: 'neutro' | 'alerta' }) {
  if (v === null) return <span className="text-[11px] text-gray-400" title="A ficha não respondeu">—</span>
  if (!v) return <span className="text-[11px] text-gray-400">Não</span>
  return (
    <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
      tom === 'alerta' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
    }`}>Sim</span>
  )
}

export function FechamentoClient({
  competencia, linhas, empresas, temFechamentoVt, temFechamentoGorjeta, aprovacao,
}: {
  competencia: string
  linhas: LinhaFechamento[]
  empresas: EmpresaOpcao[]
  temFechamentoVt: boolean
  temFechamentoGorjeta: boolean
  aprovacao: { aprovado_por: string | null; aprovado_em: string } | null
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [comentarios, setComentarios] = useState<Record<string, string>>(
    () => Object.fromEntries(linhas.map(l => [l.candidate_id, l.comentario])),
  )
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [menuExportar, setMenuExportar] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [aprovando, setAprovando] = useState(false)

  const filtradas = linhas.filter(l => {
    if (empresaFiltro && l.empresa_id !== empresaFiltro) return false
    const termo = busca.trim()
    if (!termo) return true
    const digitos = termo.replace(/\D/g, '')
    if (digitos.length >= 3 && (l.cpf ?? '').includes(digitos)) return true
    return contemBusca(`${l.nome} ${l.cargo ?? ''}`, termo)
  })

  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome
  const totalDias = filtradas.reduce((s, l) => s + l.dias_trabalhados, 0)
  const totalFaltas = filtradas.reduce((s, l) => s + l.faltas, 0)
  const totalGorjeta = filtradas.reduce((s, l) => s + l.gorjeta, 0)
  // Intermitente costuma ter valor/HORA na ficha; somar com mensal daria total
  // falso, então a folha só soma o que é claramente salário mensal.
  const totalSalario = filtradas
    .map(l => paraNumero(l.salario))
    .filter(v => v >= 100)
    .reduce((s, v) => s + v, 0)

  async function salvarComentario(l: LinhaFechamento) {
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
    } catch (e) {
      setErro((e as Error).message)
    } finally { setSalvando(null) }
  }

  const CABECALHO = [
    'Colaborador', 'Empresa', 'Vínculo', 'Dias trabalhados', 'Faltas', 'Vale transporte',
    'Mensalidade sindical', 'Gorjeta', 'Cargo de confiança', 'Insalubridade 20%',
    'Quebra de caixa 15%', 'Salário', 'Comentário',
  ]
  const simNaoTexto = (v: boolean | null) => (v === null ? '' : v ? 'Sim' : 'Não')

  /** Aprova o mês, guardando um retrato dos totais. */
  async function aprovarFechamento() {
    setAprovando(true); setErro(''); setOk('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/fechamento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competencia,
          colaboradores: filtradas.length,
          total_dias: totalDias,
          total_faltas: totalFaltas,
          total_gorjeta: totalGorjeta,
          total_salario: totalSalario,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao aprovar o fechamento.')
      setOk(`Fechamento de ${rotuloMes(competencia)} aprovado.`)
      setConfirmando(false)
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setAprovando(false) }
  }

  /** No PDF a empresa sobe para o título e não se repete em toda linha. */
  async function exportarPdf() {
    setMenuExportar(false)
    const [mes, ano] = maiuscula(rotuloMes(competencia)).split(' de ')
    const blob = await gerarPdfTabela({
      titulo: `Fechamento de folha — ${nomeEmpresa ?? 'Todas as empresas'}`,
      subtitulo: `${mes} / ${ano} · ${filtradas.length} colaboradores · ${totalDias} dias · ${brl(totalSalario)} em salários`,
      cabecalho: ['Colaborador', 'Dias', 'Faltas', 'VT', 'Sindical', 'Gorjeta', 'Confiança', 'Insal.', 'Quebra', 'Salário'],
      linhas: filtradas.map(l => [
        formatName(l.nome), l.dias_trabalhados, l.faltas,
        simNaoTexto(l.vale_transporte), simNaoTexto(l.mensalidade_sindical),
        l.gorjeta > 0 ? brl(l.gorjeta) : '—',
        simNaoTexto(l.cargo_confianca), simNaoTexto(l.insalubridade_20), simNaoTexto(l.quebra_caixa_15),
        l.salario ? brl(paraNumero(l.salario)) : '—',
      ]),
      paisagem: true,
    })
    const sufixo = nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''
    baixarArquivo(blob, `fechamento-folha-${competencia.slice(0, 7)}${sufixo}.pdf`)
  }

  async function exportar() {
    setMenuExportar(false)
    const corpo = filtradas.map(l => [
      formatName(l.nome), l.empresa ?? '—',
      l.vinculo === 'intermitente' ? 'Intermitente' : 'Contratado',
      l.dias_trabalhados, l.faltas,
      simNaoTexto(l.vale_transporte), simNaoTexto(l.mensalidade_sindical),
      l.gorjeta, simNaoTexto(l.cargo_confianca), simNaoTexto(l.insalubridade_20),
      simNaoTexto(l.quebra_caixa_15), paraNumero(l.salario),
      comentarios[l.candidate_id] ?? '',
    ])
    const sufixo = nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''
    baixarArquivo(
      await gerarXlsx([CABECALHO, ...corpo], 'Fechamento'),
      `fechamento-folha-${competencia.slice(0, 7)}${sufixo}.xlsx`,
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5">
      {/* ── Cabeçalho ── */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ClipboardList className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold leading-tight">Fechamento de folha</h1>
          <p className="text-sm text-muted-foreground">
            Tudo do mês numa linha só — dias, faltas, benefícios e salário. Consolidado,
            não digitado: cada número vem da tela que o registra.
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

        <div className="relative">
          <Button variant="outline" onClick={() => setMenuExportar(o => !o)}
            disabled={filtradas.length === 0} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />Exportar
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </Button>
          {menuExportar && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuExportar(false)} />
              <div className="absolute right-0 mt-1 z-20 w-52 rounded-xl border bg-white shadow-lg overflow-hidden">
                <button onClick={exportar}
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
          disabled={filtradas.length === 0} className="gap-1.5">
          <Check className="w-3.5 h-3.5" />Aprovar
        </Button>
      </div>

      {aprovacao && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-[13px] text-emerald-900 flex-1">
            Fechamento <strong>aprovado</strong>
            {aprovacao.aprovado_por ? ` por ${aprovacao.aprovado_por}` : ''} em{' '}
            {new Date(aprovacao.aprovado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.
            Aprovar de novo atualiza o registro com os números de agora.
          </p>
        </div>
      )}

      {/* Sem os fechamentos de origem, colunas inteiras vêm zeradas — melhor
          dizer isso do que deixar o Master concluir que ninguém trabalhou. */}
      {(!temFechamentoVt || !temFechamentoGorjeta) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-900">
            {!temFechamentoVt && (
              <>Os <strong>dias trabalhados</strong> ainda não foram aprovados em{' '}
                <Link href={`/admin/folha-pagamento/vale-transporte?competencia=${competencia}`}
                  className="underline font-semibold">Vale transporte</Link>.{' '}</>
            )}
            {!temFechamentoGorjeta && (
              <>As <strong>gorjetas</strong> ainda não foram aprovadas em{' '}
                <Link href={`/admin/folha-pagamento/gorjetas?competencia=${competencia}`}
                  className="underline font-semibold">Gorjetas</Link>.</>
            )}
          </p>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, cargo ou CPF…"
            className="h-9 w-full border border-gray-300 rounded-md pl-8 pr-2.5 text-sm bg-white" />
        </div>
        <select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)}
          className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white">
          <option value="">Todas as empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </div>

      {/* ── Resumo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Cartao titulo="Colaboradores" valor={String(filtradas.length)} cor="text-gray-900" />
        <Cartao titulo="Dias trabalhados" valor={String(totalDias)} cor="text-blue-700" />
        <Cartao titulo="Faltas" valor={String(totalFaltas)} cor={totalFaltas > 0 ? 'text-red-600' : 'text-gray-900'} />
        <Cartao titulo="Gorjetas" valor={brl(totalGorjeta)} cor="text-amber-700" />
        <Cartao titulo="Salários (mensais)" valor={brl(totalSalario)} cor="text-emerald-700" />
      </div>

      {erro && <p className="text-[13px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{erro}</p>}
      {ok && <p className="text-[13px] text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{ok}</p>}

      {confirmando && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setConfirmando(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold">Aprovar o fechamento</h2>
            <p className="text-[13px] text-gray-700">
              Registrar o fechamento de <strong>{maiuscula(rotuloMes(competencia))}</strong>
              {nomeEmpresa ? <> para <strong>{nomeEmpresa}</strong></> : ' para todas as empresas'} —{' '}
              {filtradas.length} colaboradores, {totalDias} dias, {brl(totalSalario)} em salários.
            </p>
            {(!temFechamentoVt || !temFechamentoGorjeta) && (
              <p className="text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                Atenção: {!temFechamentoVt && 'os dias trabalhados'}
                {!temFechamentoVt && !temFechamentoGorjeta && ' e '}
                {!temFechamentoGorjeta && 'as gorjetas'} ainda não foram aprovados neste mês.
              </p>
            )}
            <p className="text-[12px] text-muted-foreground">
              Fica guardado quem aprovou e um retrato dos totais deste momento.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmando(false)} disabled={aprovando}>Cancelar</Button>
              <Button onClick={aprovarFechamento} disabled={aprovando} className="gap-1.5">
                {aprovando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Aprovar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lista ── */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Colaborador</th>
                <th className="px-3 py-2 font-semibold">Empresa</th>
                <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Dias</th>
                <th className="px-3 py-2 font-semibold text-center">Faltas</th>
                <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">VT</th>
                <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Sindical</th>
                <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Gorjeta</th>
                <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Confiança</th>
                <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Insal. 20%</th>
                <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Quebra 15%</th>
                <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Salário</th>
                <th className="px-3 py-2 font-semibold min-w-[200px]">Comentário</th>
                <th className="px-3 py-2 w-px" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtradas.map(l => (
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
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{l.empresa ?? '—'}</td>
                  <td className="px-3 py-2 text-center font-semibold text-gray-900">{l.dias_trabalhados || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {l.faltas > 0
                      ? <span className="font-semibold text-red-600">{l.faltas}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center"><Selo v={l.vale_transporte} /></td>
                  <td className="px-3 py-2 text-center"><Selo v={l.mensalidade_sindical} /></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {l.gorjeta > 0 ? <span className="font-medium text-amber-700">{brl(l.gorjeta)}</span> : <span className="text-gray-400">—</span>}
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
                        onChange={e => setComentarios(c => ({ ...c, [l.candidate_id]: e.target.value }))}
                        onBlur={() => salvarComentario(l)}
                        placeholder="Anotação do mês…"
                        className="h-8 w-full min-w-[160px] border border-gray-300 rounded-md px-2 text-[13px] bg-white"
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
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhum colaborador neste filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Cartao({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={`text-xl font-bold ${cor}`}>{valor}</p>
    </div>
  )
}
