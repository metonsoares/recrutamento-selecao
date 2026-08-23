'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileSpreadsheet, Plus, Search, Upload, X, Loader2, Trash2,
  AlertCircle, CheckCircle2, ExternalLink, Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MESES, rotuloMesLongo } from '@/lib/competencia'

export interface FolhaAnalitica {
  id: string
  empresa: string
  competencia: string   // yyyy-mm-01
  file_name: string
  url: string | null    // link assinado (bucket privado)
  created_at: string
}

/** "2026-07-01" → "07/2026" */
function periodoCurto(c: string): string {
  const [ano, mes] = c.split('-')
  return `${mes}/${ano}`
}

/** "2026-07-01" → "Julho de 2026" */

const INPUT = 'h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white'

export function FolhasAnaliticasManager({
  folhas, companyOptions,
}: {
  folhas: FolhaAnalitica[]
  companyOptions: string[]
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [removendo, setRemovendo] = useState<FolhaAnalitica | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)

  const filtradas = folhas.filter(f => {
    if (empresaFiltro && f.empresa !== empresaFiltro) return false
    const termo = busca.trim().toLowerCase()
    if (!termo) return true
    return `${f.empresa} ${f.file_name} ${periodoCurto(f.competencia)} ${rotuloMesLongo(f.competencia)}`
      .toLowerCase().includes(termo)
  })

  async function remover() {
    if (!removendo) return
    setExcluindo(true)
    try {
      const res = await fetch('/api/admin/folhas-analiticas', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: removendo.id }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao remover.')
      setAviso({ tipo: 'ok', msg: 'Folha analítica removida.' })
      setRemovendo(null)
      router.refresh()
    } catch (e) {
      setAviso({ tipo: 'erro', msg: (e as Error).message })
    } finally { setExcluindo(false) }
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold leading-tight">Folhas analíticas</h1>
          <p className="text-sm text-muted-foreground">
            {folhas.length} documento{folhas.length !== 1 ? 's' : ''} — um por empresa e período
          </p>
        </div>
        <Button onClick={() => { setAviso(null); setModalAberto(true) }} className="gap-1.5">
          <Plus className="w-4 h-4" />Adicionar documento
        </Button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por período, empresa ou arquivo…"
            className="h-9 w-full border border-gray-300 rounded-md pl-8 pr-2.5 text-sm bg-white" />
        </div>
        <select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)} className={INPUT}>
          <option value="">Todas as empresas</option>
          {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {aviso && (
        <p className={`text-[13px] flex items-center gap-1 ${aviso.tipo === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
          {aviso.tipo === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {aviso.msg}
        </p>
      )}

      {/* Lista */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Período</th>
                <th className="px-4 py-2.5 font-semibold">Empresa</th>
                <th className="px-4 py-2.5 font-semibold hidden sm:table-cell">Arquivo</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtradas.map(f => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="font-semibold text-gray-900">{periodoCurto(f.competencia)}</span>
                    <span className="block text-[11px] text-muted-foreground">{rotuloMesLongo(f.competencia)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />{f.empresa}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell truncate max-w-[240px]">{f.file_name}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline mr-2">
                        Abrir PDF<ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button onClick={() => setRemovendo(f)} title="Remover"
                      className="p-1 text-gray-400 hover:text-red-600 rounded align-middle">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  {folhas.length === 0 ? 'Nenhuma folha analítica enviada ainda.' : 'Nenhum documento encontrado.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalAberto && (
        <ModalAdicionar
          companyOptions={companyOptions}
          onClose={() => setModalAberto(false)}
          onPronto={msg => { setAviso({ tipo: 'ok', msg }); setModalAberto(false); router.refresh() }}
        />
      )}

      {/* Confirmação de remoção */}
      {removendo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => !excluindo && setRemovendo(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-4 border-b">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              <h2 className="text-base font-semibold text-gray-900">Remover folha analítica</h2>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600">
              Remover a folha de <strong>{removendo.empresa}</strong> referente a{' '}
              <strong>{periodoCurto(removendo.competencia)}</strong>?
              <span className="block mt-1 text-gray-500">O arquivo PDF também é apagado.</span>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setRemovendo(null)} disabled={excluindo}>Cancelar</Button>
              <Button variant="destructive" onClick={remover} disabled={excluindo} className="gap-1.5">
                {excluindo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Remover
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modal: adicionar documento ───────────────────────────────────────────────

function ModalAdicionar({
  companyOptions, onClose, onPronto,
}: {
  companyOptions: string[]
  onClose: () => void
  onPronto: (msg: string) => void
}) {
  const agora = new Date()
  const [empresa, setEmpresa] = useState('')
  const [mes, setMes] = useState(String(agora.getMonth() + 1).padStart(2, '0'))
  const [ano, setAno] = useState(String(agora.getFullYear()))
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const anos = Array.from({ length: 7 }, (_, i) => agora.getFullYear() + 1 - i)

  async function enviar() {
    if (!empresa) { setErro('Escolha a empresa.'); return }
    if (!arquivo) { setErro('Anexe o arquivo PDF.'); return }
    setEnviando(true); setErro('')
    try {
      const fd = new FormData()
      fd.append('empresa', empresa)
      fd.append('competencia', `${ano}-${mes}-01`)
      fd.append('file', arquivo)
      const res = await fetch('/api/admin/folhas-analiticas', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao enviar.')
      onPronto(d.substituida
        ? `Folha de ${mes}/${ano} substituída para ${empresa}.`
        : `Folha de ${mes}/${ano} adicionada para ${empresa}.`)
    } catch (e) {
      setErro((e as Error).message)
    } finally { setEnviando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => !enviando && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-primary" />Adicionar folha analítica
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Empresa</label>
            <select value={empresa} onChange={e => setEmpresa(e.target.value)} className={INPUT}>
              <option value="">Selecione…</option>
              {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Período</label>
            <div className="grid grid-cols-2 gap-2">
              <select value={mes} onChange={e => setMes(e.target.value)} className={INPUT}>
                {MESES.map((nome, i) => (
                  <option key={nome} value={String(i + 1).padStart(2, '0')}>
                    {String(i + 1).padStart(2, '0')} — {nome}
                  </option>
                ))}
              </select>
              <select value={ano} onChange={e => setAno(e.target.value)} className={INPUT}>
                {anos.map(a => <option key={a} value={String(a)}>{a}</option>)}
              </select>
            </div>
            <p className="text-[10px] text-muted-foreground">Ficará registrado como {mes}/{ano}.</p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Arquivo (PDF)</label>
            <label className="flex items-center gap-2 h-9 px-2.5 border border-gray-300 border-dashed rounded-md bg-white cursor-pointer hover:border-primary/50">
              <Upload className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="text-[12.5px] text-gray-600 truncate">
                {arquivo ? arquivo.name : 'Escolher arquivo…'}
              </span>
              <input type="file" accept="application/pdf" className="hidden"
                onChange={e => { setArquivo(e.target.files?.[0] ?? null); setErro('') }} />
            </label>
            <p className="text-[10px] text-muted-foreground">Somente PDF, até 25 MB.</p>
          </div>

          {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{erro}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button onClick={enviar} disabled={enviando} className="gap-1.5">
            {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}Enviar
          </Button>
        </div>
      </div>
    </div>
  )
}
