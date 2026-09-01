'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, Download, ExternalLink,
  Check, Loader2, AlertCircle, CheckCircle2, History, Trash2, Copy, Wallet, Plus, Calculator,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName, contemBusca } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { maiuscula, mesVizinho, rotuloMes } from '@/lib/competencia'
import type { ConfigLancamento, CampoContagem } from '@/lib/folha-lancamentos'

export interface LinhaLancamento {
  candidate_id: string
  nome: string
  cpf: string | null
  cargo: string | null
  empresa_id: string | null
  empresa: string | null
  vinculo: 'contratado' | 'intermitente'
  /** como veio da ficha ("1.892,34") — base dos percentuais */
  salario: string | null
}

export interface EmpresaOpcao { id: string; nome: string }

export interface RegistroLancamento {
  candidate_id: string
  competencia: string
  quantidade: number
  quantidade2: number
  quantidade3: number
  quantidade4: number
  valor: number
  desconto: number
  observacao: string | null
}

/** Um item avulso (avarias): valor + o que foi avariado. */
interface ItemAvulso { valor: string; descricao: string }

interface CicloAprovado {
  total_valor: number
  total_qtd: number
  total_qtd2: number
  total_qtd3: number
  total_qtd4: number
  total_desconto: number
  aprovado_por: string | null
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
/**
 * "R$ 1.892,34" → 1892.34
 *
 * O salário vem da ficha COM o prefixo "R$ " — sem tirar tudo que não é
 * dígito, vírgula ou ponto, o Number() dava NaN e o valor virava zero, o que
 * fazia todo mundo cair na regra de "salário por hora".
 */
function paraNumero(v: string | null | undefined): number {
  if (!v) return 0
  const limpo = String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  return Number(limpo) || 0
}
/** 1234.56 → "1234,56" (o campo aceita vírgula) */
function paraCampo(n: number): string {
  return n > 0 ? n.toFixed(2).replace('.', ',') : ''
}

/** Qual total do ciclo corresponde a cada campo de contagem. */
const TOTAL_DO_CAMPO: Record<CampoContagem, (c: CicloAprovado) => number> = {
  quantidade: c => c.total_qtd,
  quantidade2: c => c.total_qtd2,
  quantidade3: c => c.total_qtd3,
  quantidade4: c => c.total_qtd4,
}

export function LancamentosClient({
  config, competencia, linhas, empresas, historico, cicloAprovado,
}: {
  config: ConfigLancamento
  competencia: string
  linhas: LinhaLancamento[]
  empresas: EmpresaOpcao[]
  historico: RegistroLancamento[]
  cicloAprovado: CicloAprovado | null
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [padrao, setPadrao] = useState('')
  const [valores, setValores] = useState<Record<string, string>>({})
  /** candidate_id → { quantidade, quantidade2, quantidade3, quantidade4 } digitados */
  const [contagens, setContagens] = useState<Record<string, Partial<Record<CampoContagem, string>>>>({})
  /** candidate_id → desconto digitado (tipos de valor fixo) */
  const [descontos, setDescontos] = useState<Record<string, string>>({})
  /** candidate_id → lista de itens (avarias) */
  const [itensPorCand, setItensPorCand] = useState<Record<string, ItemAvulso[]>>({})
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [historicoAberto, setHistoricoAberto] = useState<Set<string>>(new Set())
  const [removendo, setRemovendo] = useState<{ linha: LinhaLancamento; registro: RegistroLancamento } | null>(null)

  const multiplos = !!config.itensMultiplos
  const temContagens = config.colunas.length > 0

  /** Valor sugerido pelo percentual do salário (0 quando não se aplica). */
  function sugestaoDe(l: LinhaLancamento): number {
    if (!config.percentualSalario) return 0
    const salario = paraNumero(l.salario)
    // Salário abaixo de R$ 100 na ficha é valor/HORA (padrão dos
    // intermitentes): calcular percentual sobre isso daria um adicional
    // irrisório e enganoso, então melhor não sugerir nada.
    if (salario < 100) return 0
    return Math.round(salario * config.percentualSalario * 100) / 100
  }

  const itensDe = (l: LinhaLancamento): ItemAvulso[] =>
    itensPorCand[l.candidate_id] ?? [{ valor: '', descricao: '' }]

  function mudarItem(id: string, i: number, campo: keyof ItemAvulso, v: string) {
    setItensPorCand(prev => {
      const lista = [...(prev[id] ?? [{ valor: '', descricao: '' }])]
      lista[i] = { ...lista[i], [campo]: v }
      return { ...prev, [id]: lista }
    })
  }
  function adicionarItem(id: string) {
    setItensPorCand(prev => ({
      ...prev,
      [id]: [...(prev[id] ?? [{ valor: '', descricao: '' }]), { valor: '', descricao: '' }],
    }))
  }
  function removerItem(id: string, i: number) {
    setItensPorCand(prev => {
      const lista = (prev[id] ?? []).filter((_, k) => k !== i)
      return { ...prev, [id]: lista.length ? lista : [{ valor: '', descricao: '' }] }
    })
  }

  const totalItensDe = (l: LinhaLancamento) =>
    itensDe(l).reduce((s, it) => s + paraNumero(it.valor), 0)

  const valorFixo = !!config.valorFixo
  /** Valor é a própria conta: sem campo para digitar. */
  const valorCalculado = !!config.valorCalculado
  const descontoDe = (l: LinhaLancamento) => paraNumero(descontos[l.candidate_id])

  /**
   * Valor do mês. Em tipo de base fixa (quebra de caixa) é o cálculo menos o
   * desconto, nunca negativo — desconto maior que a base zera, não vira dívida.
   */
  const valorDe = (l: LinhaLancamento) => {
    if (multiplos) return totalItensDe(l)
    if (valorCalculado) return sugestaoDe(l)
    if (valorFixo) return Math.max(0, Math.round((sugestaoDe(l) - descontoDe(l)) * 100) / 100)
    return paraNumero(valores[l.candidate_id])
  }

  const contagemDe = (l: LinhaLancamento, campo: CampoContagem) =>
    paraNumero(contagens[l.candidate_id]?.[campo])

  const temLancamento = (l: LinhaLancamento) =>
    valorDe(l) > 0 || config.colunas.some(c => contagemDe(l, c.campo) > 0)

  function mudarContagem(id: string, campo: CampoContagem, v: string) {
    setContagens(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), [campo]: v } }))
  }

  // Com vários lançamentos por mês (avarias), o histórico soma por competência
  // — senão o mesmo mês apareceria repetido, uma vez por item.
  const historicoPorCand = useMemo(() => {
    const m = new Map<string, RegistroLancamento[]>()
    for (const h of historico) {
      const arr = m.get(h.candidate_id) ?? []
      const mesmoMes = arr.find(x => x.competencia === h.competencia)
      if (mesmoMes) {
        mesmoMes.valor = Math.round((mesmoMes.valor + h.valor) * 100) / 100
        mesmoMes.quantidade += h.quantidade
        mesmoMes.quantidade2 += h.quantidade2
        mesmoMes.quantidade3 += h.quantidade3
        mesmoMes.quantidade4 += h.quantidade4
        mesmoMes.desconto = Math.round((mesmoMes.desconto + h.desconto) * 100) / 100
      } else {
        arr.push({ ...h })
      }
      m.set(h.candidate_id, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => b.competencia.localeCompare(a.competencia))
    return m
  }, [historico])

  const aprovadosNoMes = useMemo(() => {
    const m = new Map<string, RegistroLancamento>()
    for (const h of historico.filter(x => x.competencia === competencia)) {
      const atual = m.get(h.candidate_id)
      if (atual) {
        atual.valor = Math.round((atual.valor + h.valor) * 100) / 100
        atual.quantidade += h.quantidade
        atual.quantidade2 += h.quantidade2
        atual.quantidade3 += h.quantidade3
        atual.quantidade4 += h.quantidade4
        atual.desconto = Math.round((atual.desconto + h.desconto) * 100) / 100
      } else {
        m.set(h.candidate_id, { ...h })
      }
    }
    return m
  }, [historico, competencia])

  /** Itens do mês já aprovados, para semear a lista das avarias. */
  const itensAprovadosNoMes = useMemo(() => {
    const m = new Map<string, ItemAvulso[]>()
    for (const h of historico.filter(x => x.competencia === competencia && x.valor > 0)) {
      const arr = m.get(h.candidate_id) ?? []
      arr.push({ valor: paraCampo(h.valor), descricao: h.observacao ?? '' })
      m.set(h.candidate_id, arr)
    }
    return m
  }, [historico, competencia])

  // Mês novo: limpa antes de semear (este efeito vem ANTES do de baixo de
  // propósito — na ordem inversa apagaria o que acabou de ser semeado).
  useEffect(() => {
    setValores({}); setContagens({}); setItensPorCand({}); setDescontos({}); setErro(''); setOk('')
  }, [competencia])

  // Semeia o que já está aprovado e, quando o tipo é percentual do salário, a
  // sugestão calculada — sem encostar no que foi digitado e ainda não
  // aprovado, porque router.refresh() reexecuta este efeito.
  useEffect(() => {
    setValores(atual => {
      const novo = { ...atual }
      for (const l of linhas) {
        if (novo[l.candidate_id] !== undefined) continue
        const aprovado = aprovadosNoMes.get(l.candidate_id)
        if (aprovado && aprovado.valor > 0) { novo[l.candidate_id] = paraCampo(aprovado.valor); continue }
        const sugerido = sugestaoDe(l)
        if (sugerido > 0) novo[l.candidate_id] = paraCampo(sugerido)
      }
      return novo
    })
    setDescontos(atual => {
      const novo = { ...atual }
      for (const [id, r] of aprovadosNoMes) {
        if (novo[id] === undefined && r.desconto > 0) novo[id] = paraCampo(r.desconto)
      }
      return novo
    })
    setContagens(atual => {
      const novo = { ...atual }
      for (const [id, r] of aprovadosNoMes) {
        if (novo[id] !== undefined) continue
        const c: Partial<Record<CampoContagem, string>> = {}
        if (r.quantidade > 0) c.quantidade = paraCampo(r.quantidade)
        if (r.quantidade2 > 0) c.quantidade2 = paraCampo(r.quantidade2)
        if (r.quantidade3 > 0) c.quantidade3 = paraCampo(r.quantidade3)
        if (r.quantidade4 > 0) c.quantidade4 = paraCampo(r.quantidade4)
        if (Object.keys(c).length) novo[id] = c
      }
      return novo
    })
    setItensPorCand(atual => {
      const novo = { ...atual }
      for (const [id, lista] of itensAprovadosNoMes) {
        if (novo[id] === undefined) novo[id] = lista
      }
      return novo
    })
    // `linhas` é estável dentro do mesmo render do servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aprovadosNoMes, itensAprovadosNoMes])

  const filtradas = linhas.filter(l => {
    if (empresaFiltro && l.empresa_id !== empresaFiltro) return false
    const termo = busca.trim()
    if (!termo) return true
    const digitos = termo.replace(/\D/g, '')
    if (digitos.length >= 3 && (l.cpf ?? '').includes(digitos)) return true
    return contemBusca(`${l.nome} ${l.cargo ?? ''}`, termo)
  })

  // A busca por nome é SÓ visual: o fechamento vale para a empresa inteira,
  // porque a rota substitui o escopo. Mandar a lista visível apagaria o resto.
  const noEscopo = linhas.filter(l => !empresaFiltro || l.empresa_id === empresaFiltro)

  const comLancamento = noEscopo.filter(temLancamento).length
  const totalValor = noEscopo.reduce((s, l) => s + valorDe(l), 0)
  const totaisContagem = config.colunas.map(c => ({
    rotulo: c.rotulo,
    total: noEscopo.reduce((s, l) => s + contagemDe(l, c.campo), 0),
  }))
  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome
  const baseNome = `${config.slug}-${competencia.slice(0, 7)}${nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''}`

  const alternarHistorico = (id: string) => setHistoricoAberto(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  function aplicarATodos() {
    const texto = padrao.trim()
    if (!texto) return
    if (valorFixo) {
      setDescontos(v => {
        const novo = { ...v }
        for (const l of filtradas) novo[l.candidate_id] = texto
        return novo
      })
    } else if (config.temValor && !multiplos) {
      setValores(v => {
        const novo = { ...v }
        for (const l of filtradas) novo[l.candidate_id] = texto
        return novo
      })
    } else if (temContagens) {
      const campo = config.colunas[0].campo
      setContagens(prev => {
        const novo = { ...prev }
        for (const l of filtradas) novo[l.candidate_id] = { ...(novo[l.candidate_id] ?? {}), [campo]: texto }
        return novo
      })
    }
    setOk(`Aplicado a ${filtradas.length} colaborador${filtradas.length !== 1 ? 'es' : ''}.`)
  }

  async function aprovar() {
    setSalvando(true); setErro(''); setOk('')
    try {
      // Com vários itens por pessoa, cada avaria vira uma LINHA própria: é
      // isso que preserva a descrição de cada uma no fechamento.
      const itens = multiplos
        ? noEscopo.flatMap(l => itensDe(l)
            .filter(it => paraNumero(it.valor) > 0)
            .map(it => ({
              candidate_id: l.candidate_id, nome: l.nome, cargo: l.cargo,
              empresa_id: l.empresa_id, empresa_nome: l.empresa,
              valor: paraNumero(it.valor), observacao: it.descricao,
            })))
        : noEscopo.map(l => ({
            candidate_id: l.candidate_id, nome: l.nome, cargo: l.cargo,
            empresa_id: l.empresa_id, empresa_nome: l.empresa,
            valor: config.temValor ? valorDe(l) : 0,
            desconto: valorFixo ? descontoDe(l) : 0,
            quantidade: contagemDe(l, 'quantidade'),
            quantidade2: contagemDe(l, 'quantidade2'),
            quantidade3: contagemDe(l, 'quantidade3'),
            quantidade4: contagemDe(l, 'quantidade4'),
          }))

      const res = await fetch(`/api/admin/folha-pagamento/lancamentos/${config.slug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competencia, escopo_empresa: empresaFiltro || null, itens }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao aprovar.')
      setOk(`${d.aprovados} lançamento(s) registrados em ${rotuloMes(competencia)}.`)
      setConfirmando(false)
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setSalvando(false) }
  }

  async function remover() {
    if (!removendo) return
    setProcessando(true); setErro('')
    try {
      const res = await fetch(`/api/admin/folha-pagamento/lancamentos/${config.slug}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competencia: removendo.registro.competencia,
          candidate_id: removendo.linha.candidate_id,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao remover.')
      setOk('Lançamento removido.'); setRemovendo(null)
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setProcessando(false) }
  }

  /** Resumo de um mês no histórico: contagens e/ou valor. */
  function resumoRegistro(h: RegistroLancamento): string {
    const partes: string[] = []
    for (const c of config.colunas) {
      const v = h[c.campo]
      if (v > 0) partes.push(`${v} ${c.rotulo.toLowerCase()}`)
    }
    if (config.temValor && h.valor > 0) partes.push(brl(h.valor))
    if (h.desconto > 0) partes.push(`desconto ${brl(h.desconto)}`)
    return partes.join(' · ') || '—'
  }

  const CABECALHO = [
    'Colaborador', 'Empresa', 'Cargo',
    ...config.colunas.map(c => c.rotulo),
    ...(config.temValor && valorFixo ? ['Base', 'Desconto', 'Valor do mês'] : []),
    ...(config.temValor && !valorFixo ? ['Valor'] : []),
  ]

  async function exportar() {
    const corpo = filtradas.map(l => [
      formatName(l.nome), l.empresa ?? '—', l.cargo ?? '—',
      ...config.colunas.map(c => contagemDe(l, c.campo)),
      ...(config.temValor && valorFixo ? [sugestaoDe(l), descontoDe(l), valorDe(l)] : []),
      ...(config.temValor && !valorFixo ? [valorDe(l)] : []),
    ])
    baixarArquivo(await gerarXlsx([CABECALHO, ...corpo], config.titulo), `${baseNome}.xlsx`)
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      {/* ── Cabeçalho ── */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold leading-tight">{config.titulo}</h1>
          <p className="text-sm text-muted-foreground">{config.descricao}</p>
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

        <Button variant="outline" onClick={exportar} disabled={filtradas.length === 0} className="gap-1.5">
          <Download className="w-3.5 h-3.5" />Exportar
        </Button>
      </div>

      {config.percentualSalario && (
        <p className="text-[12.5px] text-muted-foreground flex items-center gap-1.5">
          <Calculator className="w-3.5 h-3.5 shrink-0" />
          O valor é {Math.round(config.percentualSalario * 100)}% do salário da ficha
          {valorCalculado
            ? ' e não é editável aqui: para mudar, corrija o salário na ficha do colaborador.'
            : ' — confira e ajuste onde precisar antes de aprovar.'}
        </p>
      )}

      {cicloAprovado && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-[13px] text-emerald-900 flex-1">
            Mês <strong>registrado</strong>
            {config.temValor && <> — {brl(cicloAprovado.total_valor)}</>}
            {/* O total sai do CAMPO da coluna, não da posição dela: a ordem
                das colunas na tela muda, o campo no banco não. */}
            {config.colunas.map(c => {
              const t = TOTAL_DO_CAMPO[c.campo](cicloAprovado)
              return t > 0 ? <span key={c.campo}> · {t} {c.rotulo.toLowerCase()}</span> : null
            })}
            {cicloAprovado.aprovado_por ? ` por ${cicloAprovado.aprovado_por}` : ''}. Reaprovar substitui o registro.
          </p>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
        {/* Nada para digitar em massa quando o valor é a própria conta. */}
        {!multiplos && !(valorCalculado && !temContagens) && (
          <div className="flex gap-2">
            <input value={padrao} onChange={e => setPadrao(e.target.value.replace(/[^\d,]/g, ''))}
              placeholder={valorFixo ? 'Desconto p/ todos' : config.temValor && !valorCalculado ? 'Valor p/ todos' : `${config.colunas[0]?.rotulo ?? 'Qtd'} p/ todos`}
              inputMode="decimal"
              className="h-9 flex-1 min-w-0 border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
            <Button variant="outline" onClick={aplicarATodos} disabled={!padrao.trim() || filtradas.length === 0}
              className="gap-1.5 shrink-0" title="Aplicar aos listados">
              <Copy className="w-3.5 h-3.5" />Todos
            </Button>
          </div>
        )}
        <Button onClick={() => { setErro(''); setOk(''); setConfirmando(true) }}
          disabled={comLancamento === 0}
          title={comLancamento === 0 ? 'Preencha pelo menos um colaborador' : undefined}
          className={`gap-1.5 w-full ${multiplos || (valorCalculado && !temContagens) ? 'sm:col-start-2 lg:col-start-4' : ''}`}>
          <Check className="w-3.5 h-3.5" />Aprovar
        </Button>
      </div>

      {/* ── Resumo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Cartao titulo="Listados" valor={String(filtradas.length)} cor="text-gray-900" />
        <Cartao titulo="Com lançamento" valor={String(comLancamento)} cor="text-emerald-700" />
        {config.temValor && <Cartao titulo="Total" valor={brl(totalValor)} cor="text-primary" />}
        {valorFixo && (
          <Cartao titulo="Descontos" valor={brl(noEscopo.reduce((s, l) => s + descontoDe(l), 0))} cor="text-amber-700" />
        )}
        {totaisContagem.map(t => (
          <Cartao key={t.rotulo} titulo={t.rotulo} valor={String(t.total)} cor="text-primary" />
        ))}
      </div>

      {erro && <p className="text-[13px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{erro}</p>}
      {ok && <p className="text-[13px] text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{ok}</p>}

      {/* ── Lista ── */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Colaborador</th>
                <th className="px-3 py-2 font-semibold">Empresa</th>
                {/* Quatro contagens cabem porque a coluna é estreita: o
                    conteúdo é sempre um número de 1 a 3 dígitos. */}
                {config.colunas.map(c => (
                  <th key={c.campo} className="px-2 py-2 font-semibold text-center whitespace-nowrap">{c.rotulo}</th>
                ))}
                {config.temValor && valorFixo && (
                  <>
                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">
                      Base ({Math.round((config.percentualSalario ?? 0) * 100)}%)
                    </th>
                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Desconto</th>
                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Valor do mês</th>
                  </>
                )}
                {config.temValor && !valorFixo && (
                  <th className="px-3 py-2 font-semibold">
                    {multiplos ? `Valor e ${(config.rotuloDescricao ?? 'descrição').toLowerCase()}` : 'Valor'}
                  </th>
                )}
                <th className="pl-3 pr-4 py-2 w-px" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtradas.map(l => {
                const hist = historicoPorCand.get(l.candidate_id) ?? []
                const jaAprovado = aprovadosNoMes.get(l.candidate_id)
                const sugerido = sugestaoDe(l)
                return (
                  <tr key={l.candidate_id} className="hover:bg-gray-50 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
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
                              ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <History className="w-3 h-3" />
                            {hist.length} {hist.length === 1 ? 'mês' : 'meses'}
                          </button>
                          {historicoAberto.has(l.candidate_id) && (
                            <div className="mt-1 ml-4 pl-2.5 border-l-2 border-emerald-200 space-y-0.5">
                              {hist.map(h => (
                                <p key={h.competencia} className="text-[11.5px] text-gray-600 flex items-center gap-1">
                                  <span>
                                    {maiuscula(rotuloMes(h.competencia))}{' — '}
                                    <strong className="text-emerald-700">{resumoRegistro(h)}</strong>
                                  </span>
                                  <button onClick={() => setRemovendo({ linha: l, registro: h })}
                                    title="Remover o lançamento deste mês"
                                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{l.empresa ?? '—'}</td>

                    {config.colunas.map(c => (
                      <td key={c.campo} className="px-2 py-2 text-center">
                        <input value={contagens[l.candidate_id]?.[c.campo] ?? ''}
                          onChange={e => mudarContagem(l.candidate_id, c.campo, e.target.value.replace(/[^\d,]/g, ''))}
                          placeholder="0" inputMode="decimal"
                          className="h-8 w-16 mx-auto block border border-gray-300 rounded-md px-2 text-[13px] bg-white text-center" />
                      </td>
                    ))}

                    {config.temValor && !multiplos && !valorFixo && !valorCalculado && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-gray-400">R$</span>
                          <input value={valores[l.candidate_id] ?? ''}
                            onChange={e => setValores(v => ({ ...v, [l.candidate_id]: e.target.value.replace(/[^\d,]/g, '') }))}
                            placeholder="0,00" inputMode="decimal"
                            className="h-8 w-24 border border-gray-300 rounded-md px-2 text-[13px] bg-white text-right" />
                          {jaAprovado && <span className="text-[11px] font-semibold text-emerald-700">✓</span>}
                        </div>
                        {sugerido > 0 && (
                          <span className="block text-[10.5px] text-muted-foreground mt-0.5">
                            {Math.round((config.percentualSalario ?? 0) * 100)}% de {brl(paraNumero(l.salario))}
                          </span>
                        )}
                        {config.percentualSalario && sugerido === 0 && (
                          <span className="block text-[10.5px] text-amber-700 mt-0.5">
                            {l.salario ? 'salário por hora — informe o valor' : 'sem salário na ficha'}
                          </span>
                        )}
                      </td>
                    )}

                    {config.temValor && valorCalculado && (
                      /* Sem campo de propósito: o adicional é regra do cargo,
                         não digitação. O que muda o valor é o salário da ficha. */
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {sugerido > 0 ? (
                          <>
                            <span className="font-semibold text-gray-900">{brl(sugerido)}</span>
                            {jaAprovado && <span className="text-[11px] font-semibold text-emerald-700"> ✓</span>}
                            <span className="block text-[10.5px] text-muted-foreground">
                              {Math.round((config.percentualSalario ?? 0) * 100)}% de {brl(paraNumero(l.salario))}
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] text-amber-700">
                            {l.salario ? 'salário por hora — sem cálculo' : 'sem salário na ficha'}
                          </span>
                        )}
                      </td>
                    )}

                    {config.temValor && valorFixo && (
                      <>
                        {/* Base calculada: não editável de propósito — é regra,
                            não digitação. O que varia no mês é o desconto. */}
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {sugestaoDe(l) > 0 ? (
                            <span className="text-gray-700">{brl(sugestaoDe(l))}</span>
                          ) : (
                            <span className="text-[11px] text-amber-700">
                              {l.salario ? 'salário por hora' : 'sem salário na ficha'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[12px] text-gray-400">R$</span>
                            <input value={descontos[l.candidate_id] ?? ''}
                              onChange={e => setDescontos(v => ({ ...v, [l.candidate_id]: e.target.value.replace(/[^\d,]/g, '') }))}
                              placeholder="0,00" inputMode="decimal"
                              disabled={sugestaoDe(l) <= 0}
                              className="h-8 w-24 border border-gray-300 rounded-md px-2 text-[13px] bg-white text-right disabled:bg-gray-50 disabled:text-gray-400" />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <span className="font-semibold text-gray-900">{brl(valorDe(l))}</span>
                          {jaAprovado && <span className="text-[11px] font-semibold text-emerald-700"> ✓</span>}
                          {descontoDe(l) > sugestaoDe(l) && sugestaoDe(l) > 0 && (
                            <span className="block text-[10.5px] text-amber-700">
                              desconto maior que a base — zerado
                            </span>
                          )}
                        </td>
                      </>
                    )}

                    {/* Vários itens por pessoa: valor + descrição, um por linha,
                        com o total do mês no rodapé da célula. */}
                    {config.temValor && multiplos && (
                      <td className="px-3 py-2">
                        <div className="space-y-1.5">
                          {itensDe(l).map((it, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <span className="text-[12px] text-gray-400">R$</span>
                              <input value={it.valor}
                                onChange={e => mudarItem(l.candidate_id, i, 'valor', e.target.value.replace(/[^\d,]/g, ''))}
                                placeholder="0,00" inputMode="decimal"
                                className="h-8 w-24 shrink-0 border border-gray-300 rounded-md px-2 text-[13px] bg-white text-right" />
                              <input value={it.descricao}
                                onChange={e => mudarItem(l.candidate_id, i, 'descricao', e.target.value)}
                                placeholder={config.rotuloDescricao ?? 'Descrição'}
                                className="h-8 flex-1 min-w-[160px] border border-gray-300 rounded-md px-2 text-[13px] bg-white" />
                              {itensDe(l).length > 1 && (
                                <button onClick={() => removerItem(l.candidate_id, i)} title="Remover este item"
                                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded shrink-0">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {i === itensDe(l).length - 1 && (
                                <button onClick={() => adicionarItem(l.candidate_id)} title="Adicionar outro item"
                                  className="p-1 text-primary hover:bg-primary/10 rounded shrink-0">
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          {totalItensDe(l) > 0 && (
                            <p className="text-[11.5px] text-gray-600 pl-6">
                              Total do mês: <strong className="text-gray-900">{brl(totalItensDe(l))}</strong>
                              {jaAprovado && <span className="text-emerald-700 font-semibold"> ✓</span>}
                            </p>
                          )}
                        </div>
                      </td>
                    )}

                    <td className="pl-3 pr-4 py-2 text-right">
                      <Link href={`/admin/candidatos/${l.candidate_id}?tab=ficha`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline whitespace-nowrap">
                        Ficha<ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={4 + config.colunas.length + (valorFixo ? 2 : 0)} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhum colaborador nesta lista.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Confirmar aprovação ── */}
      {confirmando && (
        <Modal titulo={`Aprovar ${config.titulo.toLowerCase()}`} onFechar={() => setConfirmando(false)}>
          <p className="text-[13px] text-gray-700">
            Registrar <strong>{comLancamento}</strong> lançamento(s) em{' '}
            <strong>{maiuscula(rotuloMes(competencia))}</strong>
            {nomeEmpresa ? <> para <strong>{nomeEmpresa}</strong></> : ' para todas as empresas'}
            {config.temValor && <> — total de <strong>{brl(totalValor)}</strong></>}.
          </p>
          <p className="text-[12px] text-muted-foreground">
            Reaprovar substitui o que já estava registrado {nomeEmpresa ? 'nesta empresa' : 'no mês'}.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmando(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={aprovar} disabled={salvando} className="gap-1.5">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Aprovar
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Remover lançamento ── */}
      {removendo && (
        <Modal titulo="Remover lançamento" onFechar={() => setRemovendo(null)}>
          <p className="text-[13px] text-gray-700">
            Remover o lançamento de <strong>{formatName(removendo.linha.nome)}</strong> em{' '}
            <strong>{maiuscula(rotuloMes(removendo.registro.competencia))}</strong>? Não dá para desfazer.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemovendo(null)} disabled={processando}>Cancelar</Button>
            <Button onClick={remover} disabled={processando} className="gap-1.5 bg-red-600 hover:bg-red-700">
              {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Remover
            </Button>
          </div>
        </Modal>
      )}
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

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold">{titulo}</h2>
        {children}
      </div>
    </div>
  )
}
