'use client'
import { useMemo, useState } from 'react'
import {
  FileSearch, Upload, Loader2, AlertCircle, CheckCircle2, X, UserMinus, UserPlus,
  Download, HelpCircle, CalendarCheck, CalendarX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName } from '@/lib/helpers'
import { gerarPdfTabela } from '@/lib/pdf'
import { baixarArquivo } from '@/lib/xlsx'
import {
  lerFolhaContador, conferirFolha, Conferencia, FolhaContador, LinhaNossa, LinhaPdf,
} from '@/lib/folha-contador'

/**
 * Conferência da folha: sobe o PDF que o contador devolveu e compara com o que
 * foi aprovado aqui.
 *
 * O arquivo é lido NO NAVEGADOR e não sai da máquina: é uma folha de pagamento
 * inteira (salário de todo mundo), e guardá-la no servidor criaria um acervo de
 * PII que ninguém pediu. O relatório é o resultado, não o arquivo.
 */
export function ConferenciaFolha({
  empresa, competencia, competenciaRotulo, linhas,
}: {
  empresa: string
  /** 'AAAA-MM-01' — usada para validar o período impresso no PDF. */
  competencia: string
  /** "Agosto / 2026" — como se lê na tela. */
  competenciaRotulo: string
  linhas: LinhaNossa[]
}) {
  const [aberto, setAberto] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState('')
  const [arquivo, setArquivo] = useState('')
  const [folha, setFolha] = useState<FolhaContador | null>(null)
  /** Pares que a pessoa confirmou serem o mesmo colaborador. */
  const [vinculos, setVinculos] = useState<Record<string, string>>({})
  /** Pares que ela recusou — não perguntamos de novo. */
  const [recusados, setRecusados] = useState<string[]>([])

  // Recalcula a cada confirmação: quem era "ausente dos dois lados" vira uma
  // pessoa conferida de verdade, com os valores comparados.
  const conf: Conferencia | null = useMemo(
    () => (folha ? conferirFolha(linhas, folha, { competencia, vinculos }) : null),
    [folha, linhas, competencia, vinculos],
  )

  async function lerPdf(file: File) {
    setLendo(true); setErro(''); setFolha(null); setVinculos({}); setRecusados([]); setArquivo(file.name)
    try {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url,
      ).toString()

      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
      const paginas: LinhaPdf[] = []
      for (let p = 1; p <= doc.numPages; p++) {
        const conteudo = await (await doc.getPage(p)).getTextContent()
        // Agrupa por Y (a linha) guardando o X — é o X que diz se o número
        // está na coluna de proventos ou na de descontos.
        const porY = new Map<number, { x: number; s: string }[]>()
        for (const item of conteudo.items) {
          const t = item as { str?: string; transform?: number[] }
          if (!t.str?.trim() || !t.transform) continue
          const y = Math.round(t.transform[5])
          if (!porY.has(y)) porY.set(y, [])
          porY.get(y)!.push({ x: Math.round(t.transform[4]), s: t.str })
        }
        for (const y of [...porY.keys()].sort((a, b) => b - a)) {
          paginas.push({ itens: porY.get(y)!.sort((a, b) => a.x - b.x) })
        }
      }

      const lida = lerFolhaContador(paginas)
      if (lida.funcionarios.length === 0) {
        throw new Error('Não reconheci nenhum funcionário neste PDF. Ele é a folha de pagamento do contador?')
      }
      setFolha(lida)
    } catch (e) {
      setErro((e as Error).message || 'Não consegui ler o arquivo.')
    } finally {
      setLendo(false)
    }
  }

  async function exportarRelatorio() {
    if (!conf) return
    const corpo = conf.pessoas.flatMap(p => {
      const linhasPessoa: (string | number)[][] = p.divergencias.map(
        d => [formatName(p.nome), d.campo, d.nosso, d.contador],
      )
      // O item que só o contador tem também vai para o relatório.
      for (const r of p.rubricasSemPar ?? []) {
        linhasPessoa.push([formatName(p.nome), 'Só na folha do contador', '—', `${r.descricao} ${brl(r.valor)}`])
      }
      return linhasPessoa.length
        ? linhasPessoa
        : [[formatName(p.nome), 'Conferido — sem divergência', '', '']]
    })
    const blob = await gerarPdfTabela({
      titulo: `Conferência de folha — ${empresa}`,
      subtitulo: `${competenciaRotulo}${conf.periodo.encontrado ? ` · PDF do contador: ${conf.periodo.encontrado}` : ''} · `
        + `${conf.totalDivergencias} divergência(s) em ${conf.conferidos} conferidos`,
      cabecalho: ['Colaborador', 'Campo', 'Nossa folha', 'Folha do contador'],
      linhas: corpo,
      alinhamentos: ['left', 'left', 'center', 'center'],
      paisagem: true,
    })
    baixarArquivo(blob, `conferencia-${empresa.replace(/[^\p{L}\p{N}]+/gu, '-')}.pdf`)
  }

  function fechar() {
    setAberto(false); setFolha(null); setErro(''); setArquivo(''); setVinculos({}); setRecusados([])
  }

  const pendentes = (conf?.sugestoes ?? []).filter(s => !recusados.includes(`${s.nosso}|${s.contador}`))

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)} className="gap-1.5">
        <FileSearch className="w-3.5 h-3.5" />Conferência de folha
      </Button>

      {aberto && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
          onClick={fechar}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 p-5 border-b">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <FileSearch className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold leading-tight">Conferência de folha</h2>
                <p className="text-[13px] text-muted-foreground">
                  {empresa} · {competenciaRotulo} — suba o PDF da folha que o contador devolveu e
                  eu comparo com o que foi aprovado aqui.
                </p>
              </div>
              <button onClick={fechar} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <label className={`flex items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                lendo ? 'border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-primary hover:bg-primary/5'
              }`}>
                <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={lendo}
                  onChange={e => { const f = e.target.files?.[0]; if (f) lerPdf(f); e.target.value = '' }} />
                {lendo ? (
                  <><Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-500">Lendo {arquivo}…</span></>
                ) : (
                  <div className="text-center">
                    <Upload className="w-5 h-5 text-gray-400 mx-auto" />
                    <p className="text-sm font-medium text-gray-700 mt-1">
                      {arquivo || 'Escolher o PDF da folha do contador'}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">
                      O arquivo é lido aqui no navegador — não sobe para o servidor.
                    </p>
                  </div>
                )}
              </label>

              {erro && (
                <p className="text-[13px] text-red-600 flex items-start gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />{erro}
                </p>
              )}

              {conf && (
                <Relatorio
                  conf={conf}
                  competenciaRotulo={competenciaRotulo}
                  pendentes={pendentes}
                  onConfirmar={(nosso, contador) => setVinculos(v => ({ ...v, [nosso]: contador }))}
                  onRecusar={(nosso, contador) => setRecusados(r => [...r, `${nosso}|${contador}`])}
                  onExportar={exportarRelatorio}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function Relatorio({
  conf, competenciaRotulo, pendentes, onConfirmar, onRecusar, onExportar,
}: {
  conf: Conferencia
  competenciaRotulo: string
  pendentes: Conferencia['sugestoes']
  onConfirmar: (nosso: string, contador: string) => void
  onRecusar: (nosso: string, contador: string) => void
  onExportar: () => void
}) {
  const limpo = conf.totalDivergencias === 0
  const periodoOk = conf.periodo.confere === true
  // Rubricas que existem só do lado do contador, somadas em todo mundo.
  const extras = conf.pessoas.reduce((s, p) => s + (p.rubricasSemPar?.length ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* ── Validação do período: primeira coisa a olhar ── */}
      <div className={`rounded-xl border p-3 flex items-start gap-2 ${
        periodoOk ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'
      }`}>
        {periodoOk
          ? <CalendarCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          : <CalendarX className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
        <div className="text-[13px] flex-1">
          <p className={periodoOk ? 'text-emerald-900' : 'text-amber-900'}>
            <strong>Período</strong>{' — '}
            {conf.periodo.encontrado
              ? <>o PDF é de <strong>{conf.periodo.encontrado}</strong> e esta folha é de <strong>{competenciaRotulo}</strong>.</>
              : <>não achei o período impresso no PDF; confira se é o arquivo do mês certo.</>}
          </p>
          {conf.periodo.confere === false && (
            <p className="text-amber-900 font-semibold mt-0.5">
              Meses diferentes — as diferenças abaixo provavelmente são só isso.
            </p>
          )}
        </div>
        {periodoOk && <span className="text-[11px] font-bold text-emerald-700 uppercase">confere</span>}
      </div>

      {/* ── Nomes parecidos: a máquina não decide isso sozinha ── */}
      {pendentes.map(s => (
        <div key={`${s.nosso}|${s.contador}`} className="rounded-xl border border-sky-200 bg-sky-50 p-3">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-[13px] text-sky-900">
              <p>
                <strong>{formatName(s.nosso)}</strong> (nossa folha) e{' '}
                <strong>{formatName(s.contador)}</strong> (nº {s.codigoContador} na do contador)
                {' '}são a mesma pessoa?
              </p>
              <p className="text-[11.5px] text-sky-700">{s.motivo}</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" onClick={() => onConfirmar(s.nosso, s.contador)} className="gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />É a mesma
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRecusar(s.nosso, s.contador)}>
                São diferentes
              </Button>
            </div>
          </div>
        </div>
      ))}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Cartao titulo="Conferidos" valor={String(conf.conferidos)} cor="text-gray-900" />
        <Cartao titulo="Divergências" valor={String(conf.totalDivergencias)}
          cor={limpo ? 'text-emerald-700' : 'text-red-600'} />
        <Cartao titulo="Só na nossa folha" valor={String(conf.soNosso)} cor={conf.soNosso ? 'text-amber-700' : 'text-gray-900'} />
        <Cartao titulo="Só na do contador" valor={String(conf.soContador)} cor={conf.soContador ? 'text-amber-700' : 'text-gray-900'} />
        <Cartao titulo="Itens extras" valor={String(extras)} cor={extras ? 'text-amber-700' : 'text-gray-900'} />
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="text-left text-[11px] uppercase text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Total</th>
              <th className="px-3 py-2 font-semibold text-center">Nossa folha</th>
              <th className="px-3 py-2 font-semibold text-center">Folha do contador</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {conf.totais.map(t => {
              const bate = Math.abs(t.nosso - t.contador) < 0.02
              const mostrar = (v: number) => (t.rotulo === 'Colaboradores' ? String(v) : brl(v))
              return (
                <tr key={t.rotulo} className={bate ? '' : 'bg-red-50/60'}>
                  <td className="px-3 py-2 font-medium text-gray-700">{t.rotulo}</td>
                  <td className="px-3 py-2 text-center">{mostrar(t.nosso)}</td>
                  <td className={`px-3 py-2 text-center ${bate ? '' : 'font-semibold text-red-700'}`}>
                    {mostrar(t.contador)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Colaborador a colaborador: quem bateu leva o ✓ ── */}
      <div className="space-y-2">
        {conf.pessoas.map(p => (
          <div key={p.nome} className={`rounded-xl border p-3 ${
            p.situacao === 'ok' && p.rubricasSemPar?.length ? 'border-amber-300 bg-amber-50/50'
              : p.situacao === 'ok' ? 'border-emerald-200 bg-emerald-50/40' : ''
          }`}>
            <div className="flex items-center gap-2 flex-wrap">
              {p.situacao === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {p.situacao === 'divergente' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
              {p.situacao === 'so_nosso' && <UserMinus className="w-4 h-4 text-amber-600 shrink-0" />}
              {p.situacao === 'so_contador' && <UserPlus className="w-4 h-4 text-amber-600 shrink-0" />}
              <span className="font-semibold text-gray-900">{formatName(p.nome)}</span>
              {p.codigoContador && (
                <span className="text-[11px] text-muted-foreground">nº {p.codigoContador} na folha do contador</span>
              )}
              {p.situacao === 'ok' && (
                <span className={`ml-auto text-[11px] font-bold uppercase ${
                  p.rubricasSemPar?.length ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  {p.rubricasSemPar?.length ? 'Confere · com item extra' : 'Confere'}
                </span>
              )}
            </div>
            {p.rubricasSemPar && p.rubricasSemPar.length > 0 && (
              /* Amarelo: existe na folha do contador e não tem par aqui. Pode
                 ser rubrica legítima (contribuição assistencial) ou um nome de
                 rubrica que ainda não conhecemos — os dois pedem uma olhada. */
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
                <p className="text-[11px] font-bold uppercase text-amber-800">Só na folha do contador</p>
                <ul className="mt-1 space-y-0.5">
                  {p.rubricasSemPar.map((r, i) => (
                    <li key={i} className="text-[12.5px] text-amber-900 flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold">{r.descricao}</span>
                      <span>{brl(r.valor)}</span>
                      <span className="text-[11px] text-amber-700">
                        {r.tipo === 'desconto' ? 'desconto' : 'provento'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {p.divergencias.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {p.divergencias.map((d, i) => (
                  <li key={i} className="text-[13px] flex flex-wrap items-baseline gap-x-2">
                    <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
                      d.gravidade === 'alta' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                    }`}>{d.campo}</span>
                    <span className="text-gray-500">aqui:</span>
                    <span className="font-medium text-gray-900">{d.nosso}</span>
                    <span className="text-gray-500">· contador:</span>
                    <span className="font-medium text-gray-900">{d.contador}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onExportar} className="gap-1.5">
          <Download className="w-3.5 h-3.5" />Exportar relatório
        </Button>
      </div>
    </div>
  )
}

function Cartao({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={`text-xl font-bold ${cor}`}>{valor}</p>
    </div>
  )
}
