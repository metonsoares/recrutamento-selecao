'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, Download, ExternalLink,
  Check, Loader2, AlertCircle, CheckCircle2, History, Pencil, Trash2, Copy, Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName, contemBusca } from '@/lib/helpers'
import { gerarXlsx, baixarArquivo } from '@/lib/xlsx'
import { maiuscula, mesVizinho, rotuloMes } from '@/lib/competencia'
import type { ConfigLancamento } from '@/lib/folha-lancamentos'

export interface LinhaLancamento {
  candidate_id: string
  nome: string
  cpf: string | null
  cargo: string | null
  empresa_id: string | null
  empresa: string | null
  vinculo: 'contratado' | 'intermitente'
}

export interface EmpresaOpcao { id: string; nome: string }
export interface RegistroLancamento {
  candidate_id: string
  competencia: string
  quantidade: number
  valor: number
}
interface CicloAprovado { total_valor: number; total_qtd: number; aprovado_por: string | null }

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
/** "1.234,56" digitado → 1234.56 */
function paraNumero(v: string): number {
  if (!v) return 0
  return Number(v.replace(/\./g, '').replace(',', '.')) || 0
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
  // Sempre em branco ao abrir: preenchido de saída convida a aprovar sem conferir.
  const [padrao, setPadrao] = useState('')
  const [valores, setValores] = useState<Record<string, string>>({})
  const [quantidades, setQuantidades] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [historicoAberto, setHistoricoAberto] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<{ linha: LinhaLancamento; registro: RegistroLancamento; valor: string; quantidade: string } | null>(null)
  const [removendo, setRemovendo] = useState<{ linha: LinhaLancamento; registro: RegistroLancamento } | null>(null)

  const mostraValor = config.unidade === 'valor' || config.unidade === 'ambos'
  const mostraQtd = config.unidade === 'quantidade' || config.unidade === 'ambos'

  const valorDe = (l: LinhaLancamento) => paraNumero(valores[l.candidate_id] ?? '')
  const qtdDe = (l: LinhaLancamento) => paraNumero(quantidades[l.candidate_id] ?? '')
  const temLancamento = (l: LinhaLancamento) => valorDe(l) > 0 || qtdDe(l) > 0

  const historicoPorCand = useMemo(() => {
    const m = new Map<string, RegistroLancamento[]>()
    for (const h of historico) {
      const arr = m.get(h.candidate_id) ?? []
      arr.push(h)
      m.set(h.candidate_id, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => b.competencia.localeCompare(a.competencia))
    return m
  }, [historico])

  const aprovadosNoMes = useMemo(
    () => new Map(historico.filter(h => h.competencia === competencia).map(h => [h.candidate_id, h])),
    [historico, competencia],
  )

  // Mês novo: limpa antes de semear (este efeito vem ANTES do de baixo de
  // propósito — na ordem inversa apagaria o que acabou de ser semeado).
  useEffect(() => {
    setValores({}); setQuantidades({}); setErro(''); setOk('')
  }, [competencia])

  // Mostra o que já está aprovado, sem encostar no que foi digitado e ainda
  // não aprovado: router.refresh() reexecuta este efeito.
  useEffect(() => {
    setValores(atual => {
      const novo = { ...atual }
      for (const [id, r] of aprovadosNoMes) {
        if (novo[id] === undefined && r.valor > 0) novo[id] = String(r.valor).replace('.', ',')
      }
      return novo
    })
    setQuantidades(atual => {
      const novo = { ...atual }
      for (const [id, r] of aprovadosNoMes) {
        if (novo[id] === undefined && r.quantidade > 0) novo[id] = String(r.quantidade).replace('.', ',')
      }
      return novo
    })
  }, [aprovadosNoMes])

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
  const totalQtd = noEscopo.reduce((s, l) => s + qtdDe(l), 0)
  const nomeEmpresa = empresas.find(e => e.id === empresaFiltro)?.nome
  const baseNome = `${config.slug}-${competencia.slice(0, 7)}${nomeEmpresa ? '-' + nomeEmpresa.replace(/[^\w]+/g, '-') : ''}`

  const alternarHistorico = (id: string) => setHistoricoAberto(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  function aplicarATodos() {
    const texto = padrao.trim()
    if (!texto) return
    const alvo = mostraValor ? setValores : setQuantidades
    alvo(v => {
      const novo = { ...v }
      for (const l of filtradas) novo[l.candidate_id] = texto
      return novo
    })
    setOk(`Aplicado a ${filtradas.length} colaborador${filtradas.length !== 1 ? 'es' : ''}.`)
  }

  async function aprovar() {
    setSalvando(true); setErro(''); setOk('')
    try {
      const res = await fetch(`/api/admin/folha-pagamento/lancamentos/${config.slug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competencia,
          escopo_empresa: empresaFiltro || null,
          itens: noEscopo.map(l => ({
            candidate_id: l.candidate_id, nome: l.nome, cargo: l.cargo,
            empresa_id: l.empresa_id, empresa_nome: l.empresa,
            valor: valorDe(l), quantidade: qtdDe(l),
          })),
        }),
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

  async function chamar(metodo: 'PATCH' | 'DELETE', corpo: Record<string, unknown>, msg: string) {
    setProcessando(true); setErro('')
    try {
      const res = await fetch(`/api/admin/folha-pagamento/lancamentos/${config.slug}`, {
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

  const CABECALHO = [
    'Colaborador', 'Empresa', 'Cargo',
    ...(mostraQtd ? [config.rotuloQtd ?? 'Quantidade'] : []),
    ...(mostraValor ? ['Valor'] : []),
  ]

  async function exportar() {
    const corpo = filtradas.map(l => [
      formatName(l.nome), l.empresa ?? '—', l.cargo ?? '—',
      ...(mostraQtd ? [qtdDe(l)] : []),
      ...(mostraValor ? [valorDe(l)] : []),
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

      {cicloAprovado && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-[13px] text-emerald-900 flex-1">
            Mês <strong>registrado</strong>
            {mostraValor && <> — {brl(cicloAprovado.total_valor)}</>}
            {mostraQtd && <> · {cicloAprovado.total_qtd} {(config.rotuloQtd ?? '').toLowerCase()}</>}
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
        <div className="flex gap-2">
          <input value={padrao} onChange={e => setPadrao(e.target.value.replace(/[^\d,]/g, ''))}
            placeholder={mostraValor ? 'Valor p/ todos' : `${config.rotuloQtd ?? 'Qtd'} p/ todos`}
            inputMode="decimal"
            className="h-9 flex-1 min-w-0 border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
          <Button variant="outline" onClick={aplicarATodos} disabled={!padrao.trim() || filtradas.length === 0}
            className="gap-1.5 shrink-0" title="Aplicar aos listados">
            <Copy className="w-3.5 h-3.5" />Todos
          </Button>
        </div>
        <Button onClick={() => { setErro(''); setOk(''); setConfirmando(true) }}
          disabled={comLancamento === 0}
          title={comLancamento === 0 ? 'Preencha pelo menos um colaborador' : undefined}
          className="gap-1.5 w-full">
          <Check className="w-3.5 h-3.5" />Aprovar
        </Button>
      </div>

      {/* ── Resumo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Cartao titulo="Listados" valor={String(filtradas.length)} cor="text-gray-900" />
        <Cartao titulo="Com lançamento" valor={String(comLancamento)} cor="text-emerald-700" />
        {mostraValor
          ? <Cartao titulo="Total" valor={brl(totalValor)} cor="text-primary" />
          : <Cartao titulo={`Total de ${(config.rotuloQtd ?? 'itens').toLowerCase()}`} valor={String(totalQtd)} cor="text-primary" />}
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
                {mostraQtd && <th className="px-3 py-2 font-semibold whitespace-nowrap">{config.rotuloQtd ?? 'Quantidade'}</th>}
                {mostraValor && <th className="px-3 py-2 font-semibold">Valor</th>}
                <th className="px-3 py-2 w-px" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtradas.map(l => {
                const hist = historicoPorCand.get(l.candidate_id) ?? []
                const jaAprovado = aprovadosNoMes.get(l.candidate_id)
                return (
                  <tr key={l.candidate_id} className="hover:bg-gray-50">
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
                                    <strong className="text-emerald-700">
                                      {mostraValor ? brl(h.valor) : `${h.quantidade} ${(config.rotuloQtd ?? '').toLowerCase()}`}
                                    </strong>
                                  </span>
                                  <button
                                    onClick={() => setEditando({ linha: l, registro: h, valor: String(h.valor).replace('.', ','), quantidade: String(h.quantidade).replace('.', ',') })}
                                    title="Editar" className="p-1 text-gray-400 hover:text-primary hover:bg-gray-100 rounded">
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
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{l.empresa ?? '—'}</td>
                    {mostraQtd && (
                      <td className="px-3 py-2">
                        <input value={quantidades[l.candidate_id] ?? ''}
                          onChange={e => setQuantidades(q => ({ ...q, [l.candidate_id]: e.target.value.replace(/[^\d,]/g, '') }))}
                          placeholder="0" inputMode="decimal"
                          className="h-8 w-20 border border-gray-300 rounded-md px-2 text-[13px] bg-white text-center" />
                      </td>
                    )}
                    {mostraValor && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-gray-400">R$</span>
                          <input value={valores[l.candidate_id] ?? ''}
                            onChange={e => setValores(v => ({ ...v, [l.candidate_id]: e.target.value.replace(/[^\d,]/g, '') }))}
                            placeholder="0,00" inputMode="decimal"
                            className="h-8 w-24 border border-gray-300 rounded-md px-2 text-[13px] bg-white text-right" />
                          {jaAprovado && (
                            <span className="text-[11px] font-semibold text-emerald-700 whitespace-nowrap">✓</span>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
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
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
            {mostraValor && <> — total de <strong>{brl(totalValor)}</strong></>}.
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

      {/* ── Editar lançamento do histórico ── */}
      {editando && (
        <Modal titulo={`Editar ${maiuscula(rotuloMes(editando.registro.competencia))}`} onFechar={() => setEditando(null)}>
          <p className="text-[13px] text-gray-700">{formatName(editando.linha.nome)}</p>
          {mostraQtd && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600">{config.rotuloQtd ?? 'Quantidade'}</label>
              <input value={editando.quantidade}
                onChange={e => setEditando(v => v && ({ ...v, quantidade: e.target.value.replace(/[^\d,]/g, '') }))}
                inputMode="decimal" className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
            </div>
          )}
          {mostraValor && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600">Valor (R$)</label>
              <input value={editando.valor}
                onChange={e => setEditando(v => v && ({ ...v, valor: e.target.value.replace(/[^\d,]/g, '') }))}
                inputMode="decimal" className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditando(null)} disabled={processando}>Cancelar</Button>
            <Button disabled={processando} className="gap-1.5"
              onClick={() => chamar('PATCH', {
                competencia: editando.registro.competencia,
                candidate_id: editando.linha.candidate_id,
                valor: paraNumero(editando.valor),
                quantidade: paraNumero(editando.quantidade),
              }, 'Lançamento atualizado.')}>
              {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Salvar
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
            <Button disabled={processando} className="gap-1.5 bg-red-600 hover:bg-red-700"
              onClick={() => chamar('DELETE', {
                competencia: removendo.registro.competencia,
                candidate_id: removendo.linha.candidate_id,
              }, 'Lançamento removido.')}>
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
