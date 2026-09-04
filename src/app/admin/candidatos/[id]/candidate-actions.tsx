'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { STATUS_LABELS, CandidateStatus, BackgroundCheckResult, AuxiliosCheckResult, Mind7CheckResult } from '@/types'
import { Brain, FlaskConical, Eye, Loader2, CheckCircle2, AlertCircle, ShieldCheck, ShieldAlert, Shield, Globe, RefreshCw, UserMinus, HandCoins, Briefcase, Copy, ExternalLink, Trash2 } from 'lucide-react'
import { formatDateTime } from '@/lib/helpers'

// Status disponíveis no seletor (ordem definida)
const ALLOWED_STATUSES: CandidateStatus[] = [
  'novo', 'apto_para_entrevista', 'entrevista_agendada',
  'aprovado_processo', 'contratado',
  'aprovado', 'em_contrato', 'freelancer', 'reprovado', 'desligado',
]
// Sobrescreve rótulos só neste seletor
const STATUS_LABEL_OVERRIDE: Partial<Record<CandidateStatus, string>> = {
  novo: 'Novo currículo',
  aprovado: 'Intermitente',
}
function statusOptionLabel(s: CandidateStatus) { return STATUS_LABEL_OVERRIDE[s] || STATUS_LABELS[s] }

// ─── Toast simples ────────────────────────────────────────────────────────────

function Toast({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div className={[
      'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm',
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
    ].join(' ')}>
      {type === 'success'
        ? <CheckCircle2 className="w-4 h-4 shrink-0" />
        : <AlertCircle className="w-4 h-4 shrink-0" />
      }
      {message}
    </div>
  )
}

// ─── Modal: Check Mind7 (linha do tempo de vínculos de emprego) ────────────────

/** "2019-03-15" ou "2019-03" → "15/03/2019" / "03/2019". Sem inventar o dia. */
function mesOuData(v?: string): string {
  if (!v) return ''
  const m = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/)
  if (!m) return v
  return m[3] ? `${m[3]}/${m[2]}/${m[1]}` : `${m[2]}/${m[1]}`
}

const MIND7_CONSULTA = 'https://www.mind-7.org/painel/consultas/emprego/'

/** "31127244000163" → "31.127.244/0001-63" */
function cnpjMascara(v: string): string {
  return v.length === 14
    ? v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    : v
}

function Mind7CheckModal({
  open, onClose, result, checkedAt, candidateId, candidateCpf, onRefresh,
}: {
  open: boolean
  onClose: () => void
  result: Mind7CheckResult | null
  checkedAt: string | null
  candidateId: string
  candidateCpf: string | null
  onRefresh: (r: Mind7CheckResult | null, at: string | null) => void
}) {
  const [texto, setTexto] = useState('')
  const [lendo, setLendo] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  // Com resultado guardado, o formulário fica recolhido até pedirem nova consulta.
  const [colando, setColando] = useState(false)

  const cpfNumeros = candidateCpf?.replace(/\D/g, '') ?? ''
  const cpfFormatado = cpfNumeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')

  async function copiarCpf() {
    try {
      await navigator.clipboard.writeText(cpfNumeros)
      setCopiado(true); setTimeout(() => setCopiado(false), 2000)
    } catch { setErr('Não consegui copiar — selecione o CPF acima e copie na mão.') }
  }

  async function enviar() {
    setLendo(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/mind7-check`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data?.error || `Erro ${res.status}`); return }
      onRefresh(data.result as Mind7CheckResult, data.checkedAt as string)
      setTexto(''); setColando(false)
    } catch {
      setErr('Erro de conexão. Tente novamente.')
    } finally { setLendo(false) }
  }

  async function apagar() {
    setLendo(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/mind7-check`, { method: 'DELETE' })
      if (!res.ok) { setErr('Não consegui apagar a consulta.'); return }
      onRefresh(null, null); setColando(true)
    } finally { setLendo(false) }
  }

  // O relatório pode ser de outra pessoa (CPF digitado errado no painel).
  const cpfDivergente = !!result?.cpf_consultado && !!cpfNumeros && result.cpf_consultado !== cpfNumeros
  const mostrarFormulario = colando || !result

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Briefcase className="w-5 h-5 text-indigo-600 shrink-0" />
            Check Mind7 — vínculos de emprego
          </DialogTitle>
          {cpfNumeros && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Consulta de emprego · CPF: <span className="font-mono font-semibold text-gray-700">{cpfFormatado}</span>
            </p>
          )}
        </DialogHeader>

        {checkedAt && (
          <div className="px-6 py-3 border-b bg-gray-50 flex items-center justify-between gap-3 shrink-0 flex-wrap">
            <span className="text-xs text-muted-foreground">Última consulta: {formatDateTime(checkedAt)}</span>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setColando(v => !v)} disabled={lendo} className="gap-1.5">
                <RefreshCw className="w-4 h-4" />Nova consulta
              </Button>
              <Button size="sm" variant="outline" onClick={apagar} disabled={lendo}
                className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50">
                <Trash2 className="w-4 h-4" />Apagar
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4 [word-break:break-word]">
          {err && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{err}</div>}

          {!cpfNumeros && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              Este candidato não tem CPF cadastrado — a consulta do Mind7 é por CPF.
            </div>
          )}

          {mostrarFormulario && cpfNumeros && (
            /* A consulta sai do NAVEGADOR: o painel do Mind7 fica atrás do desafio
               da Cloudflare e recusa login feito pelo servidor (medido na
               integração). Então o passo a passo é explícito, e aqui a gente
               transforma o relatório em linha do tempo. */
            <div className="space-y-3">
              <ol className="space-y-2.5">
                <li className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">Copie o CPF e abra a consulta de emprego no Mind7 (você já logado).</p>
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      <Button size="sm" variant="outline" onClick={copiarCpf} className="gap-1.5">
                        {copiado ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" />CPF copiado</> : <><Copy className="w-4 h-4" />Copiar CPF</>}
                      </Button>
                      <a href={MIND7_CONSULTA} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium border border-indigo-300 text-indigo-700 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors">
                        <ExternalLink className="w-4 h-4" />Abrir consulta de emprego
                      </a>
                    </div>
                  </div>
                </li>
                <li className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <p className="text-sm text-gray-700 flex-1">
                    Com o resultado na tela, selecione tudo (<kbd className="px-1 py-0.5 rounded border bg-gray-50 text-[11px]">Ctrl+A</kbd>),
                    copie (<kbd className="px-1 py-0.5 rounded border bg-gray-50 text-[11px]">Ctrl+C</kbd>) e cole abaixo.
                  </p>
                </li>
              </ol>

              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder="Cole aqui o resultado da consulta de emprego…"
                rows={7}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-[13px] font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={enviar} disabled={lendo || texto.trim().length < 40} className="gap-1.5">
                  {lendo ? <><Loader2 className="w-4 h-4 animate-spin" />Montando a linha do tempo…</> : <><Briefcase className="w-4 h-4" />Montar linha do tempo</>}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Guardamos só os vínculos de emprego — o texto colado não fica salvo.
                </p>
              </div>
            </div>
          )}

          {result && !colando && (
            <>
              <div className={`rounded-xl p-5 flex items-start gap-4 border-2 ${
                result.encontrado ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50 border-gray-300'
              }`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${result.encontrado ? 'bg-indigo-100' : 'bg-gray-200'}`}>
                  <Briefcase className={`w-6 h-6 ${result.encontrado ? 'text-indigo-600' : 'text-gray-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-base font-bold mb-1 ${result.encontrado ? 'text-indigo-800' : 'text-gray-700'}`}>
                    {result.encontrado ? `${result.vinculos.length} vínculo(s) de emprego` : 'Nenhum vínculo encontrado'}
                  </p>
                  <p className="text-sm leading-relaxed text-gray-700 break-words">{result.resumo}</p>
                  {result.nome_consultado && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Relatório em nome de <strong>{result.nome_consultado}</strong>
                      {result.cpf_consultado ? ` · CPF ${result.cpf_consultado.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}` : ''}
                    </p>
                  )}
                </div>
              </div>

              {cpfDivergente && (
                /* Erro caro de não perceber: relatório de outra pessoa entrando
                   na ficha como se fosse a do candidato. */
                <div className="rounded-lg bg-red-50 border border-red-300 px-4 py-3 text-sm text-red-800">
                  <strong>O CPF do relatório é diferente do CPF do candidato.</strong> Confira se a
                  consulta foi feita com o CPF certo antes de usar estes dados.
                </div>
              )}

              {result.observacao && (
                <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{result.observacao}</p>
              )}

              {result.vinculos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700">Linha do tempo</p>
                  {result.vinculos.map((v, i) => (
                    <div key={i} className={`rounded-lg border px-4 py-3 ${v.vinculo_ativo ? 'border-emerald-300 bg-emerald-50/50' : 'bg-white'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{v.empresa}</p>
                          {v.cargo && <p className="text-[13px] text-gray-700">{v.cargo}</p>}
                        </div>
                        {(v.vinculo_ativo || v.situacao) && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            v.vinculo_ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {v.vinculo_ativo ? 'ATUAL' : v.situacao}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[12px] text-muted-foreground">
                        {/* "atual" só quando o vínculo está mesmo aberto: sem data de
                            saída num vínculo DESLIGADO é falha do relatório, não emprego
                            em curso. */}
                        {[
                          v.admissao ? `${mesOuData(v.admissao)} → ${v.saida ? mesOuData(v.saida) : (v.vinculo_ativo ? 'atual' : 'sem data de saída')}` : '',
                          v.duracao ?? '',
                          typeof v.salario === 'number' ? v.salario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
                          v.cnpj ? `CNPJ ${cnpjMascara(v.cnpj)}` : '',
                        ].filter(Boolean).join('  ·  ')}
                      </div>
                      {v.observacao && <p className="text-[11.5px] text-gray-500 mt-1">{v.observacao}</p>}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed border-t pt-2">
                Dados lidos do relatório do <strong>Mind7</strong> (consulta de emprego). Confirme na
                carteira de trabalho antes de qualquer decisão.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Background Check Modal ───────────────────────────────────────────────────

function RiskBadge({ level }: { level: BackgroundCheckResult['nivel_risco'] }) {
  const map: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
    baixo:            { label: 'Risco Baixo',             className: 'bg-emerald-100 text-emerald-800 border-emerald-300', Icon: ShieldCheck },
    medio:            { label: 'Risco Médio',             className: 'bg-amber-100 text-amber-800 border-amber-300',       Icon: Shield },
    alto:             { label: 'Risco Alto',              className: 'bg-red-100 text-red-800 border-red-300',             Icon: ShieldAlert },
    nao_determinado:  { label: 'Não Determinado',         className: 'bg-gray-100 text-gray-700 border-gray-300',          Icon: Shield },
  }
  const cfg = map[level] ?? map.nao_determinado
  const Icon = cfg.Icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.className}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  )
}

function BackgroundCheckModal({
  open,
  onClose,
  result,
  checkedAt,
  candidateId,
  candidateCpf,
  onRefresh,
}: {
  open: boolean
  onClose: () => void
  result: BackgroundCheckResult | null
  checkedAt: string | null
  candidateId: string
  candidateCpf: string | null
  onRefresh: (r: BackgroundCheckResult, at: string) => void
}) {
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function runCheck() {
    setRunning(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/background-check`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data?.error || `Erro ${res.status}`)
        return
      }
      onRefresh(data.result as BackgroundCheckResult, new Date().toISOString())
    } catch {
      setErr('Erro de conexão. Tente novamente.')
    } finally {
      setRunning(false)
    }
  }

  const found = result?.processos_judiciais?.encontrado
  const cpfFormatted = candidateCpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') ?? null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* max-w-3xl = 768px; flex-col para header fixo + body rolável */}
      <DialogContent className="w-[95vw] max-w-3xl p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh]">

        {/* ── Cabeçalho fixo ── */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
            Check de Processos Judiciais
          </DialogTitle>
          {cpfFormatted && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Pesquisando por CPF:{' '}
              <span className="font-mono font-semibold text-gray-700">{cpfFormatted}</span>
            </p>
          )}
        </DialogHeader>

        {/* ── Barra de ação ── */}
        <div className="px-6 py-3 border-b bg-gray-50 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {checkedAt
              ? `Última verificação: ${formatDateTime(checkedAt)}`
              : 'Nenhuma pesquisa realizada ainda'}
          </span>
          <Button size="sm" variant="outline" onClick={runCheck} disabled={running} className="gap-1.5 shrink-0">
            {running
              ? <><Loader2 className="w-4 h-4 animate-spin" />Pesquisando...</>
              : <><RefreshCw className="w-4 h-4" />{result ? 'Refazer pesquisa' : 'Iniciar pesquisa'}</>
            }
          </Button>
        </div>

        {/* ── Corpo rolável ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4 [word-break:break-word]">

          {err && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {err}
            </div>
          )}

          {/* Loading */}
          {running && !result && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">Consultando fontes públicas...</p>
                <p className="text-xs mt-1 text-gray-400 max-w-xs">
                  Pesquisando por CPF em JusBrasil, Escavador e DuckDuckGo.
                  Pode levar até 30 segundos.
                </p>
              </div>
            </div>
          )}

          {/* Estado vazio */}
          {!result && !running && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
              <ShieldCheck className="w-16 h-16 text-gray-200" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-600">Nenhuma pesquisa realizada ainda</p>
                <p className="text-xs mt-1 text-gray-400 max-w-xs">
                  Clique em &ldquo;Iniciar pesquisa&rdquo; para consultar fontes públicas de processos judiciais
                  {cpfFormatted ? ` para o CPF ${cpfFormatted}` : ''}.
                </p>
              </div>
            </div>
          )}

          {/* ── Resultado ── */}
          {result && (
            <>
              {/* Banner de status principal */}
              <div className={`rounded-xl p-5 flex items-start gap-4 border-2 ${
                found ? 'bg-red-50 border-red-300' : 'bg-emerald-50 border-emerald-300'
              }`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                  found ? 'bg-red-100' : 'bg-emerald-100'
                }`}>
                  {found
                    ? <ShieldAlert className="w-6 h-6 text-red-600" />
                    : <ShieldCheck className="w-6 h-6 text-emerald-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <p className={`text-base font-bold ${found ? 'text-red-800' : 'text-emerald-800'}`}>
                      {found ? '⚠️ Processos judiciais encontrados' : '✅ Nenhum processo judicial encontrado'}
                    </p>
                    <RiskBadge level={result.nivel_risco} />
                  </div>
                  <p className="text-sm leading-relaxed text-gray-700 break-words">
                    {result.parecer_geral}
                  </p>
                </div>
              </div>

              {/* Processos — cards individuais */}
              {(result.processos_judiciais?.detalhes || []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
                    Processos encontrados
                  </p>
                  {result.processos_judiciais.detalhes.map((d, i) => (
                    <div key={i} className="rounded-lg border border-red-200 bg-white px-4 py-3">
                      <p className="text-sm text-gray-800 leading-relaxed break-words">
                        {typeof d === 'string' ? d : JSON.stringify(d)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Resumo — quando não há detalhes mas há resumo */}
              {result.processos_judiciais?.resumo &&
                (result.processos_judiciais?.detalhes || []).length === 0 && (
                <div className={`rounded-lg border p-4 text-sm leading-relaxed break-words text-gray-700 ${
                  found ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'
                }`}>
                  {result.processos_judiciais.resumo}
                </div>
              )}

              {/* Links para consulta */}
              {(result.processos_judiciais?.urls || []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Links para consulta manual:
                  </p>
                  <div className="space-y-1">
                    {result.processos_judiciais.urls.map((u, i) => (
                      <a
                        key={i}
                        href={u.startsWith('http') ? u : `https://${u}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-start gap-1.5 min-w-0 break-all"
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{u}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Outras informações */}
              {((result.outras_informacoes?.items || []).length > 0 ||
                result.outras_informacoes?.resumo?.trim()) && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
                  <p className="text-sm font-semibold text-blue-800">Outras Informações</p>
                  {result.outras_informacoes?.resumo && (
                    <p className="text-sm text-gray-700 leading-relaxed break-words">
                      {result.outras_informacoes.resumo}
                    </p>
                  )}
                  {(result.outras_informacoes?.items || []).length > 0 && (
                    <ul className="space-y-1">
                      {result.outras_informacoes.items.map((item, i) => (
                        <li key={i} className="text-sm flex gap-2 text-blue-900 break-words">
                          <span className="shrink-0">•</span>
                          <span className="min-w-0">{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Rodapé: fontes + observações técnicas */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-2.5">
                {(result.fontes_consultadas || []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">Fontes consultadas:</span>
                    {result.fontes_consultadas.map((f, i) => (
                      <span key={i} className="text-xs bg-white border border-gray-300 text-gray-600 px-2 py-0.5 rounded-full">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                {result.observacoes_tecnicas && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 leading-relaxed break-words">
                    ⚠️ {result.observacoes_tecnicas}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground leading-relaxed border-t pt-2">
                  Dados coletados via <strong>JusBrasil</strong>, <strong>Escavador</strong> e <strong>DuckDuckGo</strong>.
                  Resultados devem ser verificados manualmente antes de qualquer decisão.
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Modal: Check de Auxílios (Portal da Transparência) ─────────────────────────

function AuxiliosCheckModal({
  open, onClose, result, checkedAt, candidateId, candidateCpf, onRefresh,
}: {
  open: boolean
  onClose: () => void
  result: AuxiliosCheckResult | null
  checkedAt: string | null
  candidateId: string
  candidateCpf: string | null
  onRefresh: (r: AuxiliosCheckResult, at: string) => void
}) {
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const cpfFormatted = candidateCpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') ?? null

  async function runCheck() {
    setRunning(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/auxilios-check`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data?.error || `Erro ${res.status}`); return }
      onRefresh(data.result as AuxiliosCheckResult, new Date().toISOString())
    } catch {
      setErr('Erro de conexão. Tente novamente.')
    } finally { setRunning(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <HandCoins className="w-5 h-5 text-amber-600 shrink-0" />
            Check de Auxílios Governamentais
          </DialogTitle>
          {cpfFormatted && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Portal da Transparência · CPF: <span className="font-mono font-semibold text-gray-700">{cpfFormatted}</span>
            </p>
          )}
        </DialogHeader>

        <div className="px-6 py-3 border-b bg-gray-50 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {checkedAt ? `Última verificação: ${formatDateTime(checkedAt)}` : 'Nenhuma pesquisa realizada ainda'}
          </span>
          <Button size="sm" variant="outline" onClick={runCheck} disabled={running} className="gap-1.5 shrink-0">
            {running ? <><Loader2 className="w-4 h-4 animate-spin" />Consultando...</> : <><RefreshCw className="w-4 h-4" />{result ? 'Refazer pesquisa' : 'Iniciar pesquisa'}</>}
          </Button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4 [word-break:break-word]">
          {err && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{err}</div>}

          {running && !result && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
              <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
              <p className="text-sm font-semibold text-gray-700">Consultando o Portal da Transparência...</p>
            </div>
          )}

          {!result && !running && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
              <HandCoins className="w-16 h-16 text-gray-200" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-600">Nenhuma pesquisa realizada ainda</p>
                <p className="text-xs mt-1 text-gray-400 max-w-xs">Clique em &ldquo;Iniciar pesquisa&rdquo; para verificar auxílios governamentais{cpfFormatted ? ` do CPF ${cpfFormatted}` : ''} (Bolsa Família, BPC, Auxílio Emergencial, etc.).</p>
              </div>
            </div>
          )}

          {result && (
            <>
              <div className={`rounded-xl p-5 flex items-start gap-4 border-2 ${
                result.recebendo ? 'bg-amber-50 border-amber-300' : result.encontrado ? 'bg-blue-50 border-blue-300' : 'bg-emerald-50 border-emerald-300'
              }`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                  result.recebendo ? 'bg-amber-100' : result.encontrado ? 'bg-blue-100' : 'bg-emerald-100'
                }`}>
                  <HandCoins className={`w-6 h-6 ${result.recebendo ? 'text-amber-600' : result.encontrado ? 'text-blue-600' : 'text-emerald-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-base font-bold mb-1 ${result.recebendo ? 'text-amber-800' : result.encontrado ? 'text-blue-800' : 'text-emerald-800'}`}>
                    {result.recebendo ? '● Recebendo auxílio atualmente' : result.encontrado ? '○ Já recebeu auxílio' : '✅ Nenhum auxílio encontrado'}
                  </p>
                  <p className="text-sm leading-relaxed text-gray-700 break-words">{result.resumo}</p>
                </div>
              </div>

              {result.beneficios.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700">Benefícios encontrados</p>
                  {result.beneficios.map((b, i) => (
                    <div key={i} className="rounded-lg border bg-white px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{b.programa}</p>
                        <p className="text-xs text-muted-foreground">{b.detalhe}{b.periodo ? ` · ${b.periodo}` : ''}{b.valor ? ` · ${b.valor}` : ''}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        b.situacao === 'recebendo' ? 'bg-amber-100 text-amber-700' : b.situacao === 'recebeu' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>{b.situacao === 'recebendo' ? 'RECEBENDO' : b.situacao === 'recebeu' ? 'RECEBEU' : 'INDÍCIO'}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.observacao && <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{result.observacao}</p>}

              <div className="flex flex-wrap gap-1.5 items-center pt-1">
                <span className="text-[11px] text-muted-foreground">Fontes:</span>
                {result.fontes_consultadas.map((f, i) => (
                  <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{f}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CandidateActions({
  candidateId,
  applicationId,
  currentStatus,
  cultureTestDone,
  cultureScore,
  cultureAnswersSummary,
  initialBackgroundCheck,
  initialBackgroundCheckAt,
  initialAuxiliosCheck,
  initialAuxiliosCheckAt,
  initialMind7Check,
  initialMind7CheckAt,
  candidateCpf,
  hasExistingAnalysis,
}: {
  candidateId: string
  applicationId?: string
  currentStatus: CandidateStatus
  cultureTestDone?: boolean
  cultureScore?: number | null
  cultureAnswersSummary?: Array<{ question: string; answer: string; score: number }>
  initialBackgroundCheck?: BackgroundCheckResult | null
  initialBackgroundCheckAt?: string | null
  initialAuxiliosCheck?: AuxiliosCheckResult | null
  initialAuxiliosCheckAt?: string | null
  initialMind7Check?: Mind7CheckResult | null
  initialMind7CheckAt?: string | null
  candidateCpf?: string | null
  hasExistingAnalysis?: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  // Rascunho: o dropdown altera só o rascunho; salvar é explícito (botão Salvar).
  const [draftStatus, setDraftStatus] = useState(currentStatus)
  useEffect(() => { setDraftStatus(status) }, [status])
  const [cultureOpen, setCultureOpen] = useState(false)
  const [bgCheckOpen, setBgCheckOpen] = useState(false)
  const [confirmReanalyze, setConfirmReanalyze] = useState(false)
  const bypassConfirm = useRef(false)
  const [bgCheckResult, setBgCheckResult] = useState<BackgroundCheckResult | null>(initialBackgroundCheck ?? null)
  const [bgCheckAt, setBgCheckAt] = useState<string | null>(initialBackgroundCheckAt ?? null)
  const [auxOpen, setAuxOpen] = useState(false)
  const [auxResult, setAuxResult] = useState<AuxiliosCheckResult | null>(initialAuxiliosCheck ?? null)
  const [auxAt, setAuxAt] = useState<string | null>(initialAuxiliosCheckAt ?? null)
  const [mind7Open, setMind7Open] = useState(false)
  const [mind7Result, setMind7Result] = useState<Mind7CheckResult | null>(initialMind7Check ?? null)
  const [mind7At, setMind7At] = useState<string | null>(initialMind7CheckAt ?? null)
  const [analyzing, setAnalyzing] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function showToast(type: 'success' | 'error', message: string, durationMs = 4000) {
    setToast({ type, message })
    setTimeout(() => setToast(null), durationMs)
  }

  async function handleStatusChange(newStatus: string | null, extra?: Record<string, unknown>) {
    if (!newStatus || !applicationId) return
    setStatus(newStatus as CandidateStatus)
    setSavingStatus(true)
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, ...extra }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) {
        showToast('error', d.error || 'Erro ao alterar status.')
        setStatus(currentStatus)
      } else {
        router.refresh()
      }
    } catch {
      showToast('error', 'Erro ao alterar status.')
      setStatus(currentStatus)
    } finally {
      setSavingStatus(false)
    }
  }

  // ── Analisar IA — dispara e faz polling no Supabase ─────────────────────────
  async function handleAnalyzeAI() {
    if (hasExistingAnalysis && !bypassConfirm.current) {
      setConfirmReanalyze(true)
      return
    }
    bypassConfirm.current = false
    if (!applicationId) {
      showToast('error', 'Candidato sem candidatura vinculada.')
      return
    }
    setAnalyzing(true)

    try {
      const res = await fetch('/api/admin/ai/analyze-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        showToast('error', data?.error || `Erro ${res.status} ao iniciar análise.`, 8000)
        setAnalyzing(false)
        return
      }

      // Se a rota retornou um erro de etapa específica, mostra para diagnóstico
      if (data?.error) {
        showToast('error', `Erro na etapa "${data.step}": ${data.error}`, 10000)
        setAnalyzing(false)
        return
      }

      // Mostra qual provider foi usado
      const providerLabel = data?.provider === 'anthropic' ? 'Claude (Anthropic)'
        : data?.provider === 'openai' ? 'GPT (OpenAI)'
        : data?.provider === 'fallback' ? 'Fallback (sem chave IA)'
        : 'IA'
      showToast('success', `✅ Análise concluída via ${providerLabel}! Recarregando...`, 5000)

      // Pequena pausa e recarrega — o resultado já está salvo no DB
      await new Promise(r => setTimeout(r, 1500))
      window.location.reload()

    } catch (err) {
      console.error('[analyze] fetch error:', err)
      showToast('error', 'Erro de conexão. Verifique sua internet e tente novamente.', 6000)
      setAnalyzing(false)
    }
  }

  // ── Enviar Teste Cultural ────────────────────────────────────────────────────
  async function handleSendCultureTest() {
    setSendingTest(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/send-culture-test`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast('error', data?.error || 'Erro ao enviar teste cultural.', 5000)
        return
      }
      setStatus('aguardando_teste_cultural')
      if (data.whatsappSent) {
        showToast('success', '✅ Teste cultural enviado via WhatsApp!', 5000)
      } else {
        const errDetail = data.whatsappError ? ` (${data.whatsappError})` : ''
        showToast('success', `✅ Link do teste gerado! WhatsApp indisponível${errDetail}`, 7000)
      }
      router.refresh()
    } finally {
      setSendingTest(false)
    }
  }

  const scoreColor = (v: number) =>
    v >= 70 ? 'text-emerald-600' : v >= 50 ? 'text-amber-600' : 'text-red-600'

  return (
    <>
      {toast && <Toast type={toast.type} message={toast.message} />}

      {/* ── Confirmação de reanálise ── */}
      <Dialog open={confirmReanalyze} onOpenChange={setConfirmReanalyze}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-amber-500" />
              Reanalisar candidato?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Este candidato já possui um parecer da IA. Ao continuar, a análise atual será <strong>substituída</strong> por uma nova.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmReanalyze(false)}>Cancelar</Button>
            <Button
              onClick={() => { bypassConfirm.current = true; setConfirmReanalyze(false); handleAnalyzeAI() }}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Sim, reanalisar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BackgroundCheckModal
        open={bgCheckOpen}
        onClose={() => setBgCheckOpen(false)}
        result={bgCheckResult}
        checkedAt={bgCheckAt}
        candidateId={candidateId}
        candidateCpf={candidateCpf ?? null}
        onRefresh={(r, at) => { setBgCheckResult(r); setBgCheckAt(at) }}
      />

      <AuxiliosCheckModal
        open={auxOpen}
        onClose={() => setAuxOpen(false)}
        result={auxResult}
        checkedAt={auxAt}
        candidateId={candidateId}
        candidateCpf={candidateCpf ?? null}
        onRefresh={(r, at) => { setAuxResult(r); setAuxAt(at) }}
      />

      <Mind7CheckModal
        open={mind7Open}
        onClose={() => setMind7Open(false)}
        result={mind7Result}
        checkedAt={mind7At}
        candidateId={candidateId}
        candidateCpf={candidateCpf ?? null}
        onRefresh={(r, at) => { setMind7Result(r); setMind7At(at) }}
      />

      <div className="mt-3 space-y-2.5">
        {/* Linha 1 — Alterar status (+ ações de status contextuais) */}
        <div className="flex gap-2 flex-wrap items-center">
        {/* Alterar status: dropdown + Salvar (não salva ao selecionar) */}
        {applicationId && (
          <>
            <span className="text-sm font-medium text-gray-600">Alterar status:</span>
            <Select value={draftStatus} onValueChange={v => v && setDraftStatus(v as CandidateStatus)} disabled={savingStatus}>
              <SelectTrigger className="w-[200px]">
                {/* Base UI mostra o valor cru no SelectValue; usamos o rótulo computado */}
                <span>{statusOptionLabel(draftStatus as CandidateStatus)}</span>
              </SelectTrigger>
              <SelectContent>
                {(ALLOWED_STATUSES.includes(draftStatus as CandidateStatus)
                  ? ALLOWED_STATUSES
                  : [draftStatus as CandidateStatus, ...ALLOWED_STATUSES]
                ).map(s => (
                  <SelectItem key={s} value={s}>{statusOptionLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => handleStatusChange(draftStatus)}
              disabled={savingStatus || draftStatus === status}
              className="gap-1.5"
            >
              {savingStatus
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</>
                : <><CheckCircle2 className="w-3.5 h-3.5" />Salvar</>}
            </Button>
          </>
        )}

        {/* Bloquear Freelancer → status reprovado */}
        {applicationId && status === 'freelancer' && (
          <Button
            variant="outline"
            size="sm"
            disabled={savingStatus}
            onClick={() => {
              if (confirm('Bloquear este freelancer? O status passará para "Reprovado".')) {
                handleStatusChange('reprovado', { freelancerBlocked: true })
              }
            }}
            className="gap-1 border-red-300 text-red-700 hover:bg-red-50"
          >
            <ShieldAlert className="w-4 h-4" />
            Bloquear Freelancer
          </Button>
        )}


        {/* Resultado da entrevista (somente quando agendada) */}
        {applicationId && status === 'entrevista_agendada' && (
          <>
            <Button
              size="sm"
              disabled={savingStatus}
              onClick={() => handleStatusChange('aprovado_processo')}
              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="w-4 h-4" />
              Aprovado na entrevista
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={savingStatus}
              onClick={() => handleStatusChange('reprovado')}
              className="gap-1 border-red-300 text-red-700 hover:bg-red-50"
            >
              <ShieldAlert className="w-4 h-4" />
              Reprovado
            </Button>
          </>
        )}
        </div>

        {/* Linha 2 — Análises e verificações */}
        <div className="flex gap-2 flex-wrap items-center pt-2.5 border-t border-gray-100">
        {/* Analisar IA */}
        {applicationId && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyzeAI}
            disabled={analyzing}
            className="gap-1"
          >
            {analyzing
              ? <><Loader2 className="w-4 h-4 animate-spin" />Analisando...</>
              : <><Brain className="w-4 h-4" />Analisar IA</>
            }
          </Button>
        )}

        {/* Teste Cultural, Check Processos e Check Auxílios */}
        {applicationId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCultureOpen(true)}
              className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              <Eye className="w-4 h-4" />
              Visualizar Teste Cultural
            </Button>
          )}

          {/* Check Processos */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBgCheckOpen(true)}
            className={`gap-1 ${bgCheckResult
              ? bgCheckResult.nivel_risco === 'alto'
                ? 'border-red-300 text-red-700 hover:bg-red-50'
                : bgCheckResult.nivel_risco === 'medio'
                  ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                  : 'border-blue-300 text-blue-700 hover:bg-blue-50'
              : 'border-blue-200 text-blue-700 hover:bg-blue-50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Check Processos
            {bgCheckResult && (
              <span className={`ml-1 text-[10px] font-bold px-1 py-0.5 rounded-full ${
                bgCheckResult.nivel_risco === 'alto'    ? 'bg-red-100 text-red-700'    :
                bgCheckResult.nivel_risco === 'medio'   ? 'bg-amber-100 text-amber-700':
                bgCheckResult.nivel_risco === 'baixo'   ? 'bg-emerald-100 text-emerald-700' :
                                                          'bg-gray-100 text-gray-600'
              }`}>
                {bgCheckResult.nivel_risco === 'alto'   ? '⚠ ALTO'   :
                 bgCheckResult.nivel_risco === 'medio'  ? '! MÉDIO'  :
                 bgCheckResult.nivel_risco === 'baixo'  ? '✓ BAIXO'  : '?'}
              </span>
            )}
          </Button>

          {/* Check Auxílios */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAuxOpen(true)}
            className={`gap-1 ${auxResult?.recebendo
              ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
              : auxResult?.encontrado
                ? 'border-blue-300 text-blue-700 hover:bg-blue-50'
                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
          >
            <HandCoins className="w-4 h-4" />
            Check Auxílios
            {auxResult && (
              <span className={`ml-1 text-[10px] font-bold px-1 py-0.5 rounded-full ${
                auxResult.recebendo ? 'bg-amber-100 text-amber-700' :
                auxResult.encontrado ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {auxResult.recebendo ? '● RECEBENDO' : auxResult.encontrado ? '○ RECEBEU' : '✓ NÃO'}
              </span>
            )}
          </Button>

          {/* Check Mind7 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMind7Open(true)}
            className={`gap-1 ${mind7Result?.encontrado
              ? 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'
              : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50'}`}
          >
            <Briefcase className="w-4 h-4" />
            Check Mind7
            {mind7Result && (
              <span className={`ml-1 text-[10px] font-bold px-1 py-0.5 rounded-full ${
                mind7Result.encontrado ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {mind7Result.encontrado ? `${mind7Result.vinculos.length} VÍNCULOS` : '○ SEM REGISTRO'}
              </span>
            )}
          </Button>
        </div>

        {/* Dialog de resultados do Teste Cultural */}
        {applicationId && (
            <>
              <Dialog open={cultureOpen} onOpenChange={setCultureOpen}>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Teste Cultural</DialogTitle>
                  </DialogHeader>

                  {/* Score geral */}
                  {cultureScore != null && (
                    <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 border mb-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Compatibilidade Cultural</p>
                        <p className={`text-3xl font-bold ${scoreColor(cultureScore)}`}>
                          {Math.round(cultureScore)}%
                        </p>
                      </div>
                      <div className="flex-1">
                        <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${cultureScore >= 70 ? 'bg-emerald-500' : cultureScore >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${cultureScore}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {cultureScore >= 70 ? 'Alta compatibilidade' : cultureScore >= 50 ? 'Compatibilidade moderada' : 'Baixa compatibilidade'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Respostas */}
                  <div className="space-y-3">
                    {(cultureAnswersSummary || []).map((a, i) => (
                      <div key={i} className="text-sm border-b pb-2 last:border-0">
                        <p className="text-xs text-muted-foreground">{a.question}</p>
                        <div className="flex items-center justify-between mt-0.5 gap-2">
                          <p className="font-medium">{a.answer}</p>
                          <span className={`text-xs font-bold shrink-0 ${scoreColor(a.score * 10)}`}>
                            {a.score}/10
                          </span>
                        </div>
                      </div>
                    ))}
                    {(!cultureAnswersSummary || cultureAnswersSummary.length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma resposta registrada.
                      </p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </>
        )}

      </div>
    </>
  )
}
