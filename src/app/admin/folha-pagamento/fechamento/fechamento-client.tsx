'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ClipboardList, Search, ChevronLeft, ChevronRight, Download, ExternalLink,
  AlertCircle, CheckCircle2, Loader2, MessageSquare, Check, ChevronDown,
  FileSpreadsheet, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatName, contemBusca } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { gerarPdfTabela } from '@/lib/pdf'
import { maiuscula, mesVizinho, rotuloMes } from '@/lib/competencia'
import { formatarHoras } from '@/lib/horas'
import type { LinhaFechamento, EmpresaOpcao } from '@/lib/fechamento-folha'

export type { LinhaFechamento, EmpresaOpcao } from '@/lib/fechamento-folha'

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** "1.892,34" → 1892.34 */
function paraNumero(v: string | null): number {
  if (!v) return 0
  return Number(v.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
}

/** Sim em verde, Não em vermelho. Vazio quando a ficha não respondeu. */
function SimNao({ v }: { v: boolean | null }) {
  if (v === null) return null
  return (
    <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
      v ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
    }`}>{v ? 'Sim' : 'Não'}</span>
  )
}

export interface AprovacaoEmpresa {
  empresa_id: string | null
  empresa_nome: string | null
  colaboradores: number
  aprovado_por: string | null
  aprovado_em: string
}

export function FechamentoClient({
  competencia, linhas, empresas, temFechamentoVt, temFechamentoGorjeta, aprovacoes, jaAprovados,
}: {
  competencia: string
  linhas: LinhaFechamento[]
  empresas: EmpresaOpcao[]
  temFechamentoVt: boolean
  temFechamentoGorjeta: boolean
  aprovacoes: AprovacaoEmpresa[]
  /** quem já entrou na folha aprovada deste mês */
  jaAprovados: string[]
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [vinculoFiltro, setVinculoFiltro] = useState<'' | 'contratado' | 'intermitente'>('')

  // Quem já está numa folha aprovada do mês não pode entrar em outra: fica
  // travado até a folha dele ser excluída em Folhas aprovadas.
  const travados = new Set(jaAprovados)
  // Ninguém marcado ao abrir: aprovar folha é ato deliberado, quem entra se
  // escolhe. Marcar todos de saída convidaria a aprovar sem olhar.
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const alternarMarcado = (id: string) => setMarcados(s => {
    if (travados.has(id)) return s
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  // Base nas props, estado só para o que se edita agora: inicializar o mapa
  // uma vez fazia o mês seguinte herdar os comentários do anterior, porque a
  // navegação por mês não remonta o componente.
  const [editados, setEditados] = useState<Record<string, string>>({})
  const [mesEditado, setMesEditado] = useState(competencia)
  if (mesEditado !== competencia) { setMesEditado(competencia); setEditados({}); setMarcados(new Set()) }

  const comentarioDe = (l: LinhaFechamento) => editados[l.candidate_id] ?? l.comentario
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [menuExportar, setMenuExportar] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  // Rolagem horizontal espelhada: a tabela é larga e, sem uma barra em cima,
  // só dá para rolar chegando ao fim da lista. As duas barras andam juntas.
  const barraTopo = useRef<HTMLDivElement>(null)
  const areaTabela = useRef<HTMLDivElement>(null)
  const [larguraTabela, setLarguraTabela] = useState(0)

  useEffect(() => {
    const area = areaTabela.current
    if (!area) return
    const medir = () => setLarguraTabela(area.scrollWidth)
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(area)
    if (area.firstElementChild) obs.observe(area.firstElementChild)
    return () => obs.disconnect()
  }, [linhas.length])

  /** Espelha a rolagem sem laço: só escreve se o valor for outro. */
  function espelhar(de: HTMLDivElement | null, para: HTMLDivElement | null) {
    if (!de || !para || para.scrollLeft === de.scrollLeft) return
    para.scrollLeft = de.scrollLeft
  }
  const [aprovando, setAprovando] = useState(false)

  const filtradas = linhas.filter(l => {
    if (empresaFiltro && l.empresa_id !== empresaFiltro) return false
    if (vinculoFiltro && l.vinculo !== vinculoFiltro) return false
    const termo = busca.trim()
    if (!termo) return true
    const digitos = termo.replace(/\D/g, '')
    if (digitos.length >= 3 && (l.cpf ?? '').includes(digitos)) return true
    return contemBusca(`${l.nome} ${l.cargo ?? ''}`, termo)
  })

  // Contagem por vínculo respeita a empresa escolhida, não a busca: o número
  // ao lado da opção é para decidir se vale filtrar, não o resultado dela.
  const contagemVinculo = linhas.reduce((acc, l) => {
    if (empresaFiltro && l.empresa_id !== empresaFiltro) return acc
    acc[l.vinculo]++
    return acc
  }, { contratado: 0, intermitente: 0 })

  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome
  // Só o que está marcado conta: é o que vai ser aprovado e exportado.
  const selecionadas = filtradas.filter(l => marcados.has(l.candidate_id))
  const marcaveis = filtradas.filter(l => !travados.has(l.candidate_id))
  const todasMarcadas = marcaveis.length > 0 && selecionadas.length === marcaveis.length
  const totalDias = selecionadas.reduce((s, l) => s + l.dias_trabalhados, 0)
  const totalFaltas = selecionadas.reduce((s, l) => s + l.faltas, 0)
  const totalSalario = selecionadas
    .map(l => paraNumero(l.salario))
    // Intermitente costuma ter valor/HORA na ficha; somar com mensal daria
    // total falso, então a folha só soma o que é claramente salário mensal.
    .filter(v => v >= 100)
    .reduce((s, v) => s + v, 0)

  /** Marca ou desmarca de uma vez o que está na tela agora. */
  function alternarTodas() {
    setMarcados(s => {
      const n = new Set(s)
      if (todasMarcadas) filtradas.forEach(l => n.delete(l.candidate_id))
      else filtradas.filter(l => !travados.has(l.candidate_id)).forEach(l => n.add(l.candidate_id))
      return n
    })
  }

  async function salvarComentario(l: LinhaFechamento) {
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
    } catch (e) {
      setErro((e as Error).message)
    } finally { setSalvando(null) }
  }

  const CABECALHO = [
    'Colaborador', 'Empresa', 'Vínculo', 'Dias trabalhados', 'Vale transporte', 'Faltas',
    'Domingos', 'Feriados', 'Mensalidade sindical', 'Avarias', 'Adiantamento salarial',
    'Horas normais', 'Horas 50%', 'Horas 100%', 'Adicional noturno 20%', 'Atrasos', 'Gratificação',
    'Insalubridade 20%', 'Cargo de confiança', 'Quebra de caixa', 'Gorjeta',
    'Salário', 'Comentário',
  ]
  const simNaoTexto = (v: boolean | null) => (v === null ? '' : v ? 'Sim' : 'Não')

  /** "8n · 2×50% · 1×100% · 3×20%" — cabe numa célula de PDF. */
  /** Uma linha por tipo dentro da célula do PDF. */
  const resumoHoras = (l: LinhaFechamento) => [
    l.horas_normais > 0 ? `${formatarHoras(l.horas_normais)} Horas normais` : '',
    l.adicional_noturno > 0 ? `${formatarHoras(l.adicional_noturno)} Noturno 20%` : '',
    l.horas_50 > 0 ? `${formatarHoras(l.horas_50)} HE 50%` : '',
    l.horas_100 > 0 ? `${formatarHoras(l.horas_100)} HE 100%` : '',
    l.atrasos > 0 ? `${formatarHoras(l.atrasos)} Atrasos` : '',
  ].filter(Boolean).join('\n')

  /**
   * Aprova o fechamento das empresas em escopo. Vai só a lista de marcados —
   * os números o servidor recalcula da mesma montagem que desenha a tela.
   *
   * Manda TODOS os marcados, não só os visíveis: quem a busca escondeu
   * continua marcado e não pode sumir da folha por causa de um filtro.
   */
  async function aprovarFechamento() {
    setAprovando(true); setErro(''); setOk('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/fechamento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competencia,
          escopo_empresa: empresaFiltro || null,
          candidate_ids: Array.from(marcados),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao aprovar o fechamento.')
      const quantas = (d.aprovadas ?? []).length
      const ignoradas: string[] = d.ignoradas ?? []
      setOk(
        `Fechamento de ${rotuloMes(competencia)} aprovado para ${quantas} `
        + `${quantas === 1 ? 'empresa' : 'empresas'}.`
        // Empresa já aprovada não é reaprovada por cima: quem quiser refazer
        // exclui a folha antes.
        + (ignoradas.length
          ? ` ${ignoradas.join(', ')} já ${ignoradas.length === 1 ? 'tinha' : 'tinham'} folha aprovada`
            + ' e ficou de fora — exclua em Folhas aprovadas para refazer.'
          : ''),
      )
      setConfirmando(false)
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setAprovando(false) }
  }

  /** No PDF a empresa sobe para o título e não se repete em toda linha. */
  /**
   * Coluna sem NENHUM lançamento no mês não é impressa: numa folha de 15
   * colunas, as vazias só empurram o resto e cansam quem confere.
   */
  async function exportarPdf() {
    setMenuExportar(false)
    const [mes, ano] = maiuscula(rotuloMes(competencia)).split(' de ')
    const dinheiro = (v: number) => (v > 0 ? brl(v) : '')

    type Coluna = {
      titulo: string
      alinhamento: 'left' | 'center' | 'right'
      valor: (l: LinhaFechamento) => string | number
      fixa?: boolean
    }
    const colunas: Coluna[] = [
      { titulo: 'Colaborador', alinhamento: 'left', fixa: true, valor: l => formatName(l.nome) },
      { titulo: 'Dias', alinhamento: 'center', fixa: true, valor: l => l.dias_trabalhados || '' },
      { titulo: 'VT', alinhamento: 'center', valor: l => simNaoTexto(l.vale_transporte) },
      { titulo: 'Faltas', alinhamento: 'center', valor: l => l.faltas || '' },
      { titulo: 'Dom/Fer', alinhamento: 'center', valor: l => l.domingos + l.feriados || '' },
      { titulo: 'Sindical', alinhamento: 'center', valor: l => simNaoTexto(l.mensalidade_sindical) },
      { titulo: 'Avarias', alinhamento: 'center', valor: l => dinheiro(l.avarias) },
      { titulo: 'Adiant.', alinhamento: 'center', valor: l => dinheiro(l.adiantamento) },
      { titulo: 'Horas extras', alinhamento: 'left', valor: l => resumoHoras(l) },
      { titulo: 'Gratif.', alinhamento: 'center', valor: l => dinheiro(l.gratificacao) },
      { titulo: 'Insal.', alinhamento: 'center', valor: l => simNaoTexto(l.insalubridade_20) },
      { titulo: 'Confiança', alinhamento: 'center', valor: l => dinheiro(l.confianca_valor) },
      { titulo: 'Quebra', alinhamento: 'center', valor: l => dinheiro(l.quebra_valor) },
      { titulo: 'Gorjeta', alinhamento: 'center', valor: l => dinheiro(l.gorjeta) },
      { titulo: 'Salário', alinhamento: 'center', fixa: true, valor: l => (l.salario ? brl(paraNumero(l.salario)) : '') },
      { titulo: 'Comentário', alinhamento: 'left', valor: l => comentarioDe(l) },
    ]
    const usadas = colunas.filter(c => c.fixa || selecionadas.some(l => String(c.valor(l)).trim() !== ''))

    const blob = await gerarPdfTabela({
      titulo: `Fechamento de folha — ${nomeEmpresa ?? 'Todas as empresas'}`,
      subtitulo: `${mes} / ${ano} · ${selecionadas.length} colaboradores · ${totalDias} dias · ${brl(totalSalario)} em salários`,
      cabecalho: usadas.map(c => c.titulo),
      linhas: selecionadas.map(l => usadas.map(c => c.valor(l))),
      alinhamentos: usadas.map(c => c.alinhamento),
      paisagem: true,
      compacto: true,
    })
    const sufixo = nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''
    baixarArquivo(blob, `fechamento-folha-${competencia.slice(0, 7)}${sufixo}.pdf`)
  }

  async function exportar() {
    setMenuExportar(false)
    const corpo = selecionadas.map(l => [
      formatName(l.nome), l.empresa ?? '—',
      l.vinculo === 'intermitente' ? 'Intermitente' : 'Contratado',
      l.dias_trabalhados, simNaoTexto(l.vale_transporte), l.faltas,
      l.domingos, l.feriados, simNaoTexto(l.mensalidade_sindical),
      l.avarias, l.adiantamento,
      formatarHoras(l.horas_normais), formatarHoras(l.horas_50), formatarHoras(l.horas_100),
      formatarHoras(l.adicional_noturno), formatarHoras(l.atrasos),
      l.gratificacao, simNaoTexto(l.insalubridade_20), l.confianca_valor, l.quebra_valor,
      l.gorjeta, paraNumero(l.salario), comentarioDe(l),
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
            disabled={selecionadas.length === 0} className="gap-1.5">
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
          disabled={selecionadas.length === 0} className="gap-1.5">
          <Check className="w-3.5 h-3.5" />Aprovar
        </Button>
      </div>

      {aprovacoes.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-[13px] text-emerald-900 flex-1 space-y-0.5">
            <p>
              Já <strong>aprovado</strong> neste mês
              {' '}({aprovacoes.length === 1 ? '1 empresa' : `${aprovacoes.length} empresas`}).
              Não dá para aprovar por cima — o mesmo colaborador não pode constar
              duas vezes na folha do mês. Para refazer, exclua a folha em{' '}
              <Link href="/admin/folha-pagamento/aprovadas" className="underline font-semibold">
                Folhas aprovadas
              </Link>{' '}e aprove de novo.
            </p>
            {aprovacoes.map(a => (
              <p key={a.empresa_id ?? 'sem-empresa'} className="text-[12px]">
                <strong>{a.empresa_nome ?? 'Sem empresa'}</strong> — {a.colaboradores} colaboradores
                {a.aprovado_por ? `, por ${a.aprovado_por}` : ''} em{' '}
                {new Date(a.aprovado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              </p>
            ))}
          </div>
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
        <select value={vinculoFiltro}
          onChange={e => setVinculoFiltro(e.target.value as '' | 'contratado' | 'intermitente')}
          className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white">
          <option value="">Todos os vínculos</option>
          <option value="contratado">Contratados ({contagemVinculo.contratado})</option>
          <option value="intermitente">Intermitentes ({contagemVinculo.intermitente})</option>
        </select>
      </div>

      {/* ── Resumo ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Cartao titulo="Colaboradores marcados" valor={`${selecionadas.length} de ${filtradas.length}`} cor="text-gray-900" />
        <Cartao titulo="Faltas" valor={String(totalFaltas)} cor={totalFaltas > 0 ? 'text-red-600' : 'text-gray-900'} />
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
              {selecionadas.length} colaboradores marcados, {totalDias} dias, {brl(totalSalario)} em salários.
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
        {/* Só aparece quando há o que rolar — barra sozinha numa tabela que
            cabe na tela seria enfeite confuso. */}
        {larguraTabela > 0 && (
          <div ref={barraTopo} onScroll={() => espelhar(barraTopo.current, areaTabela.current)}
            className="overflow-x-auto overflow-y-hidden border-b">
            <div style={{ width: larguraTabela, height: 1 }} />
          </div>
        )}
        <div ref={areaTabela} onScroll={() => espelhar(areaTabela.current, barraTopo.current)}
          className="overflow-x-auto">
          {/* border-separate porque a coluna congelada precisa pintar o
              próprio fundo e a própria borda: com bordas colapsadas a linha
              some justamente na célula que fica parada. */}
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-gray-50">
              <tr className="text-left text-[11px] uppercase text-muted-foreground align-bottom [&>th]:border-b [&>th]:border-gray-200">
                {/* Marcação e nome ficam parados: rolando para a direita, o
                    número perde o dono se o nome sair da tela. */}
                <th className="pl-3 pr-1 py-2 w-px sticky left-0 z-20 bg-gray-50">
                  <input type="checkbox" checked={todasMarcadas} onChange={alternarTodas}
                    disabled={marcaveis.length === 0}
                    title={todasMarcadas ? 'Desmarcar todos' : 'Marcar todos'}
                    className="w-4 h-4 accent-emerald-600 align-middle cursor-pointer" />
                </th>
                <th className="px-3 py-2 font-semibold sticky left-8 z-20 bg-gray-50">Colaborador</th>
                <th className="px-3 py-2 font-semibold">Empresa</th>
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
                <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Salário</th>
                <th className="px-3 py-2 font-semibold min-w-[200px]">Comentário</th>
                <th className="pl-4 pr-5 py-2 w-px sticky right-0 z-20 bg-gray-50" />
              </tr>
            </thead>
            <tbody className="[&>tr>td]:border-t [&>tr>td]:border-gray-200">
              {filtradas.map(l => (
                <tr key={l.candidate_id}
                  className={cn('group hover:bg-gray-50 align-top', !marcados.has(l.candidate_id) && 'opacity-45')}>
                  <td className="pl-3 pr-1 py-2 sticky left-0 z-10 bg-white group-hover:bg-gray-50">
                    {/* Desmarcado não entra na folha aprovada. */}
                    <input type="checkbox" checked={marcados.has(l.candidate_id)}
                      onChange={() => alternarMarcado(l.candidate_id)}
                      disabled={travados.has(l.candidate_id)}
                      title={travados.has(l.candidate_id)
                        ? 'Já está numa folha aprovada deste mês — exclua a folha para aprovar de novo'
                        : marcados.has(l.candidate_id) ? 'Tirar da folha' : 'Incluir na folha'}
                      className="w-4 h-4 accent-emerald-600 align-middle cursor-pointer disabled:cursor-not-allowed" />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap sticky left-8 z-10 bg-white group-hover:bg-gray-50">
                    <span className="font-medium text-gray-900">{formatName(l.nome)}</span>
                    {travados.has(l.candidate_id) && (
                      <span className="ml-1.5 text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 bg-emerald-100 text-emerald-700 align-middle"
                        title="Já consta na folha aprovada deste mês">
                        Aprovado
                      </span>
                    )}
                    {l.vinculo === 'intermitente' && (
                      <span className="ml-1.5 text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 bg-sky-100 text-sky-700 align-middle">
                        Interm.
                      </span>
                    )}
                    {l.cargo && <span className="block text-[11px] text-muted-foreground">{l.cargo}</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap group-hover:bg-gray-50">{l.empresa ?? '—'}</td>
                  <td className="px-2 py-2 text-center font-semibold text-gray-900">{l.dias_trabalhados || ''}</td>
                  {/* Recebe VT em verde, não recebe em vermelho. */}
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
                  {/* Só o "sim" aparece: quem não paga fica em branco. */}
                  <td className="px-2 py-2 text-center">
                    {l.mensalidade_sindical === true && <SimNao v={true} />}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {l.avarias > 0 && <span className="font-medium text-red-700">{brl(l.avarias)}</span>}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {l.adiantamento > 0 && <span className="font-medium text-red-700">{brl(l.adiantamento)}</span>}
                  </td>
                  {/* Cada tipo de hora numa linha, só as que existem. */}
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
                        onChange={e => setEditados(c => ({ ...c, [l.candidate_id]: e.target.value }))}
                        onBlur={() => salvarComentario(l)}
                        placeholder="Anotação do mês…"
                        className="h-8 w-full min-w-[160px] border border-gray-300 rounded-md px-2 text-[13px] bg-white"
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
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={19} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
