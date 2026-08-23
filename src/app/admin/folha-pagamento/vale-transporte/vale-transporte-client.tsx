'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Bus, Search, CheckCircle2, XCircle, HelpCircle, ExternalLink, Download,
  ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, FileText,
  Check, Loader2, AlertCircle, History, Pencil, Trash2, CloudDownload, Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { gerarPdfTabela } from '@/lib/pdf'
import { MESES, maiuscula, mesVizinho, rotuloMes } from '@/lib/competencia'

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
  /** Cargo de confiança: não bate ponto, entra com os dias fixos do mês. */
  confianca: boolean
  empresa_transporte: string | null
  passagens: string | null
}

export interface EmpresaOpcao { id: string; nome: string }
export interface RegistroDias { candidate_id: string; competencia: string; dias: number }
interface CicloAprovado { total_dias: number; aprovado_por: string | null }

type Filtro = 'todos' | 'recebe' | 'nao' | 'sem_info'

interface PendenteRhid { candidate_id: string; nome: string; motivo: 'sem_cpf' | 'nao_encontrado' }

/** Cargo de confiança não bate ponto eletrônico: entra com o mês fechado. */
const DIAS_CONFIANCA = 25

const MOTIVO_RHID: Record<PendenteRhid['motivo'], string> = {
  nao_encontrado: 'não encontrado no RHiD (CPF)',
  sem_cpf: 'sem CPF na ficha',
}



export function ValeTransporteClient({
  competencia, linhas, empresas, historico, passagens, cicloAprovado,
}: {
  competencia: string
  linhas: LinhaVT[]
  empresas: EmpresaOpcao[]
  historico: RegistroDias[]
  /**
   * candidate_id → o que a WE carregou no cartão para ESTE mês de uso (a
   * recarga é feita no mês anterior). O cartão Riocard/Semove é carregado por
   * VALOR POR DIA, não por unidade de passagem: por isso `dias` é o número que
   * se compara com os dias trabalhados. `quantidade` só vem preenchida quando a
   * operadora vende por unidade.
   */
  passagens: Record<string, { dias: number; quantidade: number; valor: number }>
  cicloAprovado: CicloAprovado | null
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [situacao, setSituacao] = useState<Filtro>('todos')
  const [menuAberto, setMenuAberto] = useState(false)
  // Dias sempre em branco ao abrir: preenchido de saída convida a aprovar sem
  // conferir. Quem preenche é o RHiD (ou a digitação linha a linha).
  const [dias, setDias] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [historicoAberto, setHistoricoAberto] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<{ linha: LinhaVT; registro: RegistroDias; dias: string } | null>(null)
  const [removendo, setRemovendo] = useState<{ linha: LinhaVT; registro: RegistroDias } | null>(null)
  const [processando, setProcessando] = useState(false)
  const [buscandoRhid, setBuscandoRhid] = useState(false)
  const [avisoRhid, setAvisoRhid] = useState<PendenteRhid[]>([])
  // Quem o RHiD não soube responder: fica zerado e com o campo em amarelo.
  const [semRhid, setSemRhid] = useState<Set<string>>(new Set())
  const [importando, setImportando] = useState(false)
  const [resumoImport, setResumoImport] = useState<string>('')
  const [painelWe, setPainelWe] = useState(false)
  const [atalhoWe, setAtalhoWe] = useState('')
  const [gerandoAtalho, setGerandoAtalho] = useState(false)

  /** O que a WE carregou para o mês (dias, unidades e valor). */
  function carregadoDe(l: LinhaVT) {
    return passagens[l.candidate_id] ?? { dias: 0, quantidade: 0, valor: 0 }
  }

  /** Dias da pessoa no mês: só o que estiver no campo dela. */
  function diasDe(l: LinhaVT): number {
    return Math.trunc(Number(dias[l.candidate_id])) || 0
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

  // A busca por nome é só visual. O fechamento vale para a empresa inteira —
  // a rota substitui o escopo, então aprovar com um nome digitado no campo de
  // busca apagaria todos os outros do mês.
  const noEscopo = linhas.filter(l => !empresaFiltro || l.empresa_id === empresaFiltro)

  const recebem = filtradas.filter(l => l.recebe === true).length
  const naoRecebem = filtradas.filter(l => l.recebe === false).length
  const semInfo = filtradas.filter(l => l.recebe === null).length
  const comDias = filtradas.filter(l => diasDe(l) > 0).length
  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome
  const baseNome = `vale-transporte-${competencia.slice(0, 7)}${nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''}`

  const alternarHistorico = (id: string) => setHistoricoAberto(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  /**
   * Puxa do RHiD (Control iD) os dias trabalhados dos colaboradores listados.
   * Só leitura: o período é sempre do 1º ao último dia do mês selecionado, o
   * mesmo da apuração de ponto. Preenche os campos — quem aprova é você.
   */
  async function buscarNoRhid() {
    setBuscandoRhid(true); setErro(''); setOk(''); setAvisoRhid([]); setSemRhid(new Set())
    try {
      // Cargo de confiança fica fora da consulta: não bate ponto, logo o RHiD
      // não teria o que responder — entra direto com os dias fixos.
      const doPonto = noEscopo.filter(l => !l.confianca)
      const deConfianca = noEscopo.filter(l => l.confianca)

      let d: { dias?: Record<string, number>; encontrados?: number; periodo?: { ini: string; fim: string } } = {}
      let pendentes: PendenteRhid[] = []

      if (doPonto.length > 0) {
        const res = await fetch('/api/admin/folha-pagamento/vale-transporte/rhid', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            competencia,
            colaboradores: doPonto.map(l => ({ candidate_id: l.candidate_id, cpf: l.cpf, nome: l.nome })),
          }),
        })
        const corpo = await res.json().catch(() => ({}))
        pendentes = (Array.isArray(corpo.pendentes) ? corpo.pendentes : []) as PendenteRhid[]
        if (!res.ok) {
          setAvisoRhid(pendentes)
          throw new Error(corpo.error || 'Não foi possível buscar no RHiD.')
        }
        d = corpo
      }

      const vindos = { ...(d.dias ?? {}) } as Record<string, number>
      for (const l of deConfianca) vindos[l.candidate_id] = DIAS_CONFIANCA
      setDias(atual => {
        const novo = { ...atual }
        for (const [id, n] of Object.entries(vindos)) novo[id] = String(n)
        return novo
      })
      setAvisoRhid(pendentes)
      setSemRhid(new Set(pendentes.map(p => p.candidate_id)))

      // Grava na hora (inclusive os zeros): o mês fica registrado e volta
      // pronto quando você navegar de período. Buscar de novo sobrescreve.
      const gravou = await fetch('/api/admin/folha-pagamento/vale-transporte', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competencia,
          dias_padrao: 0,
          incluir_zerados: true,
          escopo_empresa: empresaFiltro || null,
          itens: noEscopo.map(l => ({
            candidate_id: l.candidate_id, nome: l.nome, cargo: l.cargo,
            empresa_id: l.empresa_id, empresa_nome: l.empresa,
            dias: vindos[l.candidate_id] ?? diasDe(l),
          })),
        }),
      })
      const g = await gravou.json().catch(() => ({}))
      if (!gravou.ok) throw new Error(g.error || 'Os dias vieram do RHiD, mas não deu para salvar.')

      const doRhid = d.encontrados ?? 0
      const periodo = d.periodo
        ? ` (${d.periodo.ini.slice(6)}/${d.periodo.ini.slice(4, 6)} a ${d.periodo.fim.slice(6)}/${d.periodo.fim.slice(4, 6)})`
        : ''
      setOk(`${doRhid} pela apuração do RHiD${periodo}`
        + (deConfianca.length > 0 ? ` · ${deConfianca.length} de cargo de confiança com ${DIAS_CONFIANCA} dias` : '')
        + ` — salvo: ${g.total_dias} dia(s) no total.`)
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setBuscandoRhid(false) }
  }

  /**
   * Importa o CSV da WE Benefícios com as passagens carregadas.
   * A recarga é feita no mês ANTERIOR ao de uso, então o arquivo da compra de
   * julho entra na competência de agosto — que é a que está aberta na tela.
   */
  async function importarPassagens(arquivo: File) {
    setImportando(true); setErro(''); setOk(''); setResumoImport('')
    try {
      const texto = await arquivo.text()
      const { lerCsvWe } = await import('@/lib/csv-we')
      const leitura = lerCsvWe(texto)

      if (!leitura.colunas.cpf) {
        throw new Error(`Não achei a coluna de CPF no arquivo. Cabeçalho lido: ${leitura.cabecalho.slice(0, 8).join(' · ') || '(vazio)'}`)
      }
      if (!leitura.colunas.quantidade) {
        throw new Error(`Achei o CPF, mas não a coluna de quantidade de passagens. Cabeçalho: ${leitura.cabecalho.join(' · ')}`)
      }
      if (leitura.linhas.length === 0) throw new Error('O arquivo não tinha nenhuma linha com CPF.')

      const res = await fetch('/api/admin/folha-pagamento/vale-transporte/passagens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competencia, linhas: leitura.linhas }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Não foi possível gravar as passagens.')

      setOk(`${d.total_passagens} passagens de ${d.casados} colaborador${d.casados !== 1 ? 'es' : ''} `
        + `lançadas em ${rotuloMes(competencia)}.`)
      setResumoImport(
        `Colunas usadas: CPF = "${leitura.colunas.cpf}", quantidade = "${leitura.colunas.quantidade}"`
        + (leitura.colunas.valor ? `, valor = "${leitura.colunas.valor}"` : '')
        + (d.nao_encontrados?.length ? ` · ${d.nao_encontrados.length} CPF(s) do arquivo não estão na nossa base: ${d.nao_encontrados.slice(0, 6).join(', ')}` : ''),
      )
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setImportando(false) }
  }

  /**
   * Gera o atalho que puxa da WE. O login da WE é protegido por reCAPTCHA e
   * não há API pública: o único jeito de usar a SUA sessão é rodar o código no
   * seu navegador, na aba da WE, onde o cookie (HttpOnly) acompanha sozinho.
   */
  async function gerarAtalho() {
    setGerandoAtalho(true); setErro('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/vale-transporte/we-atalho', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Não foi possível gerar o atalho.')
      setAtalhoWe(d.atalho)
    } catch (e) {
      setErro((e as Error).message)
    } finally { setGerandoAtalho(false) }
  }

  /** Dias já aprovados nesta competência, por colaborador. */
  const aprovadosNoMes = useMemo(
    () => new Map(historico.filter(h => h.competencia === competencia).map(h => [h.candidate_id, h.dias])),
    [historico, competencia],
  )

  // Mês novo: limpa tudo antes de semear (este efeito vem ANTES do de baixo
  // de propósito — na ordem inversa ele apagaria o que acabou de ser semeado).
  useEffect(() => {
    setDias({}); setSemRhid(new Set()); setAvisoRhid([]); setErro(''); setOk('')
  }, [competencia])

  // Mostra o que já está salvo no mês, MAS sem encostar no que o operador
  // digitou e ainda não aprovou: qualquer router.refresh() (editar ou remover
  // um registro do histórico) reexecuta este efeito, e substituir o mapa
  // inteiro apagaria meia folha de digitação.
  useEffect(() => {
    setDias(atual => {
      const novo = { ...atual }
      for (const [id, n] of aprovadosNoMes) if (novo[id] === undefined) novo[id] = String(n)
      return novo
    })
  }, [aprovadosNoMes])

  async function aprovar() {
    setSalvando(true); setErro(''); setOk('')
    try {
      const res = await fetch('/api/admin/folha-pagamento/vale-transporte', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competencia,
          dias_padrao: 0,
          escopo_empresa: empresaFiltro || null,
          itens: noEscopo.map(l => ({
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

  const CABECALHO = ['Funcionário', 'Empresa', 'Vínculo', 'Vale transporte', 'Dias trabalhados', 'Dias carregados (WE)', 'Valor carregado']
  const corpo = () => filtradas.map(l => [
    formatName(l.nome),
    l.empresa ?? '—',
    l.vinculo === 'intermitente' ? 'Intermitente' : 'Contratado',
    l.recebe === true ? 'Sim' : l.recebe === false ? 'Não' : 'Não informado',
    aprovadosNoMes.get(l.candidate_id) ?? diasDe(l) ?? 0,
    carregadoDe(l).dias,
    carregadoDe(l).valor,
  ])

  async function exportarXlsx() {
    setMenuAberto(false)
    baixarArquivo(await gerarXlsx([CABECALHO, ...corpo()], 'Vale transporte'), `${baseNome}.xlsx`)
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

        {/* Puxa os dias direto da apuração de ponto do RHiD (leitura apenas). */}
        <Button variant="outline" onClick={buscarNoRhid}
          disabled={buscandoRhid || filtradas.length === 0}
          title="Buscar na apuração de ponto do Control iD os dias trabalhados do mês selecionado"
          className="gap-1.5">
          {buscandoRhid
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <CloudDownload className="w-3.5 h-3.5" />}
          {buscandoRhid ? 'Buscando no RHiD…' : 'Buscar dias no RHiD'}
        </Button>

        <Button variant="outline" onClick={() => { setPainelWe(true); if (!atalhoWe) gerarAtalho() }}
          className="gap-1.5" title="Puxar da WE Benefícios as passagens carregadas">
          <Upload className="w-3.5 h-3.5" />Importar passagens (WE)
        </Button>

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
          <Button onClick={() => { setErro(''); setOk(''); setConfirmando(true) }}
            disabled={comDias === 0}
            title={comDias === 0 ? 'Preencha os dias de pelo menos um colaborador' : undefined}
            className="gap-1.5 w-full">
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


      {/* ── Painel: puxar da WE ── */}
      {painelWe && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setPainelWe(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="text-base font-bold text-gray-900">Importar passagens da WE Benefícios</h2>
              <p className="text-[13px] text-muted-foreground mt-1">
                A WE não tem API e o login dela é protegido por reCAPTCHA, então o portal
                não consegue entrar sozinho na conta. O atalho abaixo roda no <strong>seu
                navegador</strong>, usando a sessão que você já tem aberta na WE.
              </p>
            </div>

            <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
              <p className="text-[13px] font-semibold text-gray-900">Uma vez só: guarde o atalho</p>
              <ol className="text-[12.5px] text-gray-700 space-y-1 list-decimal ml-4">
                <li>Deixe a barra de favoritos do Chrome visível (Ctrl+Shift+B).</li>
                <li>Arraste o botão verde abaixo para a barra de favoritos.</li>
              </ol>
              {gerandoAtalho ? (
                <p className="text-[13px] text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />Gerando…
                </p>
              ) : atalhoWe ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                  <a href={atalhoWe} onClick={e => e.preventDefault()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-[13px] font-semibold cursor-grab active:cursor-grabbing">
                    <Bus className="w-3.5 h-3.5" />Puxar passagens WE → BDT
                  </a>
                  <p className="text-[11.5px] text-muted-foreground">
                    Arraste o botão (não clique aqui — ele só funciona na aba da WE).
                  </p>
                </>
              ) : null}
            </div>

            <div className="rounded-xl border p-4 space-y-1">
              <p className="text-[13px] font-semibold text-gray-900">Todo mês: um clique</p>
              <ol className="text-[12.5px] text-gray-700 space-y-1 list-decimal ml-4">
                <li>Abra <strong>app.webeneficios.com</strong> e entre normalmente.</li>
                <li>Clique no atalho na barra de favoritos.</li>
              </ol>
              <p className="text-[12px] text-muted-foreground pt-1">
                Ele lê os últimos pedidos, usa a competência que o próprio recibo da WE
                informa (a compra de julho é o mês de agosto) e grava aqui. Clicar de novo
                <strong> sobrescreve</strong> os meses que vierem no arquivo.
              </p>
            </div>

            <div className="rounded-xl border p-4 space-y-2">
              <p className="text-[13px] font-semibold text-gray-900">Alternativa: arquivo CSV</p>
              <p className="text-[12.5px] text-gray-700">
                Se preferir, baixe o CSV na WE (Relatórios → Relatório de Compras Unificado)
                e suba aqui. Grava na competência aberta na tela: {rotuloMes(competencia)}.
              </p>
              <label className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-[13px] font-medium cursor-pointer ${
                importando ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait' : 'bg-white border-gray-300 hover:bg-gray-50'
              }`}>
                {importando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {importando ? 'Importando…' : 'Escolher CSV'}
                <input type="file" accept=".csv,text/csv" className="hidden" disabled={importando}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) { setPainelWe(false); importarPassagens(f) }
                  }} />
              </label>
            </div>

            <div className="flex justify-between items-center pt-1">
              <button onClick={gerarAtalho} disabled={gerandoAtalho}
                className="text-[12px] text-muted-foreground hover:underline">
                Gerar um atalho novo (invalida o anterior)
              </button>
              <Button variant="outline" onClick={() => setPainelWe(false)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}

      {resumoImport && (
        <p className="text-[12px] text-muted-foreground">{resumoImport}</p>
      )}

      {avisoRhid.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[13px] font-semibold text-amber-900 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {avisoRhid.length} colaborador(es) ficaram sem os dias do RHiD — preencha na mão:
          </p>
          <p className="text-[12px] text-amber-800 mt-0.5">
            Ficaram com <strong>0</strong> e o campo destacado em amarelo na lista abaixo.
            Se alguém aqui não bate ponto, marque <strong>&quot;Cargo de confiança?&quot;</strong> como
            Sim na ficha e busque de novo — aí entra com {DIAS_CONFIANCA} dias.
          </p>
          <ul className="mt-1.5 ml-5 list-disc text-[12px] text-amber-900 space-y-0.5">
            {avisoRhid.map(p => (
              <li key={p.candidate_id}>{formatName(p.nome)} — {MOTIVO_RHID[p.motivo]}</li>
            ))}
          </ul>
        </div>
      )}

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
                <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Carregado na WE</th>
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
                      {l.confianca && (
                        <span title={`Cargo de confiança — não bate ponto, entra com ${DIAS_CONFIANCA} dias`}
                          className="ml-2 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-violet-100 text-violet-700 align-middle">
                          Confiança
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
                          onChange={e => {
                            setDias(d => ({ ...d, [l.candidate_id]: e.target.value.replace(/\D/g, '').slice(0, 2) }))
                            // Digitou: já não é mais pendência do RHiD.
                            if (semRhid.has(l.candidate_id)) {
                              setSemRhid(s => { const n = new Set(s); n.delete(l.candidate_id); return n })
                            }
                          }}
                          placeholder="0"
                          inputMode="numeric"
                          title={semRhid.has(l.candidate_id) ? 'Não veio do RHiD — confira e preencha na mão' : undefined}
                          className={`h-8 w-16 border rounded-md px-2 text-[13px] text-center ${
                            semRhid.has(l.candidate_id)
                              ? 'border-amber-300 bg-amber-50 text-amber-900'
                              : 'border-gray-300 bg-white'
                          }`}
                        />
                        {jaAprovado != null && (
                          <span className="text-[11px] text-emerald-700 font-medium whitespace-nowrap">
                            {jaAprovado} registrado{jaAprovado !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Carregado na WE: recarga feita no mês anterior, para uso NESTE mês. */}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {(() => {
                        const c = carregadoDe(l)
                        if (c.dias === 0 && c.quantidade === 0) {
                          return <span className="text-[12px] text-gray-400">—</span>
                        }
                        const trabalhados = diasDe(l)
                        const dif = trabalhados > 0 ? c.dias - trabalhados : null
                        return (
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="font-semibold text-gray-900">
                                {c.quantidade > 0 ? `${c.quantidade} passagens` : `${c.dias} dias`}
                              </span>
                              {dif !== null && (
                                <span className={`text-[11px] font-medium ${
                                  dif > 0 ? 'text-amber-700' : dif < 0 ? 'text-red-600' : 'text-emerald-700'
                                }`} title={`Carregado ${c.dias} dias · trabalhou ${trabalhados} dias`}>
                                  {dif === 0 ? 'bate certo' : dif > 0 ? `sobra ${dif}` : `falta ${-dif}`}
                                </span>
                              )}
                            </div>
                            {c.valor > 0 && (
                              <span className="block text-[11px] text-muted-foreground">
                                {c.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            )}
                          </div>
                        )
                      })()}
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
