'use client'
import { useState } from 'react'
import { Wallet, FileClock, Cake, Search, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'

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

type Aba = 'salarios' | 'experiencia' | 'aniversarios'

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

// ─── Componente ───────────────────────────────────────────────────────────────

export function RelatoriosRh({
  colaboradores, empresas,
}: {
  colaboradores: ColaboradorRelatorio[]
  empresas: EmpresaOpcao[]
}) {
  const [aba, setAba] = useState<Aba>('salarios')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [somenteMes, setSomenteMes] = useState(true)

  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome
  const sufixo = nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''

  const base = colaboradores.filter(c => {
    if (empresaFiltro && c.empresa_id !== empresaFiltro) return false
    if (!busca.trim()) return true
    return `${c.nome} ${c.cargo ?? ''}`.toLowerCase().includes(busca.trim().toLowerCase())
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

  function exportar() {
    if (aba === 'salarios') {
      const linhas = salarios.map(c => [
        formatName(c.nome), c.empresa ?? '—', c.cargo ?? '—', tempoDeCasa(c.admissao),
        paraNumero(c.salario), ehPorHora(c.salario) ? 'Por hora' : 'Mensal',
      ])
      baixarArquivo(
        gerarXlsx([
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
        gerarXlsx([['Nome', 'Empresa', 'Cargo', 'Início', 'Término', 'Dias restantes', 'Contrato'], ...linhas], 'Experiência'),
        `relatorio-experiencia${sufixo}.xlsx`,
      )
    } else {
      const linhas = aniversariantes.map(c => [
        formatName(c.nome), c.empresa ?? '—', formatarData(c.nascimento as string), c.dias,
      ])
      baixarArquivo(
        gerarXlsx([['Nome', 'Empresa', 'Aniversário', 'Dias para o aniversário'], ...linhas], 'Aniversariantes'),
        `relatorio-aniversariantes${sufixo}.xlsx`,
      )
    }
  }

  const ABAS: { id: Aba; label: string; icone: React.ElementType; qtd: number }[] = [
    { id: 'salarios', label: 'Salários', icone: Wallet, qtd: salarios.length },
    { id: 'experiencia', label: 'Contratos de experiência', icone: FileClock, qtd: experiencia.length },
    { id: 'aniversarios', label: 'Aniversariantes', icone: Cake, qtd: aniversariantes.length },
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

      {/* Conteúdo */}
      <div className="overflow-x-auto">
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
