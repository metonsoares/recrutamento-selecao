'use client'
import { useState, useRef, useEffect } from 'react'
import {
  Plus, Trash2, Loader2, X, Upload, FileText, FileDown, Download, Eye, Pencil,
  CheckCircle2, AlertCircle, FileSignature, PenTool, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'
import { parseMoney, formatMoneyExtenso } from '@/lib/currency'

export interface ContractItem {
  id: string
  title: string
  contract_date: string
  period_start: string | null
  period_end: string | null
  value: number | null
  notes: string | null
  file_url: string | null
  file_name: string | null
  file_path: string | null
  file_type: string | null
  template_id: string | null
  variables: Record<string, string> | null
  created_at: string
  d4sign_uuid?: string | null
  d4sign_status?: string | null
  d4sign_status_raw?: string | null
  signed_file_url?: string | null
}

interface TemplateOpt { id: string; name: string; file_type: string | null }
interface Props { candidateId: string; initialContracts: ContractItem[] }

function brl(v: number | null) {
  if (v == null) return null
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function viewUrl(c: ContractItem) {
  const url = c.file_url || ''
  if (c.file_type === 'pdf' || c.file_name?.toLowerCase().endsWith('.pdf')) return url
  return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`
}

export function ContratosTab({ candidateId, initialContracts }: Props) {
  const [contracts, setContracts] = useState<ContractItem[]>(initialContracts)
  const [templates, setTemplates] = useState<TemplateOpt[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [templateId, setTemplateId] = useState('')
  const [templatePdf, setTemplatePdf] = useState(false)
  const [vars, setVars] = useState<{ name: string; value: string; type?: string; label?: string; manual?: boolean; tags?: string[]; source?: string }[]>([])
  const [loadingVars, setLoadingVars] = useState(false)
  const [companies, setCompanies] = useState<{ id: string; nome: string; cnpj: string; endereco: string; cep: string }[]>([])
  const [companySel, setCompanySel] = useState('')

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [value, setValue] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<{ url: string; name: string; path: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!modalOpen) return
    fetch('/api/admin/contract-templates').then(r => r.json()).then(d => setTemplates((d.templates || []).map((t: TemplateOpt) => ({ id: t.id, name: t.name, file_type: t.file_type })))).catch(() => {})
  }, [modalOpen])

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

  // ── Assinatura D4Sign ─────────────────────────────────────────────────────
  const [d4BusyId, setD4BusyId] = useState<string | null>(null)
  const [confirmSend, setConfirmSend] = useState<ContractItem | null>(null)

  // Atualização automática: enquanto houver contrato aguardando assinatura, lê o
  // status do banco (atualizado pelo webhook da D4Sign) a cada 30s.
  const pendingSign = contracts.some(c => c.d4sign_uuid && c.d4sign_status !== 'assinado')
  useEffect(() => {
    if (!pendingSign) return
    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/candidatos/${candidateId}/contratos/d4sign-status`)
        const d = await res.json().catch(() => ({}))
        const map = new Map<string, { d4sign_status?: string | null; d4sign_status_raw?: string | null; signed_file_url?: string | null }>()
        for (const r of (d.contracts || [])) map.set(r.id, r)
        setContracts(prev => prev.map(c => {
          const u = map.get(c.id)
          if (!u) return c
          return { ...c, d4sign_status: u.d4sign_status ?? c.d4sign_status, d4sign_status_raw: u.d4sign_status_raw ?? c.d4sign_status_raw, signed_file_url: u.signed_file_url ?? c.signed_file_url }
        }))
      } catch { /* ignora */ }
    }
    const interval = setInterval(tick, 30000)
    return () => clearInterval(interval)
  }, [pendingSign, candidateId])

  async function doD4Send(c: ContractItem) {
    setConfirmSend(null)
    setD4BusyId(c.id)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/contratos/${c.id}/d4sign`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { showToast('err', d.error || 'Erro ao enviar para assinatura.'); return }
      setContracts(prev => prev.map(x => x.id === c.id ? { ...x, d4sign_uuid: d.uuid, d4sign_status: 'enviado' } : x))
      showToast('ok', 'Contrato enviado para assinatura na D4Sign.')
    } catch { showToast('err', 'Erro ao enviar para assinatura.') } finally { setD4BusyId(null) }
  }

  async function handleD4Check(c: ContractItem) {
    setD4BusyId(c.id)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/contratos/${c.id}/d4sign`, { method: 'GET' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { showToast('err', d.error || 'Erro ao consultar status.'); return }
      setContracts(prev => prev.map(x => x.id === c.id ? { ...x, d4sign_status: d.status, d4sign_status_raw: d.status_raw, signed_file_url: d.signed_file_url ?? x.signed_file_url } : x))
      showToast('ok', d.status === 'assinado' ? 'Documento assinado!' : `Status: ${d.status_raw || 'aguardando assinatura'}`)
    } catch { showToast('err', 'Erro ao consultar status.') } finally { setD4BusyId(null) }
  }

  function resetForm() {
    setTemplateId(''); setTemplatePdf(false); setVars([]); setTitle(''); setDate(new Date().toISOString().slice(0, 10))
    setStart(''); setEnd(''); setValue(''); setNotes(''); setFile(null); setError('')
  }
  function openModal() { setEditingId(null); resetForm(); setModalOpen(true) }
  function openEdit(c: ContractItem) {
    setEditingId(c.id)
    setTemplateId(c.template_id || ''); setTemplatePdf(false)
    setVars(c.variables ? Object.entries(c.variables).map(([name, v]) => ({ name, value: String(v) })) : [])
    setTitle(c.title); setDate(c.contract_date)
    setStart(c.period_start || ''); setEnd(c.period_end || ''); setValue(c.value != null ? String(c.value) : ''); setNotes(c.notes || '')
    setFile(c.file_url && c.file_path && c.file_name ? { url: c.file_url, name: c.file_name, path: c.file_path } : null)
    setError(''); setModalOpen(true)
  }

  async function onSelectTemplate(tid: string) {
    setTemplateId(tid); setVars([]); setTemplatePdf(false); setError('')
    if (!tid) return
    const tpl = templates.find(t => t.id === tid)
    if (tpl && !title.trim()) setTitle(tpl.name)
    setLoadingVars(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/contratos/prepare`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_id: tid }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Erro ao ler template.'); return }
      if (d.pdf) { setTemplatePdf(true); setVars([]) }
      else {
        setCompanies(d.companies || [])
        setCompanySel(d.selectedCompanyId || '')
        let nextVars = (d.variables || []) as typeof vars
        // pré-aplica a empresa vinculada à ficha (quando houver)
        const pre = (d.companies || []).find((c: { id: string }) => c.id === d.selectedCompanyId)
        if (pre) nextVars = applyCompany(nextVars, pre)
        setVars(nextVars)
      }
    } catch { setError('Erro ao ler template.') }
    finally { setLoadingVars(false) }
  }

  /** Preenche os campos da empresa (razão social, CNPJ, endereço, CEP) em cascata. */
  function applyCompany(list: typeof vars, c: { nome: string; cnpj: string; endereco: string; cep: string }) {
    return list.map(v =>
      v.source === 'empresa' ? { ...v, value: c.nome }
      : v.source === 'empresa_cnpj' ? { ...v, value: c.cnpj }
      : v.source === 'empresa_endereco' ? { ...v, value: c.endereco }
      : v.source === 'empresa_cep' ? { ...v, value: c.cep }
      : v
    )
  }

  function onSelectCompany(id: string) {
    setCompanySel(id)
    const c = companies.find(x => x.id === id)
    if (c) setVars(prev => applyCompany(prev, c))
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; setError('')
    if (f.size > 15 * 1024 * 1024) { setError('Arquivo excede 15 MB.'); return }
    setUploading(true)
    const fd = new FormData(); fd.append('file', f); fd.append('docKey', 'contrato')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, { method: 'POST', body: fd })
      const d = await res.json(); if (!res.ok) throw new Error(d.error)
      setFile({ url: d.url, name: f.name, path: d.path })
    } catch (e) { setError((e as Error).message || 'Erro no upload') }
    finally { setUploading(false); if (e.target) e.target.value = '' }
  }

  async function handleSave() {
    setError('')
    if (!title.trim()) { setError('Informe o título do contrato.'); return }
    if (!date) { setError('Informe a data do contrato.'); return }
    setSaving(true)
    // expande o valor para todas as grafias originais do campo no documento;
    // campos monetários viram "R$ 2.000,00 (dois mil reais)"
    const variablesObj = vars.reduce((acc, v) => {
      let out = v.value
      const label = (v.label || v.name).toLowerCase()
      const isMoney = v.type === 'currency' || /valor|bonus|bônus|preço|preco|salário|salario|cachê|cache/.test(label)
      if (isMoney) {
        const n = parseMoney(v.value)
        if (n != null) out = formatMoneyExtenso(n)
      }
      for (const tag of (v.tags && v.tags.length ? v.tags : [v.name])) acc[tag] = out
      return acc
    }, {} as Record<string, string>)
    const payload: Record<string, unknown> = {
      title, contract_date: date, period_start: start || null, period_end: end || null, value, notes,
    }
    if (templateId && vars.length > 0) { payload.template_id = templateId; payload.variables = variablesObj }
    if (file && (!templateId || templatePdf)) { payload.file_url = file.url; payload.file_name = file.name; payload.file_path = file.path }
    try {
      const url = editingId
        ? `/api/admin/candidatos/${candidateId}/contratos/${editingId}`
        : `/api/admin/candidatos/${candidateId}/contratos`
      const res = await fetch(url, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await res.json(); if (!res.ok) throw new Error(d.error)
      if (editingId) {
        setContracts(prev => prev.map(c => c.id === editingId ? d.contract : c).sort((a, b) => b.contract_date.localeCompare(a.contract_date)))
        showToast('ok', 'Contrato atualizado.')
      } else {
        setContracts(prev => [d.contract, ...prev].sort((a, b) => b.contract_date.localeCompare(a.contract_date)))
        showToast('ok', 'Contrato adicionado.')
      }
      setModalOpen(false)
    } catch (e) { setError((e as Error).message || 'Erro ao salvar.') }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este contrato?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/contratos/${id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast('err', d.error || 'Erro ao remover.'); return }
      setContracts(prev => prev.filter(c => c.id !== id))
      showToast('ok', 'Contrato removido.')
    } finally { setDeletingId(null) }
  }

  return (
    <div className="max-w-3xl space-y-4">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{toast.msg}
        </div>
      )}

      {/* Confirmação de envio para assinatura (D4Sign) — sem confirm() bloqueante */}
      {confirmSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setConfirmSend(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center gap-2">
              <PenTool className="w-5 h-5 text-[#0b5cff]" />
              <h2 className="text-base font-semibold text-gray-900">Enviar para assinatura</h2>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600 space-y-1.5">
              <p>Enviar o contrato <strong>{confirmSend.title}</strong> para assinatura na D4Sign?</p>
              <p className="text-[12px] text-muted-foreground">O funcionário receberá o convite por e-mail para assinar.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setConfirmSend(null)}>Cancelar</Button>
              <Button onClick={() => doD4Send(confirmSend)} className="gap-1.5"><PenTool className="w-4 h-4" />Enviar</Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileSignature className="w-5 h-5 text-[#333]" />
          <div>
            <h2 className="text-base font-bold text-gray-900">Contratos</h2>
            <p className="text-[12px] text-muted-foreground">{contracts.length} contrato{contracts.length !== 1 ? 's' : ''} realizado{contracts.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button onClick={openModal} className="gap-1.5 shrink-0"><Plus className="w-4 h-4" />Adicionar contrato</Button>
      </div>

      {contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 bg-white rounded-2xl border">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center"><FileSignature className="w-7 h-7 text-gray-300" /></div>
          <p className="font-medium text-gray-600">Nenhum contrato</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="relative space-y-4 before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-px before:bg-gray-200">
            {contracts.map(c => (
              <div key={c.id} className="relative flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center shrink-0 z-10">
                  <FileSignature className="w-3 h-3 text-sky-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-gray-800">{formatDate(c.contract_date)}</span>
                    <span className="text-sm font-medium text-gray-900">{c.title}</span>
                    {c.value != null && <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">{brl(c.value)}</span>}
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      {c.file_url && (
                        <a href={viewUrl(c)} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-gray-500 hover:text-primary hover:bg-primary/10" title="Visualizar"><Eye className="w-5 h-5" /></a>
                      )}
                      <button onClick={() => openEdit(c)} className="p-2 rounded-lg text-gray-500 hover:text-primary hover:bg-primary/10" title="Editar"><Pencil className="w-5 h-5" /></button>
                      {c.file_url && (
                        <a href={c.file_url} target="_blank" rel="noreferrer" download className="p-2 rounded-lg text-gray-500 hover:text-primary hover:bg-primary/10" title="Download"><Download className="w-5 h-5" /></a>
                      )}
                      <button onClick={() => handleDelete(c.id)} disabled={deletingId === c.id} className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50" title="Remover">
                        {deletingId === c.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  {(c.period_start || c.period_end) && (
                    <p className="text-[12px] text-muted-foreground mt-0.5">Período: {c.period_start ? formatDate(c.period_start) : '—'} a {c.period_end ? formatDate(c.period_end) : '—'}</p>
                  )}
                  {c.notes && <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{c.notes}</p>}
                  {c.file_name && (
                    <p className="inline-flex items-center gap-1.5 mt-1.5 text-[12px] text-gray-500">
                      {c.file_name.toLowerCase().endsWith('.pdf') ? <FileText className="w-3.5 h-3.5 text-red-500" /> : <FileDown className="w-3.5 h-3.5 text-blue-500" />}{c.file_name}
                    </p>
                  )}

                  {/* Assinatura via D4Sign */}
                  {c.file_url && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {!c.d4sign_uuid ? (
                        <button
                          onClick={() => setConfirmSend(c)}
                          disabled={d4BusyId === c.id}
                          title="Enviar o contrato para assinatura eletrônica na D4Sign"
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[#0b5cff] text-[#0b5cff] hover:bg-[#0b5cff]/10 transition-colors disabled:opacity-60"
                        >
                          {d4BusyId === c.id ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</> : <><PenTool className="w-4 h-4" />Enviar para assinatura</>}
                        </button>
                      ) : c.d4sign_status === 'assinado' ? (
                        <a
                          href={`/api/admin/candidatos/${candidateId}/contratos/${c.id}/d4sign/download`}
                          target="_blank" rel="noreferrer"
                          title="Baixar o PDF assinado"
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />Documento assinado
                          <Download className="w-3.5 h-3.5 opacity-70" />
                        </a>
                      ) : (
                        <button
                          onClick={() => handleD4Check(c)}
                          disabled={d4BusyId === c.id}
                          title="Clique para verificar o status da assinatura na D4Sign"
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-60"
                        >
                          {d4BusyId === c.id ? <><Loader2 className="w-4 h-4 animate-spin" />Verificando...</> : <><Clock className="w-4 h-4" />Aguardando assinatura</>}
                        </button>
                      )}
                      {c.d4sign_uuid && c.d4sign_status !== 'assinado' && c.d4sign_status_raw && (
                        <span className="text-[11px] text-muted-foreground">{c.d4sign_status_raw}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <h2 className="text-base font-semibold text-gray-900">{editingId ? 'Editar contrato' : 'Adicionar contrato'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Template */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Usar template de contrato</label>
                <select value={templateId} onChange={e => onSelectTemplate(e.target.value)}
                  className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                  <option value="">Nenhum (anexar arquivo manualmente)</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.file_type === 'pdf' ? ' (PDF)' : ''}</option>)}
                </select>
                {loadingVars && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Lendo variáveis do template...</p>}
                {templatePdf && <p className="text-[11px] text-amber-600">Template em PDF não tem variáveis para preencher — anexe o arquivo abaixo, se desejar.</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Título / tipo do contrato *</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Contrato de prestação de serviço - Evento X" />
              </div>
              {/* Data/Valor/Período só no fluxo manual — com template, os dados vêm das variáveis */}
              {(!templateId || templatePdf) && (
                <>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1"><label className="text-xs font-medium text-gray-600">Data *</label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
                    <div className="w-32 space-y-1"><label className="text-xs font-medium text-gray-600">Valor (R$)</label><Input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="0,00" /></div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1"><label className="text-xs font-medium text-gray-600">Início (opcional)</label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
                    <div className="flex-1 space-y-1"><label className="text-xs font-medium text-gray-600">Término (opcional)</label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
                  </div>
                </>
              )}

              {/* Variáveis do template */}
              {vars.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Campos do contrato</p>
                  <p className="text-[11px] text-muted-foreground">Preenchidos automaticamente quando encontrados. Complete os que estiverem em branco.</p>
                  <div className="space-y-2.5">
                    {vars.map((v, i) => {
                      const lbl = (v.label || v.name).toLowerCase()
                      const isMoney = v.type === 'currency' || /valor|bonus|bônus|preço|preco|salário|salario|cachê|cache/.test(lbl)
                      const moneyNum = isMoney ? parseMoney(v.value) : null
                      return (
                        <div key={v.name} className="space-y-1">
                          <label className="text-[12px] font-medium text-gray-600">
                            {v.label || v.name}
                            {v.manual && <span className="ml-1 text-[10px] text-amber-600">(preencher)</span>}
                          </label>
                          {v.source === 'empresa' ? (
                            <select
                              value={companySel}
                              onChange={e => onSelectCompany(e.target.value)}
                              className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white"
                            >
                              <option value="">Selecione a empresa...</option>
                              {companies.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </select>
                          ) : (
                            <Input
                              type={isMoney ? 'text' : v.type === 'number' ? 'number' : v.type === 'date' ? 'date' : 'text'}
                              inputMode={isMoney ? 'decimal' : undefined}
                              placeholder={isMoney ? 'Ex: 3.000,00' : undefined}
                              value={v.value}
                              onChange={e => setVars(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                              className="h-9 text-sm"
                            />
                          )}
                          {/* Preview por extenso (vai assim para o contrato) */}
                          {isMoney && moneyNum != null && (
                            <p className="text-[11px] text-emerald-700 font-medium">{formatMoneyExtenso(moneyNum)}</p>
                          )}
                          {isMoney && v.value.trim() !== '' && moneyNum == null && (
                            <p className="text-[11px] text-amber-600">Digite um valor numérico (ex.: 3000 ou 3.000,00).</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Observações só no fluxo manual */}
              {(!templateId || templatePdf) && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Observações</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              )}

              {/* Anexo manual (quando sem template ou template pdf) */}
              {(!templateId || templatePdf) && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Arquivo do contrato (PDF/DOC/imagem)</label>
                  {file ? (
                    <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5">
                      <FileText className="w-4 h-4 text-red-500 shrink-0" />
                      <a href={file.url} target="_blank" rel="noreferrer" className="text-[12px] text-emerald-700 hover:underline truncate flex-1">{file.name}</a>
                      <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button disabled={uploading} onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 w-full justify-center">
                      {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enviando...</> : <><Upload className="w-3.5 h-3.5" />Anexar arquivo</>}
                    </button>
                  )}
                  <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,.doc,.docx" className="hidden" onChange={handleFile} />
                </div>
              )}

              {templateId && !templatePdf && vars.length > 0 && (
                <p className="text-[11px] text-muted-foreground">Ao salvar, o contrato será gerado em Word com a formatação do template.</p>
              )}
              {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || uploading} className="gap-1.5">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : <><CheckCircle2 className="w-3.5 h-3.5" />Salvar</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
