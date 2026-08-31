'use client'
import { useState } from 'react'
import Link from 'next/link'
import {
  CheckCheck, Download, ChevronDown, ChevronRight, ExternalLink,
  FileSpreadsheet, FileText, CalendarCheck, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName, contemBusca } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { gerarPdfTabela } from '@/lib/pdf'
import { maiuscula, rotuloMes } from '@/lib/competencia'
import type { LinhaFechamento, EmpresaOpcao } from '@/lib/fechamento-folha'

export interface PeriodoAprovado {
  competencia: string
  aprovado_por: string | null
  aprovado_em: string
  resumo: {
    colaboradores: number
    total_dias: number
    total_faltas: number
    total_gorjeta: number
    total_salario: number
  }
  /** Outros fechamentos do mesmo mês (gorjetas, vale transporte, lançamentos). */
  outras: string[]
  linhas: LinhaFechamento[]
  empresas: EmpresaOpcao[]
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
  'Colaborador', 'Empresa', 'Dias', 'Faltas', 'Vale transporte', 'Mensalidade sindical',
  'Gorjeta', 'Cargo de confiança', 'Insalubridade 20%', 'Quebra de caixa 15%', 'Salário', 'Comentário',
]

export function AprovadasClient({ periodos }: { periodos: PeriodoAprovado[] }) {
  // O mês mais recente já abre: é o que se consulta na maior parte das vezes.
  const [abertos, setAbertos] = useState<Set<string>>(
    () => new Set(periodos.slice(0, 1).map(p => p.competencia)),
  )
  const [menu, setMenu] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')

  const alternar = (c: string) => setAbertos(s => {
    const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n
  })

  function filtrar(p: PeriodoAprovado): LinhaFechamento[] {
    return p.linhas.filter(l => {
      if (empresaFiltro && (l.empresa ?? '') !== empresaFiltro) return false
      const termo = busca.trim()
      if (!termo) return true
      const digitos = termo.replace(/\D/g, '')
      if (digitos.length >= 3 && (l.cpf ?? '').includes(digitos)) return true
      return contemBusca(`${l.nome} ${l.cargo ?? ''}`, termo)
    })
  }

  function corpoDe(p: PeriodoAprovado): (string | number)[][] {
    return filtrar(p).map(l => [
      formatName(l.nome), l.empresa ?? '—', l.dias_trabalhados, l.faltas,
      simNaoTexto(l.vale_transporte), simNaoTexto(l.mensalidade_sindical), l.gorjeta,
      simNaoTexto(l.cargo_confianca), simNaoTexto(l.insalubridade_20), simNaoTexto(l.quebra_caixa_15),
      paraNumero(l.salario), l.comentario,
    ])
  }

  async function exportarXlsx(p: PeriodoAprovado) {
    setMenu(null)
    baixarArquivo(
      await gerarXlsx([CABECALHO, ...corpoDe(p)], 'Folha aprovada'),
      `folha-aprovada-${p.competencia.slice(0, 7)}.xlsx`,
    )
  }

  async function exportarPdf(p: PeriodoAprovado) {
    setMenu(null)
    const [mes, ano] = maiuscula(rotuloMes(p.competencia)).split(' de ')
    const linhas = filtrar(p)
    const blob = await gerarPdfTabela({
      titulo: `Folha aprovada — ${empresaFiltro || 'Todas as empresas'}`,
      subtitulo: `${mes} / ${ano} · ${linhas.length} colaboradores · aprovada${p.aprovado_por ? ` por ${p.aprovado_por}` : ''} em ${dataHora(p.aprovado_em)}`,
      // No PDF a coluna Empresa sai: ela já está no título e repetir o mesmo
      // nome em toda linha rouba largura de página.
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
    baixarArquivo(blob, `folha-aprovada-${p.competencia.slice(0, 7)}.pdf`)
  }

  const todasEmpresas = Array.from(new Set(periodos.flatMap(p => p.empresas.map(e => e.nome)))).sort()

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <CheckCheck className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold leading-tight">Folhas aprovadas</h1>
          <p className="text-sm text-muted-foreground">
            Os meses já fechados, com o detalhe por colaborador. Só leitura — aprovar
            continua no Fechamento de folha.
          </p>
        </div>
      </div>

      {periodos.length > 0 && (
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
            {todasEmpresas.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}

      {periodos.length === 0 && (
        <div className="rounded-2xl border bg-white shadow-sm p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma folha aprovada ainda. Aprove um mês em{' '}
            <Link href="/admin/folha-pagamento/fechamento" className="text-primary underline">
              Fechamento de folha
            </Link>{' '}
            que ele aparece aqui.
          </p>
        </div>
      )}

      {periodos.map(p => {
        const aberto = abertos.has(p.competencia)
        const linhas = filtrar(p)
        return (
          <div key={p.competencia} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 p-4 flex-wrap">
              <button onClick={() => alternar(p.competencia)}
                className="flex items-center gap-2 flex-1 min-w-[260px] text-left">
                {aberto ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <CalendarCheck className="w-4 h-4 text-primary shrink-0" />
                <span className="font-bold text-gray-900">{maiuscula(rotuloMes(p.competencia))}</span>
                <span className="text-[12px] text-muted-foreground">
                  {p.resumo.colaboradores} colaboradores · {p.resumo.total_dias} dias · {brl(p.resumo.total_salario)}
                </span>
              </button>
              <span className="text-[11.5px] text-muted-foreground">
                aprovada{p.aprovado_por ? ` por ${p.aprovado_por}` : ''} em {dataHora(p.aprovado_em)}
              </span>
              <div className="relative">
                <Button variant="outline" size="sm"
                  onClick={() => setMenu(m => (m === p.competencia ? null : p.competencia))}
                  className="gap-1.5">
                  <Download className="w-3.5 h-3.5" />Exportar
                  <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                </Button>
                {menu === p.competencia && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                    <div className="absolute right-0 mt-1 z-20 w-48 rounded-xl border bg-white shadow-lg overflow-hidden">
                      <button onClick={() => exportarXlsx(p)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-gray-50">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />Excel
                      </button>
                      <button onClick={() => exportarPdf(p)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-gray-50 border-t">
                        <FileText className="w-4 h-4 text-red-600 shrink-0" />PDF
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {p.outras.length > 0 && (
              <p className="px-4 pb-3 -mt-1 text-[11.5px] text-muted-foreground">
                Também aprovado neste mês: {p.outras.join(' · ')}.
              </p>
            )}

            {aberto && (
              <div className="border-t overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Colaborador</th>
                      <th className="px-3 py-2 font-semibold">Empresa</th>
                      <th className="px-3 py-2 font-semibold text-center">Dias</th>
                      <th className="px-3 py-2 font-semibold text-center">Faltas</th>
                      <th className="px-3 py-2 font-semibold text-center">VT</th>
                      <th className="px-3 py-2 font-semibold text-center">Sindical</th>
                      <th className="px-3 py-2 font-semibold text-right">Gorjeta</th>
                      <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Confiança</th>
                      <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Insal. 20%</th>
                      <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Quebra 15%</th>
                      <th className="px-3 py-2 font-semibold text-right">Salário</th>
                      <th className="px-3 py-2 font-semibold min-w-[160px]">Comentário</th>
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
                        {/* Só leitura: o mês está fechado. Editar comentário
                            continua no Fechamento de folha. */}
                        <td className="px-3 py-2 text-[12.5px] text-gray-600">
                          {l.comentario || <span className="text-gray-300">—</span>}
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
                        <td colSpan={13} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Nenhum colaborador neste filtro.
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
  )
}
