'use client'
import { Fragment, useState } from 'react'
import {
  Wallet, FileClock, Cake, Search, Download, Palmtree, ShieldAlert,
  ChevronDown, ChevronRight, FileText, FileDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName, contemBusca } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { abrirArquivoAssinado } from '@/lib/abrir-arquivo'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ColaboradorRelatorio {
  candidate_id: string
  nome: string
  cargo: string | null
  empresa_id: string | null
  empresa: string | null
  /** como veio da ficha: "1.892,34" */
  salario: string | null
  admissao: string | null            // yyyy-mm-dd
  contrato_experiencia: string | null // "45 + 45 dias" | "Sem experiência"
  nascimento: string | null          // yyyy-mm-dd
  vinculo: 'contratado' | 'intermitente'
}

export interface EmpresaOpcao { id: string; nome: string }

/** Uma linha de `vacations`: férias já gozadas ou agendadas. */
export interface FeriasRegistro {
  candidate_id: string
  inicio: string   // yyyy-mm-dd
  fim: string      // yyyy-mm-dd
  tipo: 'historico' | 'solicitacao'
}

/** Uma linha de `warnings`: a advertência e o documento dela. */
export interface AdvertenciaRegistro {
  id: string
  candidate_id: string
  data: string | null   // yyyy-mm-dd
  motivo: string
  file_url: string | null
  file_path: string | null
  file_name: string | null
}

type Aba = 'salarios' | 'experiencia' | 'aniversarios' | 'ferias' | 'advertencias'

// ─── Helpers de data e valor ──────────────────────────────────────────────────

/** Hoje no fuso de São Paulo, zerado (evita erro de um dia por fuso). */
function hoje(): Date {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
}

function paraData(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function somarDias(iso: string, dias: number): string {
  const d = paraData(iso)
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** "1.892,34" → 1892.34 */
function paraNumero(v: string | null): number {
  if (!v) return 0
  return Number(v.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Valor da ficha que é remuneração por HORA, não mensal. Salário mensal no
 * Brasil não fica abaixo de R$ 100 — valores como "R$ 8,60" são valor/hora
 * (padrão dos intermitentes).
 */
function ehPorHora(salario: string | null): boolean {
  const v = paraNumero(salario)
  return v > 0 && v < 100
}

function tempoDeCasa(admissao: string | null): string {
  if (!admissao) return '—'
  const ini = paraData(admissao)
  const hj = hoje()
  let meses = (hj.getFullYear() - ini.getFullYear()) * 12 + (hj.getMonth() - ini.getMonth())
  if (hj.getDate() < ini.getDate()) meses--
  if (meses < 0) return '—'
  const anos = Math.floor(meses / 12)
  const m = meses % 12
  const partes: string[] = []
  if (anos > 0) partes.push(`${anos} ano${anos !== 1 ? 's' : ''}`)
  if (m > 0) partes.push(`${m} ${m !== 1 ? 'meses' : 'mês'}`)
  return partes.length ? partes.join(' e ') : 'menos de 1 mês'
}

/** Dias até o próximo aniversário (0 = hoje). */
function diasAteAniversario(nascimento: string): number {
  const hj = hoje()
  const [, m, d] = nascimento.split('-').map(Number)
  let prox = new Date(hj.getFullYear(), m - 1, d)
  if (prox < hj) prox = new Date(hj.getFullYear() + 1, m - 1, d)
  return diasEntre(hj, prox)
}

/** Idade que a pessoa completa no PRÓXIMO aniversário. */
function idadeQueFaz(nascimento: string): number {
  const [ano, m, d] = nascimento.split('-').map(Number)
  const hj = hoje()
  const esteAno = new Date(hj.getFullYear(), m - 1, d)
  const anoDoProximo = esteAno < hj ? hj.getFullYear() + 1 : hj.getFullYear()
  return anoDoProximo - ano
}

/** Soma os dias do contrato: "45 + 45 dias" → 90; "Sem experiência" → 0. */
function diasExperiencia(contrato: string | null): number {
  return (contrato?.match(/\d+/g) ?? []).reduce((s, n) => s + Number(n), 0)
}


// ─── Férias ───────────────────────────────────────────────────────────────────
// Cada 12 meses de casa fecham um PERÍODO AQUISITIVO; a partir daí a empresa
// tem mais 12 meses (período concessivo) para conceder as férias. A CLT exige
// avisar o colaborador com pelo menos 30 dias de antecedência, então o prazo
// real para AGENDAR é o fim do concessivo menos 30 dias — passou disso, vencidas.

/** Aviso prévio mínimo de férias (CLT art. 135). */
const DIAS_ANTECEDENCIA = 30

export type StatusFerias = 'agendada' | 'agendar' | 'aguardando' | 'vencida' | 'sem_admissao'

interface SituacaoFerias {
  status: StatusFerias
  /** Coluna "Quanto tempo para tirar férias". */
  prazo: string
  /** Para ordenar: quanto menor, mais urgente. */
  ordem: number
}

/** Meses inteiros entre duas datas puras. */
function mesesEntre(deIso: string, ate: Date): number {
  const de = paraData(deIso)
  let m = (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth())
  if (ate.getDate() < de.getDate()) m--
  return m
}

/** Data pura somando N anos (mantém dia e mês). */
function somarAnos(iso: string, anos: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${a + anos}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function emMeses(dias: number): string {
  if (dias <= 31) return `${dias} dia${dias !== 1 ? 's' : ''}`
  const meses = Math.floor(dias / 30)
  return `${meses} ${meses !== 1 ? 'meses' : 'mês'}`
}

/**
 * Em que situação de férias o colaborador está.
 * `registros` são as férias DELE, já filtradas.
 */
function situacaoFerias(admissao: string | null, registros: FeriasRegistro[]): SituacaoFerias {
  if (!admissao || !/^\d{4}-\d{2}-\d{2}$/.test(admissao)) {
    return { status: 'sem_admissao', prazo: 'sem data de admissão na ficha', ordem: 9e9 }
  }
  const hj = hoje()

  // Já tem férias marcadas para frente? É o que o RH quer ver primeiro.
  const agendada = registros
    .filter(f => f.tipo === 'solicitacao' && paraData(f.inicio) >= hj)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))[0]
  if (agendada) {
    const dias = diasEntre(hj, paraData(agendada.inicio))
    return {
      status: 'agendada',
      prazo: `sai em ${formatarData(agendada.inicio)} · ${emMeses(dias)}`,
      ordem: 100000 + dias,
    }
  }

  // Cada férias conta para o período aquisitivo em que ela COMEÇA.
  const cobertos = new Set(
    registros
      .map(f => Math.floor(mesesEntre(admissao, paraData(f.inicio)) / 12))
      .filter(n => n >= 1),
  )
  const ciclosCompletos = Math.floor(mesesEntre(admissao, hj) / 12)

  // Primeiro período aquisitivo fechado que ainda não teve férias.
  let pendente = 0
  for (let n = 1; n <= ciclosCompletos; n++) {
    if (!cobertos.has(n)) { pendente = n; break }
  }

  if (pendente === 0) {
    // Nada em aberto: mostra quando abre o próximo direito.
    const abre = somarAnos(admissao, ciclosCompletos + 1)
    const dias = diasEntre(hj, paraData(abre))
    return {
      status: 'aguardando',
      prazo: `só a partir de ${formatarData(abre)} · faltam ${emMeses(dias)}`,
      ordem: 200000 + dias,
    }
  }

  const fimConcessivo = somarAnos(admissao, pendente + 1)
  const limiteAgendar = somarDias(fimConcessivo, -DIAS_ANTECEDENCIA)
  const dias = diasEntre(hj, paraData(limiteAgendar))

  if (dias < 0) {
    return {
      status: 'vencida',
      prazo: `prazo venceu em ${formatarData(limiteAgendar)} · há ${emMeses(-dias)}`,
      ordem: dias,
    }
  }
  return {
    status: 'agendar',
    prazo: `agendar até ${formatarData(limiteAgendar)} · ${emMeses(dias)}`,
    ordem: dias,
  }
}

const ROTULO_FERIAS: Record<StatusFerias, { texto: string; classe: string }> = {
  vencida:      { texto: 'Vencidas',            classe: 'bg-red-100 text-red-700 border-red-200' },
  agendar:      { texto: 'Precisa agendar',     classe: 'bg-amber-100 text-amber-800 border-amber-200' },
  agendada:     { texto: 'Agendada',            classe: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  aguardando:   { texto: 'Ainda não pode',      classe: 'bg-gray-100 text-gray-600 border-gray-200' },
  sem_admissao: { texto: 'Sem admissão',        classe: 'bg-gray-100 text-gray-500 border-gray-200' },
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function RelatoriosRh({
  colaboradores, empresas, ferias, advertencias,
}: {
  colaboradores: ColaboradorRelatorio[]
  empresas: EmpresaOpcao[]
  ferias: FeriasRegistro[]
  advertencias: AdvertenciaRegistro[]
}) {
  const [aba, setAba] = useState<Aba>('salarios')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [somenteMes, setSomenteMes] = useState(true)
  const [statusFerias, setStatusFerias] = useState<StatusFerias | ''>('')
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [erroArquivo, setErroArquivo] = useState('')

  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome
  const sufixo = nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''

  const base = colaboradores.filter(c => {
    if (empresaFiltro && c.empresa_id !== empresaFiltro) return false
    if (!busca.trim()) return true
    return contemBusca(`${c.nome} ${c.cargo ?? ''}`, busca)
  })

  // ── Salários ──
  // Intermitentes costumam ter VALOR/HORA na ficha (ex.: R$ 8,60). Somar isso
  // com salário mensal daria um total falso, então o total só considera os
  // valores mensais e os por hora ficam marcados.
  const salarios = [...base].sort((a, b) => paraNumero(b.salario) - paraNumero(a.salario))
  const mensais = salarios.filter(c => !ehPorHora(c.salario))
  const folhaTotal = mensais.reduce((s, c) => s + paraNumero(c.salario), 0)
  const qtdPorHora = salarios.length - mensais.length

  // ── Contratos de experiência (quem ainda está no período) ──
  const hj = hoje()
  const experiencia = base
    .map(c => {
      const dias = diasExperiencia(c.contrato_experiencia)
      if (!c.admissao || dias <= 0) return null
      const fim = somarDias(c.admissao, dias)
      if (paraData(fim) < hj) return null
      return { ...c, inicio: c.admissao, fim, restantes: diasEntre(hj, paraData(fim)) }
    })
    .filter(Boolean)
    .sort((a, b) => a!.restantes - b!.restantes) as (ColaboradorRelatorio & { inicio: string; fim: string; restantes: number })[]

  // ── Aniversariantes ──
  const mesAtual = hj.getMonth() + 1
  const aniversariantes = base
    .filter(c => c.nascimento)
    .map(c => ({
      ...c,
      dias: diasAteAniversario(c.nascimento as string),
      mes: Number((c.nascimento as string).split('-')[1]),
    }))
    .filter(c => (somenteMes ? c.mes === mesAtual : true))
    .sort((a, b) => (somenteMes
      ? Number(a.nascimento!.split('-')[2]) - Number(b.nascimento!.split('-')[2])
      : a.dias - b.dias))

  // ── Férias ──
  const feriasPorCand = new Map<string, FeriasRegistro[]>()
  for (const f of ferias) {
    const arr = feriasPorCand.get(f.candidate_id) ?? []
    arr.push(f)
    feriasPorCand.set(f.candidate_id, arr)
  }

  // Intermitente não entra: sem jornada contínua, não há período aquisitivo
  // correndo, então cobrar prazo de férias dele seria alarme falso.
  const baseFerias = base.filter(c => c.vinculo !== 'intermitente')

  const feriasLinhas = baseFerias
    .map(c => ({ ...c, situacao: situacaoFerias(c.admissao, feriasPorCand.get(c.candidate_id) ?? []) }))
    .filter(c => (statusFerias ? c.situacao.status === statusFerias : true))
    // Mais urgente primeiro: vencidas (ordem negativa), depois o prazo mais curto.
    .sort((a, b) => a.situacao.ordem - b.situacao.ordem)

  // ── Advertências ──
  // Só quem tem alguma: a lista responde "quem levou e quantas", não serve de
  // segunda lista de colaboradores.
  const advPorCand = new Map<string, AdvertenciaRegistro[]>()
  for (const a of advertencias) {
    const arr = advPorCand.get(a.candidate_id) ?? []
    arr.push(a)
    advPorCand.set(a.candidate_id, arr)
  }

  const advLinhas = base
    .map(c => ({ ...c, itens: advPorCand.get(c.candidate_id) ?? [] }))
    .filter(c => c.itens.length > 0)
    .sort((a, b) => b.itens.length - a.itens.length || a.nome.localeCompare(b.nome, 'pt-BR'))

  const totalAdvertencias = advLinhas.reduce((s, c) => s + c.itens.length, 0)

  const alternarLinha = (id: string) => setAbertos(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  async function abrirDocumento(e: React.MouseEvent, a: AdvertenciaRegistro) {
    const erro = await abrirArquivoAssinado(e, { url: a.file_url, path: a.file_path, name: a.file_name })
    setErroArquivo(erro ?? '')
  }

  const contagemFerias = baseFerias.reduce((acc, c) => {
    const st = situacaoFerias(c.admissao, feriasPorCand.get(c.candidate_id) ?? []).status
    acc[st] = (acc[st] ?? 0) + 1
    return acc
  }, {} as Record<StatusFerias, number>)

  async function exportar() {
    if (aba === 'advertencias') {
      // Uma linha por advertência: no Excel o que se filtra é a ocorrência,
      // não a pessoa.
      const linhas = advLinhas.flatMap(c => c.itens.map(a => [
        formatName(c.nome), c.empresa ?? '—', c.cargo ?? '—', c.itens.length,
        a.data ? formatarData(a.data) : '—', a.motivo, a.file_name ?? '',
      ]))
      return baixarArquivo(
        await gerarXlsx([
          ['Nome', 'Empresa', 'Cargo', 'Total de advertências', 'Data', 'Motivo', 'Documento'],
          ...linhas,
        ], 'Advertências'),
        `relatorio-advertencias${sufixo}.xlsx`,
      )
    }
    if (aba === 'ferias') {
      const linhas = feriasLinhas.map(c => [
        formatName(c.nome), c.empresa ?? '—', c.cargo ?? '—',
        c.situacao.prazo, ROTULO_FERIAS[c.situacao.status].texto,
      ])
      return baixarArquivo(
        await gerarXlsx([['Nome', 'Empresa', 'Cargo', 'Quanto tempo para tirar férias', 'Status'], ...linhas], 'Férias'),
        `ferias${sufixo}.xlsx`,
      )
    }
    if (aba === 'salarios') {
      const linhas = salarios.map(c => [
        formatName(c.nome), c.empresa ?? '—', c.cargo ?? '—', tempoDeCasa(c.admissao),
        paraNumero(c.salario), ehPorHora(c.salario) ? 'Por hora' : 'Mensal',
      ])
      baixarArquivo(
        await gerarXlsx([
          ['Nome', 'Empresa', 'Cargo', 'Tempo de casa', 'Salário', 'Tipo'],
          ...linhas,
          ['TOTAL MENSAL', '', '', '', folhaTotal, ''],
        ], 'Salários'),
        `relatorio-salarios${sufixo}.xlsx`,
      )
    } else if (aba === 'experiencia') {
      const linhas = experiencia.map(c => [
        formatName(c.nome), c.empresa ?? '—', c.cargo ?? '—',
        formatarData(c.inicio), formatarData(c.fim), c.restantes, c.contrato_experiencia ?? '',
      ])
      baixarArquivo(
        await gerarXlsx([['Nome', 'Empresa', 'Cargo', 'Início', 'Término', 'Dias restantes', 'Contrato'], ...linhas], 'Experiência'),
        `relatorio-experiencia${sufixo}.xlsx`,
      )
    } else {
      const linhas = aniversariantes.map(c => [
        formatName(c.nome), c.empresa ?? '—', formatarData(c.nascimento as string), c.dias,
      ])
      baixarArquivo(
        await gerarXlsx([['Nome', 'Empresa', 'Aniversário', 'Dias para o aniversário'], ...linhas], 'Aniversariantes'),
        `relatorio-aniversariantes${sufixo}.xlsx`,
      )
    }
  }

  const ABAS: { id: Aba; label: string; icone: React.ElementType; qtd: number }[] = [
    { id: 'salarios', label: 'Salários', icone: Wallet, qtd: salarios.length },
    { id: 'experiencia', label: 'Contratos de experiência', icone: FileClock, qtd: experiencia.length },
    { id: 'aniversarios', label: 'Aniversariantes', icone: Cake, qtd: aniversariantes.length },
    { id: 'ferias', label: 'Férias', icone: Palmtree, qtd: feriasLinhas.length },
    { id: 'advertencias', label: 'Advertências', icone: ShieldAlert, qtd: advLinhas.length },
  ]

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      {/* Abas */}
      <div className="flex gap-1 p-2 border-b overflow-x-auto">
        {ABAS.map(a => {
          const Icone = a.icone
          return (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors ${
                aba === a.id ? 'bg-primary text-primary-foreground' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <Icone className="w-3.5 h-3.5" />{a.label}
              <span className={`text-[10px] ${aba === a.id ? 'text-primary-foreground/70' : 'text-gray-400'}`}>{a.qtd}</span>
            </button>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 p-3 border-b bg-gray-50/60">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou cargo…"
            className="h-9 w-full border border-gray-300 rounded-md pl-8 pr-2.5 text-sm bg-white" />
        </div>
        <select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)}
          className="h-9 border border-gray-300 rounded-md px-2.5 text-sm bg-white min-w-[180px]">
          <option value="">Todas as empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        {aba === 'ferias' && (
          <select value={statusFerias} onChange={e => setStatusFerias(e.target.value as StatusFerias | '')}
            className="h-9 border border-gray-300 rounded-md px-2.5 text-sm bg-white min-w-[170px]">
            <option value="">Todas as situações</option>
            <option value="vencida">Vencidas ({contagemFerias.vencida ?? 0})</option>
            <option value="agendar">Precisa agendar ({contagemFerias.agendar ?? 0})</option>
            <option value="agendada">Agendadas ({contagemFerias.agendada ?? 0})</option>
            <option value="aguardando">Ainda não pode ({contagemFerias.aguardando ?? 0})</option>
            <option value="sem_admissao">Sem admissão ({contagemFerias.sem_admissao ?? 0})</option>
          </select>
        )}
        {aba === 'aniversarios' && (
          <button onClick={() => setSomenteMes(s => !s)}
            className={`h-9 px-3 rounded-md text-[12.5px] font-semibold border transition-colors ${
              somenteMes ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-gray-600 border-gray-300'
            }`}>
            {somenteMes ? 'Aniversariantes do mês' : 'Todos, por proximidade'}
          </button>
        )}
        <Button variant="outline" onClick={exportar} className="gap-1.5 shrink-0">
          <Download className="w-3.5 h-3.5" />Exportar
        </Button>
      </div>

      {erroArquivo && (
        <p className="px-3 py-2 text-[12.5px] text-red-600 border-b bg-red-50">{erroArquivo}</p>
      )}

      {/* Conteúdo */}
      <div className="overflow-x-auto">
        {aba === 'advertencias' && (
          <table className="w-full text-sm">
            <Cabecalho colunas={['Colaborador', 'Empresa', 'Cargo', 'Desde a admissão', 'Advertências']} />
            <tbody className="divide-y">
              {advLinhas.map(c => {
                const aberto = abertos.has(c.candidate_id)
                return (
                  <Fragment key={c.candidate_id}>
                    <tr className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => alternarLinha(c.candidate_id)}>
                      <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {aberto
                            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                            : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                          {formatName(c.nome)}
                        </span>
                        {c.vinculo === 'intermitente' && <Selo texto="Intermitente" />}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{c.empresa ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{c.cargo ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{tempoDeCasa(c.admissao)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                          c.itens.length >= 3
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : c.itens.length === 2
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                        }`}>
                          <ShieldAlert className="w-3 h-3" />
                          {c.itens.length}
                        </span>
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="bg-gray-50/70">
                        <td colSpan={5} className="px-4 py-3">
                          <ul className="space-y-2">
                            {c.itens.map(a => (
                              <li key={a.id} className="flex flex-wrap items-start gap-2 text-[13px]">
                                <span className="font-semibold text-gray-900 whitespace-nowrap w-[92px] shrink-0">
                                  {a.data ? formatarData(a.data) : 'sem data'}
                                </span>
                                <span className="flex-1 min-w-[200px] text-gray-700 whitespace-pre-wrap">
                                  {a.motivo || <span className="text-gray-400">sem motivo registrado</span>}
                                </span>
                                {a.file_url ? (
                                  <a href={a.file_url} onClick={e => abrirDocumento(e, a)}
                                    target="_blank" rel="noreferrer" download
                                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 hover:underline whitespace-nowrap">
                                    {a.file_name?.endsWith('.pdf')
                                      ? <FileText className="w-3.5 h-3.5 text-red-500" />
                                      : <FileDown className="w-3.5 h-3.5 text-blue-500" />}
                                    Baixar advertência
                                  </a>
                                ) : (
                                  <span className="text-[12px] text-gray-400 whitespace-nowrap">sem documento</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {advLinhas.length === 0 && <Vazio colunas={5} />}
            </tbody>
            {advLinhas.length > 0 && (
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-[12px] font-semibold text-gray-600">
                    {advLinhas.length} colaborador{advLinhas.length !== 1 ? 'es' : ''} com advertência
                  </td>
                  <td className="px-4 py-2.5 font-bold text-gray-900 whitespace-nowrap">{totalAdvertencias}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {aba === 'salarios' && (
          <table className="w-full text-sm">
            <Cabecalho colunas={['Nome', 'Empresa', 'Cargo', 'Tempo de casa', 'Salário']} />
            <tbody className="divide-y">
              {salarios.map(c => (
                <tr key={c.candidate_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                    {formatName(c.nome)}
                    {c.vinculo === 'intermitente' && <Selo texto="Intermitente" />}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{c.empresa ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{c.cargo ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{tempoDeCasa(c.admissao)}</td>
                  <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">
                    {c.salario ? brl(paraNumero(c.salario)) : '—'}
                    {ehPorHora(c.salario) && (
                      <span className="ml-1 text-[11px] font-normal text-sky-700">/hora</span>
                    )}
                  </td>
                </tr>
              ))}
              {salarios.length === 0 && <Vazio colunas={5} />}
            </tbody>
            {salarios.length > 0 && (
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-[12px] font-semibold text-gray-600">
                    Total mensal ({mensais.length} colaborador{mensais.length !== 1 ? 'es' : ''})
                    {qtdPorHora > 0 && (
                      <span className="font-normal text-muted-foreground">
                        {' '}— {qtdPorHora} com valor por hora fora da soma
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-bold text-gray-900 whitespace-nowrap">{brl(folhaTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {aba === 'experiencia' && (
          <table className="w-full text-sm">
            <Cabecalho colunas={['Nome', 'Empresa', 'Início', 'Término', 'Faltam', 'Contrato']} />
            <tbody className="divide-y">
              {experiencia.map(c => (
                <tr key={c.candidate_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                    {formatName(c.nome)}
                    <span className="block text-[11px] text-muted-foreground">{c.cargo ?? '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{c.empresa ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatarData(c.inicio)}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{formatarData(c.fim)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                      c.restantes <= 7 ? 'bg-red-100 text-red-700'
                        : c.restantes <= 15 ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {c.restantes === 0 ? 'termina hoje' : `${c.restantes} dia${c.restantes !== 1 ? 's' : ''}`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{c.contrato_experiencia ?? '—'}</td>
                </tr>
              ))}
              {experiencia.length === 0 && <Vazio colunas={6} texto="Ninguém em contrato de experiência." />}
            </tbody>
          </table>
        )}

        {aba === 'ferias' && (
          <select value={statusFerias} onChange={e => setStatusFerias(e.target.value as StatusFerias | '')}
            className="h-9 border border-gray-300 rounded-md px-2.5 text-sm bg-white min-w-[170px]">
            <option value="">Todas as situações</option>
            <option value="vencida">Vencidas ({contagemFerias.vencida ?? 0})</option>
            <option value="agendar">Precisa agendar ({contagemFerias.agendar ?? 0})</option>
            <option value="agendada">Agendadas ({contagemFerias.agendada ?? 0})</option>
            <option value="aguardando">Ainda não pode ({contagemFerias.aguardando ?? 0})</option>
            <option value="sem_admissao">Sem admissão ({contagemFerias.sem_admissao ?? 0})</option>
          </select>
        )}
        {aba === 'aniversarios' && (
          <table className="w-full text-sm">
            <Cabecalho colunas={['Nome', 'Empresa', 'Aniversário', 'Faltam']} />
            <tbody className="divide-y">
              {aniversariantes.map(c => (
                <tr key={c.candidate_id} className={`hover:bg-gray-50 ${c.dias === 0 ? 'bg-amber-50' : ''}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                    {formatName(c.nome)}
                    <span className="block text-[11px] text-muted-foreground">{c.cargo ?? '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{c.empresa ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                    {formatarData(c.nascimento as string)}
                    <span className="text-[11px] text-muted-foreground"> · faz {idadeQueFaz(c.nascimento as string)}</span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {c.dias === 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">
                        <Cake className="w-3 h-3" />é hoje!
                      </span>
                    ) : (
                      <span className="text-[12px] text-gray-600">
                        {c.dias} dia{c.dias !== 1 ? 's' : ''}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {aniversariantes.length === 0 && (
                <Vazio colunas={4} texto={somenteMes ? 'Nenhum aniversariante neste mês.' : 'Sem datas de nascimento.'} />
              )}
            </tbody>
          </table>
        )}

        {aba === 'ferias' && (
          <table className="w-full text-sm">
            <Cabecalho colunas={['Nome', 'Empresa', 'Quanto tempo para tirar férias', 'Status']} />
            <tbody className="divide-y">
              {feriasLinhas.map(c => {
                const r = ROTULO_FERIAS[c.situacao.status]
                return (
                  <tr key={c.candidate_id}
                    className={`hover:bg-gray-50 ${c.situacao.status === 'vencida' ? 'bg-red-50/60' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                      {formatName(c.nome)}
                      <span className="block text-[11px] text-muted-foreground">{c.cargo ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{c.empresa ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{c.situacao.prazo}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 border ${r.classe}`}>
                        {r.texto}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {feriasLinhas.length === 0 && (
                <Vazio colunas={4} texto="Nenhum colaborador nesta situação." />
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Cabecalho({ colunas }: { colunas: string[] }) {
  return (
    <thead className="bg-gray-50 border-b">
      <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
        {colunas.map(c => <th key={c} className="px-4 py-2.5 font-semibold whitespace-nowrap">{c}</th>)}
      </tr>
    </thead>
  )
}

function Vazio({ colunas, texto = 'Nenhum colaborador encontrado.' }: { colunas: number; texto?: string }) {
  return (
    <tr><td colSpan={colunas} className="px-4 py-10 text-center text-muted-foreground">{texto}</td></tr>
  )
}

function Selo({ texto }: { texto: string }) {
  return (
    <span className="ml-2 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-sky-100 text-sky-700 align-middle">
      {texto}
    </span>
  )
}
