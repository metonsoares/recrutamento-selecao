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
import { formatarHoras } from '@/lib/horas'

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

  // Lançamentos do mês, como estavam na aprovação (0 = não houve).
  domingos: number
  feriados: number
  avarias: number
  adiantamento: number
  horas_normais: number
  horas_50: number
  horas_100: number
  adicional_noturno: number
  gratificacao: number
  confianca_valor: number
  quebra_valor: number
  atrasos: number
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

/** Horas do mês numa célula de PDF. */
function resumoHoras(l: ItemAprovado): string {
  return [
    l.horas_normais > 0 ? `${formatarHoras(l.horas_normais)} Horas normais` : '',
    l.adicional_noturno > 0 ? `${formatarHoras(l.adicional_noturno)} Noturno 20%` : '',
    l.horas_50 > 0 ? `${formatarHoras(l.horas_50)} HE 50%` : '',
    l.horas_100 > 0 ? `${formatarHoras(l.horas_100)} HE 100%` : '',
    l.atrasos > 0 ? `${formatarHoras(l.atrasos)} Atrasos` : '',
  ].filter(Boolean).join('\n')
}


/** Sim em verde, Não em vermelho — igual ao Fechamento de folha. */
function SimNao({ v }: { v: boolean | null }) {
  if (v === null) return null
  return (
    <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
      v ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
    }`}>{v ? 'Sim' : 'Não'}</span>
  )
}

/**
 * Nome do arquivo exportado: "202608 - Folha - M3-Cafeteria-Cristal".
 * Começar pela competência AAAAMM faz a pasta se ordenar por mês sozinha.
 */
function nomeArquivo(competencia: string, empresa: string): string {
  const comp = competencia.slice(0, 7).replace('-', '')
  const nome = empresa
    // Mantém acento e número; o resto (espaço, hífen solto, ponto) vira um
    // hífen só — nome de arquivo com "/" ou ":" o sistema recusa.
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return `${comp} - Folha - ${nome}`
}

const CABECALHO = [
  'Colaborador', 'Dias trabalhados', 'Vale transporte', 'Faltas', 'Domingos',
  'Feriados', 'Mensalidade sindical', 'Avarias', 'Adiantamento salarial', 'Horas normais',
  'Horas 50%', 'Horas 100%', 'Adicional noturno 20%', 'Atrasos', 'Gratificação', 'Insalubridade 20%',
  'Cargo de confiança', 'Quebra de caixa', 'Gorjeta', 'Salário', 'Comentário',
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

  // O comentário BASE vem sempre das props; o estado guarda só o que foi
  // editado agora. Inicializar o mapa uma vez fazia o mês seguinte herdar o
  // mapa do anterior — na navegação por mês o componente não remonta —, e o
  // campo (e a exportação) apareciam vazios.
  const [editados, setEditados] = useState<Record<string, string>>({})
  const [mesEditado, setMesEditado] = useState(competencia)
  if (mesEditado !== competencia) { setMesEditado(competencia); setEditados({}) }

  const comentarioDe = (l: ItemAprovado) => editados[l.candidate_id] ?? l.comentario
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
    const texto = comentarioDe(l)
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
      formatName(l.nome),
      l.dias_trabalhados, simNaoTexto(l.vale_transporte), l.faltas, l.domingos, l.feriados,
      simNaoTexto(l.mensalidade_sindical), l.avarias, l.adiantamento,
      formatarHoras(l.horas_normais), formatarHoras(l.horas_50), formatarHoras(l.horas_100),
      formatarHoras(l.adicional_noturno), formatarHoras(l.atrasos),
      l.gratificacao, simNaoTexto(l.insalubridade_20), l.confianca_valor, l.quebra_valor,
      l.gorjeta, paraNumero(l.salario), comentarioDe(l),
    ])
    baixarArquivo(
      await gerarXlsx([CABECALHO, ...corpo], 'Folha aprovada'),
      `${nomeArquivo(competencia, e.empresa_nome)}.xlsx`,
    )
  }

  /** Uma linha por colaborador, em paisagem — o formato de conferência. */
  async function exportarPdf(e: EmpresaAprovada) {
    setMenu(null)
    const [mes, ano] = maiuscula(rotuloMes(competencia)).split(' de ')
    const linhas = filtrar(e)
    const blob = await gerarPdfTabela({
      // A empresa sobe para o título e não se repete em toda linha.
      titulo: `Folha aprovada — ${e.empresa_nome}`,
      subtitulo: `${mes} / ${ano} · ${linhas.length} colaboradores · aprovada${e.aprovado_por ? ` por ${e.aprovado_por}` : ''} em ${dataHora(e.aprovado_em)}`,
      cabecalho: [
        'Colaborador', 'Dias', 'VT', 'Faltas', 'Dom/Fer', 'Sindical', 'Avarias', 'Adiant.',
        'Horas extras', 'Gratif.', 'Insal.', 'Confiança', 'Quebra', 'Gorjeta',
        'Salário', 'Comentário',
      ],
      linhas: linhas.map(l => [
        formatName(l.nome), l.dias_trabalhados || '', simNaoTexto(l.vale_transporte),
        l.faltas || '', l.domingos + l.feriados || '', simNaoTexto(l.mensalidade_sindical),
        l.avarias > 0 ? brl(l.avarias) : '',
        l.adiantamento > 0 ? brl(l.adiantamento) : '',
        resumoHoras(l), l.gratificacao > 0 ? brl(l.gratificacao) : '',
        simNaoTexto(l.insalubridade_20),
        l.confianca_valor > 0 ? brl(l.confianca_valor) : '',
        l.quebra_valor > 0 ? brl(l.quebra_valor) : '',
        l.gorjeta > 0 ? brl(l.gorjeta) : '',
        l.salario ? brl(paraNumero(l.salario)) : '',
        comentarioDe(l),
      ]),
      paisagem: true,
      compacto: true,
    })
    baixarArquivo(blob, `${nomeArquivo(competencia, e.empresa_nome)}.pdf`)
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
                      {/* border-separate: a coluna presa à direita precisa
                          pintar o próprio fundo e a própria borda. */}
                      <table className="w-full text-sm border-separate border-spacing-0">
                        <thead className="bg-gray-50">
                          <tr className="text-left text-[11px] uppercase text-muted-foreground align-bottom [&>th]:border-b [&>th]:border-gray-200">
                            <th className="px-3 py-2 font-semibold">Colaborador</th>
                            <th className="px-2 py-2 font-semibold text-center min-w-[100px] break-words">Dias trabalhados</th>
                            <th className="px-2 py-2 font-semibold text-center min-w-[96px] break-words">Vale transporte</th>
                            <th className="px-2 py-2 font-semibold text-center min-w-[64px] break-words">Faltas</th>
                            <th className="px-2 py-2 font-semibold text-center min-w-[92px] break-words">Domingos e feriados</th>
                            <th className="px-2 py-2 font-semibold text-center min-w-[104px] break-words">Mensalidade sindical</th>
                            <th className="px-2 py-2 font-semibold text-right min-w-[80px] break-words">Avarias</th>
                            <th className="px-2 py-2 font-semibold text-right min-w-[112px] break-words">Adiantamento salarial</th>
                            <th className="px-2 py-2 font-semibold text-center min-w-[136px] break-words">Horas extras</th>
                            <th className="px-2 py-2 font-semibold text-right min-w-[104px] break-words">Gratificação</th>
                            <th className="px-2 py-2 font-semibold text-center min-w-[112px] break-words">Insalubridade 20%</th>
                            <th className="px-2 py-2 font-semibold text-right min-w-[104px] break-words">Cargo de confiança</th>
                            <th className="px-2 py-2 font-semibold text-right min-w-[96px] break-words">Quebra de caixa</th>
                            <th className="px-2 py-2 font-semibold text-right min-w-[84px] break-words">Gorjeta</th>
                            <th className="px-3 py-2 font-semibold text-right">Salário</th>
                            <th className="px-3 py-2 font-semibold min-w-[180px]">Comentário</th>
                            <th className="pl-4 pr-5 py-2 w-px sticky right-0 z-20 bg-gray-50" />
                          </tr>
                        </thead>
                        <tbody className="[&>tr>td]:border-t [&>tr>td]:border-gray-200">
                          {linhas.map(l => (
                            <tr key={l.candidate_id} className="group hover:bg-gray-50 align-top">
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className="font-medium text-gray-900">{formatName(l.nome)}</span>
                                {l.vinculo === 'intermitente' && (
                                  <span className="ml-1.5 text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 bg-sky-100 text-sky-700 align-middle">
                                    Interm.
                                  </span>
                                )}
                                {l.cargo && <span className="block text-[11px] text-muted-foreground">{l.cargo}</span>}
                              </td>
                              <td className="px-2 py-2 text-center font-semibold text-gray-900">{l.dias_trabalhados || ''}</td>
                              <td className="px-2 py-2 text-center"><SimNao v={l.vale_transporte} /></td>
                              <td className="px-2 py-2 text-center">
                                {l.faltas > 0 && <span className="font-semibold text-red-600">{l.faltas}</span>}
                              </td>
                              <td className="px-2 py-2 text-center whitespace-nowrap">
                                {l.domingos + l.feriados > 0 && (
                                  <span className="font-medium text-gray-800"
                                    title={`${l.domingos} domingo(s) · ${l.feriados} feriado(s)`}>
                                    {l.domingos + l.feriados}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-center">
                                {l.mensalidade_sindical === true && <SimNao v={true} />}
                              </td>
                              <td className="px-2 py-2 text-right whitespace-nowrap">
                                {l.avarias > 0 && <span className="font-medium text-red-700">{brl(l.avarias)}</span>}
                              </td>
                              <td className="px-2 py-2 text-right whitespace-nowrap">
                                {l.adiantamento > 0 && <span className="font-medium text-red-700">{brl(l.adiantamento)}</span>}
                              </td>
                              {/* Uma linha por tipo, com o rótulo ao lado do tempo: a
                                  abreviação solta ("00:33 not.") não se lia. */}
                              <td className="px-2 py-2 text-[11.5px] text-gray-700 whitespace-nowrap">
                                {l.horas_normais > 0 && <span className="block">{formatarHoras(l.horas_normais)} Horas normais</span>}
                                {l.adicional_noturno > 0 && <span className="block">{formatarHoras(l.adicional_noturno)} Noturno 20%</span>}
                                {l.horas_50 > 0 && <span className="block">{formatarHoras(l.horas_50)} HE 50%</span>}
                                {l.horas_100 > 0 && <span className="block">{formatarHoras(l.horas_100)} HE 100%</span>}
                                {l.atrasos > 0 && <span className="block text-red-600">{formatarHoras(l.atrasos)} Atrasos</span>}
                              </td>
                              <td className="px-2 py-2 text-right whitespace-nowrap">
                                {l.gratificacao > 0 && <span className="font-medium text-emerald-700">{brl(l.gratificacao)}</span>}
                              </td>
                              <td className="px-2 py-2 text-center">
                                {l.insalubridade_20 === true && <SimNao v={true} />}
                              </td>
                              <td className="px-2 py-2 text-right whitespace-nowrap">
                                {l.confianca_valor > 0 && <span className="font-medium text-gray-900">{brl(l.confianca_valor)}</span>}
                              </td>
                              <td className="px-2 py-2 text-right whitespace-nowrap">
                                {l.quebra_valor > 0 && <span className="font-medium text-gray-900">{brl(l.quebra_valor)}</span>}
                              </td>
                              <td className="px-2 py-2 text-right whitespace-nowrap">
                                {l.gorjeta > 0 && <span className="font-medium text-amber-700">{brl(l.gorjeta)}</span>}
                              </td>
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
                                    value={comentarioDe(l)}
                                    onChange={ev => setEditados(c => ({ ...c, [l.candidate_id]: ev.target.value }))}
                                    onBlur={() => salvarComentario(l)}
                                    placeholder="Anotação do mês…"
                                    className="h-8 w-full min-w-[150px] border border-gray-300 rounded-md px-2 text-[13px] bg-white"
                                  />
                                  {salvando === l.candidate_id && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />}
                                </div>
                              </td>
                              <td className="pl-4 pr-5 py-2 text-right sticky right-0 z-10 bg-white group-hover:bg-gray-50">
                                <Link href={`/admin/candidatos/${l.candidate_id}?tab=ficha`}
                                  className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline whitespace-nowrap">
                                  Ficha<ExternalLink className="w-3 h-3" />
                                </Link>
                              </td>
                            </tr>
                          ))}
                          {linhas.length === 0 && (
                            <tr>
                              <td colSpan={17} className="px-4 py-8 text-center text-sm text-muted-foreground">
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
