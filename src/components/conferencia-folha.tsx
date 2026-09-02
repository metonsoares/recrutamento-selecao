'use client'
import { useState } from 'react'
import {
  FileSearch, Upload, Loader2, AlertCircle, CheckCircle2, X, UserMinus, UserPlus, Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatName } from '@/lib/helpers'
import { gerarPdfTabela } from '@/lib/pdf'
import { baixarArquivo } from '@/lib/xlsx'
import {
  lerFolhaContador, conferirFolha, Conferencia, LinhaNossa, LinhaPdf,
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
  empresa, competenciaRotulo, linhas,
}: {
  empresa: string
  /** "Agosto / 2026" — para avisar quando o período do PDF for outro. */
  competenciaRotulo: string
  linhas: LinhaNossa[]
}) {
  const [aberto, setAberto] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState('')
  const [arquivo, setArquivo] = useState('')
  const [conf, setConf] = useState<Conferencia | null>(null)

  async function lerPdf(file: File) {
    setLendo(true); setErro(''); setConf(null); setArquivo(file.name)
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

      const folha = lerFolhaContador(paginas)
      if (folha.funcionarios.length === 0) {
        throw new Error('Não reconheci nenhum funcionário neste PDF. Ele é a folha de pagamento do contador?')
      }
      setConf(conferirFolha(linhas, folha))
    } catch (e) {
      setErro((e as Error).message || 'Não consegui ler o arquivo.')
    } finally {
      setLendo(false)
    }
  }

  async function exportarRelatorio() {
    if (!conf) return
    const corpo = conf.pessoas.flatMap(p =>
      p.divergencias.length
        ? p.divergencias.map(d => [formatName(p.nome), d.campo, d.nosso, d.contador])
        : [[formatName(p.nome), 'Sem divergência', '', '']],
    )
    const blob = await gerarPdfTabela({
      titulo: `Conferência de folha — ${empresa}`,
      subtitulo: `${competenciaRotulo}${conf.periodo ? ` · PDF do contador: ${conf.periodo}` : ''} · `
        + `${conf.totalDivergencias} divergência(s) em ${conf.conferidos} conferidos`,
      cabecalho: ['Colaborador', 'Campo', 'Nossa folha', 'Folha do contador'],
      linhas: corpo,
      alinhamentos: ['left', 'left', 'center', 'center'],
      paisagem: true,
    })
    baixarArquivo(blob, `conferencia-${empresa.replace(/[^\p{L}\p{N}]+/gu, '-')}.pdf`)
  }

  function fechar() {
    setAberto(false); setConf(null); setErro(''); setArquivo('')
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)} className="gap-1.5">
        <FileSearch className="w-3.5 h-3.5" />Conferência de folha
      </Button>

      {aberto && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
          onClick={fechar}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8" onClick={e => e.stopPropagation()}>
            {/* ── Cabeçalho ── */}
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
              {/* ── Upload ── */}
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

              {conf && <Relatorio conf={conf} competenciaRotulo={competenciaRotulo} onExportar={exportarRelatorio} />}
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
  conf, competenciaRotulo, onExportar,
}: {
  conf: Conferencia
  competenciaRotulo: string
  onExportar: () => void
}) {
  const limpo = conf.totalDivergencias === 0
  // O PDF do contador traz o período dele; se for outro mês, tudo o mais é ruído.
  const mesDiferente = conf.periodo && !periodoBate(conf.periodo, competenciaRotulo)

  return (
    <div className="space-y-4">
      {mesDiferente && (
        <p className="text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          O PDF é do período <strong>{conf.periodo}</strong>, e esta folha é de <strong>{competenciaRotulo}</strong>.
          Confira se é o arquivo certo antes de considerar as diferenças.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Cartao titulo="Conferidos" valor={String(conf.conferidos)} cor="text-gray-900" />
        <Cartao titulo="Divergências" valor={String(conf.totalDivergencias)}
          cor={limpo ? 'text-emerald-700' : 'text-red-600'} />
        <Cartao titulo="Só na nossa folha" valor={String(conf.soNosso)} cor={conf.soNosso ? 'text-amber-700' : 'text-gray-900'} />
        <Cartao titulo="Só na do contador" valor={String(conf.soContador)} cor={conf.soContador ? 'text-amber-700' : 'text-gray-900'} />
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

      {limpo && conf.soNosso === 0 && conf.soContador === 0 ? (
        <p className="text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-1.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
          Tudo bateu: mesmas pessoas, mesmos salários e mesmos lançamentos.
        </p>
      ) : (
        <div className="space-y-2">
          {conf.pessoas.filter(p => p.divergencias.length > 0).map(p => (
            <div key={p.nome} className="rounded-xl border p-3">
              <div className="flex items-center gap-2 flex-wrap">
                {p.situacao === 'so_nosso' && <UserMinus className="w-4 h-4 text-amber-600" />}
                {p.situacao === 'so_contador' && <UserPlus className="w-4 h-4 text-amber-600" />}
                {p.situacao === 'divergente' && <AlertCircle className="w-4 h-4 text-red-600" />}
                <span className="font-semibold text-gray-900">{formatName(p.nome)}</span>
                {p.codigoContador && (
                  <span className="text-[11px] text-muted-foreground">nº {p.codigoContador} na folha do contador</span>
                )}
              </div>
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
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="outline" onClick={onExportar} className="gap-1.5">
          <Download className="w-3.5 h-3.5" />Exportar relatório
        </Button>
      </div>
    </div>
  )
}

/** "01/08/2026 a 31/08/2026" bate com "Agosto / 2026"? */
function periodoBate(periodo: string, competenciaRotulo: string): boolean {
  const m = periodo.match(/(\d{2})\/(\d{4})/)
  if (!m) return true
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  const alvo = `${meses[Number(m[1]) - 1]} / ${m[2]}`
  return competenciaRotulo.toLowerCase().replace(/\s+/g, ' ').includes(alvo)
}

function Cartao({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={`text-xl font-bold ${cor}`}>{valor}</p>
    </div>
  )
}
