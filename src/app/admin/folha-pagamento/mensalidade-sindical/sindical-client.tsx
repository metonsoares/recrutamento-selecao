'use client'
import { useState } from 'react'
import Link from 'next/link'
import {
  Landmark, Search, CheckCircle2, XCircle, HelpCircle, ExternalLink, Download,
  ChevronLeft, ChevronRight, ChevronDown, FileSpreadsheet, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { gerarPdfTabela } from '@/lib/pdf'
import { MESES, mesVizinho, rotuloMes } from '@/lib/competencia'

export interface LinhaSindical {
  candidate_id: string
  nome: string
  cpf: string | null
  cargo: string | null
  empresa_id: string | null
  empresa: string | null
  vinculo: 'contratado' | 'intermitente'
  /** null = a ficha ainda não respondeu */
  paga: boolean | null
  admissao: string | null
}

export interface EmpresaOpcao { id: string; nome: string }

/** Padrão: só quem paga, conforme a ficha. */
type Situacao = 'paga' | 'nao_paga' | 'sem_info' | 'todos'



export function SindicalClient({
  competencia, linhas, empresas,
}: {
  competencia: string
  linhas: LinhaSindical[]
  empresas: EmpresaOpcao[]
}) {
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [situacao, setSituacao] = useState<Situacao>('paga')
  const [menuExportar, setMenuExportar] = useState(false)

  const filtradas = linhas.filter(l => {
    if (situacao === 'paga' && l.paga !== true) return false
    if (situacao === 'nao_paga' && l.paga !== false) return false
    if (situacao === 'sem_info' && l.paga !== null) return false
    if (empresaFiltro && l.empresa_id !== empresaFiltro) return false
    const termo = busca.trim()
    if (!termo) return true
    const digitos = termo.replace(/\D/g, '')
    if (digitos.length >= 3 && (l.cpf ?? '').includes(digitos)) return true
    return `${l.nome} ${l.cargo ?? ''}`.toLowerCase().includes(termo.toLowerCase())
  })

  const pagam = linhas.filter(l => l.paga === true).length
  const naoPagam = linhas.filter(l => l.paga === false).length
  const semInfo = linhas.filter(l => l.paga === null).length
  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome
  const baseNome = `mensalidade-sindical-${competencia.slice(0, 7)}${nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''}`

  const CABECALHO = ['Colaborador', 'CPF', 'Empresa', 'Cargo', 'Mensalidade sindical']
  const corpo = () => filtradas.map(l => [
    formatName(l.nome), l.cpf ?? '', l.empresa ?? '—', l.cargo ?? '—',
    l.paga === true ? 'Paga' : l.paga === false ? 'Não paga' : 'Não informado',
  ])

  async function exportarXlsx() {
    setMenuExportar(false)
    baixarArquivo(await gerarXlsx([CABECALHO, ...corpo()], 'Mensalidade sindical'), `${baseNome}.xlsx`)
  }

  async function exportarPdf() {
    setMenuExportar(false)
    const blob = await gerarPdfTabela({
      titulo: 'Mensalidade sindical',
      subtitulo: `${rotuloMes(competencia)} · ${nomeEmpresa ?? 'Todas as empresas'} · ${filtradas.length} colaboradores`,
      cabecalho: CABECALHO,
      linhas: corpo(),
      paisagem: true,
    })
    baixarArquivo(blob, `${baseNome}.pdf`)
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold leading-tight">Mensalidade sindical</h1>
          <p className="text-sm text-muted-foreground">
            {rotuloMes(competencia)} — {pagam} colaborador{pagam !== 1 ? 'es' : ''} com desconto na ficha
          </p>
        </div>

        {/* Navegador de mês: o período fica escrito entre as setas. */}
        <div className="inline-flex items-center rounded-lg border bg-white overflow-hidden">
          <Link href={`?competencia=${mesVizinho(competencia, -1)}`} scroll={false}
            className="p-2 hover:bg-gray-50" title="Mês anterior">
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </Link>
          <span className="px-3 text-[13px] font-semibold text-gray-800 border-x whitespace-nowrap">
            {rotuloMes(competencia)}
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

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        <select value={situacao} onChange={e => setSituacao(e.target.value as Situacao)}
          className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white">
          <option value="paga">Só quem paga</option>
          <option value="nao_paga">Só quem não paga</option>
          <option value="sem_info">Só sem informação na ficha</option>
          <option value="todos">Todos os colaboradores</option>
        </select>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Cartao titulo="Listados" valor={String(filtradas.length)} cor="text-gray-900" />
        <Cartao titulo="Pagam" valor={String(pagam)} cor="text-blue-700" />
        <Cartao titulo="Não pagam" valor={String(naoPagam)} cor="text-gray-500" />
        <Cartao titulo="Sem informação" valor={String(semInfo)} cor="text-amber-600" />
      </div>

      {/* Lista */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Colaborador</th>
                <th className="px-4 py-2.5 font-semibold">Empresa</th>
                <th className="px-4 py-2.5 font-semibold">Mensalidade sindical</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtradas.map(l => (
                <tr key={l.candidate_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="font-medium text-gray-900">{formatName(l.nome)}</span>
                    {l.vinculo === 'intermitente' && (
                      <span className="ml-2 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-sky-100 text-sky-700 align-middle">
                        Intermitente
                      </span>
                    )}
                    {l.cargo && <span className="block text-[11px] text-muted-foreground">{l.cargo}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{l.empresa ?? '—'}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {l.paga === true ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-blue-100 text-blue-700">
                        <CheckCircle2 className="w-3 h-3" />Paga
                      </span>
                    ) : l.paga === false ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-gray-100 text-gray-600">
                        <XCircle className="w-3 h-3" />Não paga
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-700"
                        title="A ficha do colaborador ainda não informa">
                        <HelpCircle className="w-3 h-3" />Não informado
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
              ))}
              {filtradas.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  {situacao === 'paga'
                    ? `Nenhum colaborador com mensalidade sindical em ${rotuloMes(competencia).toLowerCase()}.`
                    : 'Nenhum colaborador encontrado.'}
                </td></tr>
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
    <div className="rounded-xl border bg-white p-3.5 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{titulo}</p>
      <p className={`text-2xl font-bold ${cor} mt-0.5`}>{valor}</p>
    </div>
  )
}
