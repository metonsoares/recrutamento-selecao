'use client'
import { useState } from 'react'
import Link from 'next/link'
import {
  CheckCheck, Download, ChevronDown, ChevronRight, ExternalLink,
  FileSpreadsheet, FileText, CalendarCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { gerarPdfTabela } from '@/lib/pdf'
import { maiuscula, rotuloMes } from '@/lib/competencia'

export interface ItemAprovado {
  chave: string
  titulo: string
  valor: number
  /** Contagens do tipo, já em texto ("3 domingos · 2 feriados"). */
  resumo: string
  aprovado_por: string | null
  aprovado_em: string
  link: string
}

export interface PeriodoAprovado {
  competencia: string
  fechamento: {
    colaboradores: number
    total_dias: number
    total_faltas: number
    total_gorjeta: number
    total_salario: number
    aprovado_por: string | null
    aprovado_em: string
  } | null
  itens: ItemAprovado[]
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function AprovadasClient({ periodos }: { periodos: PeriodoAprovado[] }) {
  // O mês mais recente já abre: é o que se consulta na maior parte das vezes.
  const [abertos, setAbertos] = useState<Set<string>>(
    () => new Set(periodos.slice(0, 1).map(p => p.competencia)),
  )
  const [menu, setMenu] = useState<string | null>(null)

  const alternar = (c: string) => setAbertos(s => {
    const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n
  })

  const CABECALHO = ['Período', 'O que foi aprovado', 'Contagens', 'Valor', 'Aprovado por', 'Quando']

  function linhasDe(p: PeriodoAprovado): (string | number)[][] {
    const linhas: (string | number)[][] = []
    if (p.fechamento) {
      linhas.push([
        maiuscula(rotuloMes(p.competencia)), 'Fechamento de folha',
        `${p.fechamento.colaboradores} colaboradores · ${p.fechamento.total_dias} dias · ${p.fechamento.total_faltas} faltas`,
        p.fechamento.total_salario,
        p.fechamento.aprovado_por ?? '—', dataHora(p.fechamento.aprovado_em),
      ])
    }
    for (const i of p.itens) {
      linhas.push([
        maiuscula(rotuloMes(p.competencia)), i.titulo, i.resumo || '—',
        i.valor, i.aprovado_por ?? '—', dataHora(i.aprovado_em),
      ])
    }
    return linhas
  }

  async function exportarXlsx(alvo?: PeriodoAprovado) {
    setMenu(null)
    const lista = alvo ? [alvo] : periodos
    const corpo = lista.flatMap(linhasDe)
    const nome = alvo ? `folhas-aprovadas-${alvo.competencia.slice(0, 7)}` : 'folhas-aprovadas'
    baixarArquivo(await gerarXlsx([CABECALHO, ...corpo], 'Folhas aprovadas'), `${nome}.xlsx`)
  }

  async function exportarPdf(alvo?: PeriodoAprovado) {
    setMenu(null)
    const lista = alvo ? [alvo] : periodos
    const periodoTexto = alvo
      ? (() => { const [m, a] = maiuscula(rotuloMes(alvo.competencia)).split(' de '); return `${m} / ${a}` })()
      : `${lista.length} períodos`
    const blob = await gerarPdfTabela({
      titulo: 'Folhas aprovadas',
      subtitulo: periodoTexto,
      // No PDF a coluna de período sai quando é um mês só: repetir o mesmo
      // valor em toda linha rouba largura sem informar nada.
      cabecalho: alvo ? CABECALHO.slice(1) : CABECALHO,
      linhas: lista.flatMap(linhasDe).map(l => {
        const linha = alvo ? l.slice(1) : l
        return linha.map((c, i) => (typeof c === 'number' ? (c > 0 ? brl(c) : '—') : c))
      }),
      paisagem: true,
    })
    const nome = alvo ? `folhas-aprovadas-${alvo.competencia.slice(0, 7)}` : 'folhas-aprovadas'
    baixarArquivo(blob, `${nome}.pdf`)
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <CheckCheck className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold leading-tight">Folhas aprovadas</h1>
          <p className="text-sm text-muted-foreground">
            O que já foi fechado, por período. Só leitura — aprovar continua na tela de cada assunto.
          </p>
        </div>
        <div className="relative">
          <Button variant="outline" onClick={() => setMenu(m => (m === 'geral' ? null : 'geral'))}
            disabled={periodos.length === 0} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />Exportar tudo
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </Button>
          {menu === 'geral' && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
              <div className="absolute right-0 mt-1 z-20 w-52 rounded-xl border bg-white shadow-lg overflow-hidden">
                <button onClick={() => exportarXlsx()}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-gray-50">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Excel <span className="text-muted-foreground">(.xlsx)</span></span>
                </button>
                <button onClick={() => exportarPdf()}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-gray-50 border-t">
                  <FileText className="w-4 h-4 text-red-600 shrink-0" />
                  <span>PDF <span className="text-muted-foreground">(.pdf)</span></span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {periodos.length === 0 && (
        <div className="rounded-2xl border bg-white shadow-sm p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma folha aprovada ainda. Feche um mês em qualquer tela de Folha de pagamento
            que ele aparece aqui.
          </p>
        </div>
      )}

      {periodos.map(p => {
        const aberto = abertos.has(p.competencia)
        const total = (p.fechamento?.total_salario ?? 0)
          + p.itens.reduce((s, i) => s + i.valor, 0)
        return (
          <div key={p.competencia} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 p-4 flex-wrap">
              <button onClick={() => alternar(p.competencia)}
                className="flex items-center gap-2 flex-1 min-w-[200px] text-left">
                {aberto ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <CalendarCheck className="w-4 h-4 text-primary shrink-0" />
                <span className="font-bold text-gray-900">{maiuscula(rotuloMes(p.competencia))}</span>
                <span className="text-[12px] text-muted-foreground">
                  {p.itens.length + (p.fechamento ? 1 : 0)} aprovação(ões)
                </span>
                {p.fechamento && (
                  <span className="text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">
                    Folha fechada
                  </span>
                )}
              </button>
              <span className="text-[13px] font-semibold text-gray-900">{brl(total)}</span>
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

            {aberto && (
              <div className="border-t overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">O que foi aprovado</th>
                      <th className="px-3 py-2 font-semibold">Contagens</th>
                      <th className="px-3 py-2 font-semibold text-right">Valor</th>
                      <th className="px-3 py-2 font-semibold">Aprovado por</th>
                      <th className="px-3 py-2 font-semibold whitespace-nowrap">Quando</th>
                      <th className="px-3 py-2 w-px" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {p.fechamento && (
                      <tr className="bg-emerald-50/40">
                        <td className="px-3 py-2 font-semibold text-gray-900">Fechamento de folha</td>
                        <td className="px-3 py-2 text-gray-600">
                          {p.fechamento.colaboradores} colaboradores · {p.fechamento.total_dias} dias
                          {p.fechamento.total_faltas > 0 && <> · {p.fechamento.total_faltas} faltas</>}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{brl(p.fechamento.total_salario)}</td>
                        <td className="px-3 py-2 text-gray-600">{p.fechamento.aprovado_por ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500 text-[12px] whitespace-nowrap">{dataHora(p.fechamento.aprovado_em)}</td>
                        <td className="px-3 py-2 text-right">
                          <Link href={`/admin/folha-pagamento/fechamento?competencia=${p.competencia}`}
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline whitespace-nowrap">
                            Abrir<ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    )}
                    {p.itens.map(i => (
                      <tr key={i.chave} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-900">{i.titulo}</td>
                        <td className="px-3 py-2 text-gray-600">{i.resumo || '—'}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {i.valor > 0 ? brl(i.valor) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{i.aprovado_por ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500 text-[12px] whitespace-nowrap">{dataHora(i.aprovado_em)}</td>
                        <td className="px-3 py-2 text-right">
                          <Link href={i.link}
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline whitespace-nowrap">
                            Abrir<ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
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
