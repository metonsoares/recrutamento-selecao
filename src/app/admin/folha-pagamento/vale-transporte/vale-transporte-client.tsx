'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Bus, Search, CheckCircle2, XCircle, HelpCircle, ExternalLink, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'

export interface LinhaVT {
  candidate_id: string
  nome: string
  cargo: string | null
  empresa_id: string | null
  empresa: string | null
  vinculo: 'contratado' | 'intermitente'
  /** null = a ficha ainda não informa */
  recebe: boolean | null
  empresa_transporte: string | null
  passagens: string | null
}

export interface EmpresaOpcao { id: string; nome: string }

type Filtro = 'todos' | 'recebe' | 'nao' | 'sem_info'

export function ValeTransporteClient({
  linhas, empresas,
}: {
  linhas: LinhaVT[]
  empresas: EmpresaOpcao[]
}) {
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [situacao, setSituacao] = useState<Filtro>('todos')

  const filtradas = linhas.filter(l => {
    if (empresaFiltro && l.empresa_id !== empresaFiltro) return false
    if (situacao === 'recebe' && l.recebe !== true) return false
    if (situacao === 'nao' && l.recebe !== false) return false
    if (situacao === 'sem_info' && l.recebe !== null) return false
    if (!busca.trim()) return true
    const t = `${l.nome} ${l.cargo ?? ''}`.toLowerCase()
    return t.includes(busca.trim().toLowerCase())
  })

  const recebem = filtradas.filter(l => l.recebe === true).length
  const naoRecebem = filtradas.filter(l => l.recebe === false).length
  const semInfo = filtradas.filter(l => l.recebe === null).length
  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome

  function exportar() {
    const cabecalho = ['Funcionário', 'Empresa', 'Vínculo', 'Vale transporte', 'Empresa de transporte', 'Passagens/dia']
    const corpo = filtradas.map(l => [
      formatName(l.nome),
      l.empresa ?? '—',
      l.vinculo === 'intermitente' ? 'Intermitente' : 'Contratado',
      l.recebe === true ? 'Sim' : l.recebe === false ? 'Não' : 'Não informado',
      l.empresa_transporte ?? '',
      l.passagens ?? '',
    ])
    const nome = `vale-transporte${nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''}.xlsx`
    baixarArquivo(gerarXlsx([cabecalho, ...corpo], 'Vale transporte'), nome)
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
            Contratados e intermitentes — a informação vem da ficha do colaborador.
          </p>
        </div>
        <Button variant="outline" onClick={exportar} disabled={filtradas.length === 0} className="gap-1.5">
          <Download className="w-3.5 h-3.5" />Exportar
        </Button>
      </div>

      {/* ── Filtros ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou cargo…"
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
      </div>

      {/* ── Resumo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Cartao titulo="Listados" valor={String(filtradas.length)} cor="text-gray-900" />
        <Cartao titulo="Recebem" valor={String(recebem)} cor="text-emerald-700" />
        <Cartao titulo="Não recebem" valor={String(naoRecebem)} cor="text-gray-500" />
        <Cartao titulo="Sem informação" valor={String(semInfo)} cor="text-amber-600" />
      </div>

      {/* ── Lista ── */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Colaborador</th>
                <th className="px-4 py-2.5 font-semibold">Empresa</th>
                <th className="px-4 py-2.5 font-semibold">Vale transporte</th>
                <th className="px-4 py-2.5 font-semibold hidden lg:table-cell">Transporte</th>
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
                    {l.recebe === true ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />Recebe
                      </span>
                    ) : l.recebe === false ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500">
                        <XCircle className="w-3.5 h-3.5" />Não recebe
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-600"
                        title="A ficha do colaborador ainda não informa">
                        <HelpCircle className="w-3.5 h-3.5" />Não informado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 hidden lg:table-cell whitespace-nowrap">
                    {l.recebe === true && (l.empresa_transporte || l.passagens)
                      ? [l.empresa_transporte, l.passagens ? `${l.passagens} passagem(ns)/dia` : null].filter(Boolean).join(' · ')
                      : '—'}
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
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nenhum colaborador encontrado.</td></tr>
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
