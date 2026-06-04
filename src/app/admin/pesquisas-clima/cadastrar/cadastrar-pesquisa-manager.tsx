'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ClipboardList, Plus, Trash2, Loader2, X, Copy, QrCode, CheckCircle2, AlertCircle, ExternalLink, Upload, Pencil, BarChart3, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { STATUS_LABELS, CandidateStatus } from '@/types'

interface Employee { id: string; name: string; status: string; empresa: string }
interface QOption { text: string; weight: string }
interface Question { id: string; text: string; type: 'texto' | 'multipla'; options: QOption[] }
interface Survey {
  id: string; title: string; description?: string | null; company_name: string | null; token: string
  target_statuses?: string[]; target_candidate_ids: string[]; questions: unknown[]
  result_guide?: string | null
  climate_responses?: { count: number }[]
}

interface Props {
  initialSurveys: Survey[]
  companyOptions: string[]
  employees: Employee[]
  appUrl: string
}

// Apenas colaboradores: Freelancers, Em contrato, Contratado, Intermitentes
const STATUS_KEYS: CandidateStatus[] = ['freelancer', 'em_contrato', 'contratado', 'aprovado']

function genId() { return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random()) }

export function CadastrarPesquisaManager({ initialSurveys, companyOptions, employees, appUrl }: Props) {
  const router = useRouter()
  const [surveys, setSurveys] = useState<Survey[]>(initialSurveys)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [linkModal, setLinkModal] = useState<Survey | null>(null)

  // form
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [company, setCompany] = useState('')
  const [statuses, setStatuses] = useState<Set<string>>(new Set())
  const [selectedEmp, setSelectedEmp] = useState<Set<string>>(new Set())
  const [questions, setQuestions] = useState<Question[]>([])
  const [resultGuide, setResultGuide] = useState('')
  const [importingGuide, setImportingGuide] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

  function openModal() {
    setEditingId(null)
    setTitle(''); setDescription(''); setCompany(''); setStatuses(new Set()); setSelectedEmp(new Set())
    setQuestions([{ id: genId(), text: '', type: 'multipla', options: [{ text: '', weight: '10' }, { text: '', weight: '0' }] }])
    setResultGuide('')
    setError(''); setModalOpen(true)
  }

  function openEdit(s: Survey) {
    setEditingId(s.id)
    setTitle(s.title || ''); setDescription(s.description || ''); setCompany(s.company_name || '')
    setStatuses(new Set(s.target_statuses || []))
    setSelectedEmp(new Set(s.target_candidate_ids || []))
    type PQ = { id?: string; text: string; type?: 'texto' | 'multipla'; options?: { text: string; weight: number }[] }
    const qs = (s.questions || []) as PQ[]
    setQuestions(qs.map(q => ({
      id: q.id || genId(), text: q.text || '', type: q.type === 'texto' ? 'texto' : 'multipla',
      options: (q.options || []).map(o => ({ text: o.text, weight: String(o.weight ?? 0) })),
    })))
    setResultGuide(s.result_guide || '')
    setError(''); setModalOpen(true)
  }

  const [importing, setImporting] = useState(false)
  async function handleDocx(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setImporting(true); setError('')
    const fd = new FormData(); fd.append('file', f)
    try {
      const res = await fetch('/api/admin/climate-surveys/parse-docx', { method: 'POST', body: fd })
      const raw = await res.text()
      let d: { error?: string; title?: string; description?: string; questions?: unknown[] }
      try { d = JSON.parse(raw) } catch {
        throw new Error(res.status === 504 || res.status === 408
          ? 'O processamento demorou demais. Tente um arquivo menor ou tente novamente.'
          : 'Não foi possível processar o arquivo. Tente novamente.')
      }
      if (!res.ok) throw new Error(d.error || 'Erro ao importar.')
      if (d.title && !title.trim()) setTitle(d.title)
      if (d.description && !description.trim()) setDescription(d.description)
      type PQ = { id?: string; text: string; type: 'texto' | 'multipla'; options?: { text: string; weight: number }[] }
      const qs = (d.questions || []) as PQ[]
      if (qs.length === 0) throw new Error('Nenhuma pergunta identificada no arquivo.')
      setQuestions(qs.map(q => ({
        id: q.id || genId(), text: q.text, type: q.type,
        options: (q.options || []).map(o => ({ text: o.text, weight: String(o.weight ?? 0) })),
      })))
      showToast('ok', `${qs.length} pergunta(s) importada(s) do arquivo.`)
    } catch (err) { setError((err as Error).message || 'Erro ao importar arquivo.') }
    finally { setImporting(false); if (e.target) e.target.value = '' }
  }

  async function handleGuide(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setImportingGuide(true); setError('')
    const fd = new FormData(); fd.append('file', f)
    fd.append('questions', questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n'))
    try {
      const res = await fetch('/api/admin/climate-surveys/parse-guide', { method: 'POST', body: fd })
      const raw = await res.text()
      let d: { error?: string; guide?: string }
      try { d = JSON.parse(raw) } catch {
        throw new Error(res.status === 504 || res.status === 408
          ? 'O processamento demorou demais. Tente novamente.'
          : 'Não foi possível processar o arquivo. Tente novamente.')
      }
      if (!res.ok) throw new Error(d.error || 'Erro ao importar.')
      if (!d.guide) throw new Error('Não foi possível extrair as instruções do arquivo.')
      setResultGuide(d.guide)
      showToast('ok', 'Instruções de resultado importadas e interpretadas pela IA.')
    } catch (err) { setError((err as Error).message || 'Erro ao importar arquivo.') }
    finally { setImportingGuide(false); if (e.target) e.target.value = '' }
  }

  const elegiveis = useMemo(() => employees.filter(e =>
    (STATUS_KEYS as string[]).includes(e.status) &&
    (!company || e.empresa === company) &&
    (statuses.size === 0 || statuses.has(e.status))
  ), [employees, company, statuses])

  function toggleStatus(s: string) { setStatuses(p => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n }) }
  function toggleEmp(id: string) { setSelectedEmp(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const allSelected = elegiveis.length > 0 && elegiveis.every(e => selectedEmp.has(e.id))
  function toggleAllEmp() {
    setSelectedEmp(p => {
      const n = new Set(p)
      if (allSelected) elegiveis.forEach(e => n.delete(e.id))
      else elegiveis.forEach(e => n.add(e.id))
      return n
    })
  }

  function addQuestion() { setQuestions(p => [...p, { id: genId(), text: '', type: 'multipla', options: [{ text: '', weight: '10' }, { text: '', weight: '0' }] }]) }
  function updQuestion(id: string, patch: Partial<Question>) { setQuestions(p => p.map(q => q.id === id ? { ...q, ...patch } : q)) }
  function rmQuestion(id: string) { setQuestions(p => p.filter(q => q.id !== id)) }
  function addOption(qid: string) { setQuestions(p => p.map(q => q.id === qid ? { ...q, options: [...q.options, { text: '', weight: '0' }] } : q)) }
  function updOption(qid: string, idx: number, patch: Partial<QOption>) {
    setQuestions(p => p.map(q => q.id === qid ? { ...q, options: q.options.map((o, i) => i === idx ? { ...o, ...patch } : o) } : q))
  }
  function rmOption(qid: string, idx: number) { setQuestions(p => p.map(q => q.id === qid ? { ...q, options: q.options.filter((_, i) => i !== idx) } : q)) }

  async function handleSave() {
    setError('')
    if (!title.trim()) { setError('Informe o título da pesquisa.'); return }
    if (questions.length === 0 || questions.some(q =>
      !q.text.trim() || (q.type === 'multipla' && (q.options.length === 0 || q.options.some(o => !o.text.trim())))
    )) {
      setError('Preencha todas as perguntas e as opções das de múltipla escolha.'); return
    }
    setSaving(true)
    try {
      const payload = {
        title, description, company_name: company || null,
        target_statuses: Array.from(statuses),
        target_candidate_ids: Array.from(selectedEmp),
        questions: questions.map(q => ({ id: q.id, text: q.text, type: q.type, options: q.type === 'texto' ? [] : q.options.map(o => ({ text: o.text, weight: Number(o.weight) || 0 })) })),
        result_guide: resultGuide || null,
      }
      const res = await fetch(editingId ? `/api/admin/climate-surveys/${editingId}` : '/api/admin/climate-surveys', {
        method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const d = await res.json(); if (!res.ok) throw new Error(d.error)
      if (editingId) {
        setSurveys(prev => prev.map(s => s.id === editingId ? { ...s, ...d.survey } : s))
        setModalOpen(false)
        showToast('ok', 'Pesquisa atualizada!')
      } else {
        setSurveys(prev => [d.survey, ...prev])
        setModalOpen(false)
        setLinkModal(d.survey)
        showToast('ok', 'Pesquisa criada!')
      }
    } catch (e) { setError((e as Error).message || 'Erro ao salvar.') }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta pesquisa e suas respostas?')) return
    const res = await fetch(`/api/admin/climate-surveys/${id}`, { method: 'DELETE' })
    if (res.ok) { setSurveys(p => p.filter(s => s.id !== id)); showToast('ok', 'Pesquisa removida.') }
    else showToast('err', 'Erro ao remover.')
  }

  function surveyUrl(token: string) { return `${appUrl || ''}/pesquisa/${token}` }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-[#333]" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cadastrar pesquisas</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Pesquisas de clima organizacional</p>
          </div>
        </div>
        <Button onClick={openModal} className="gap-1.5 shrink-0"><Plus className="w-4 h-4" />Nova pesquisa</Button>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        {surveys.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">Nenhuma pesquisa cadastrada.</p>}
        {surveys.map((s, i) => (
          <div key={s.id} className={`flex items-center gap-3 px-4 py-3.5 ${i < surveys.length - 1 ? 'border-b' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{s.title}</p>
              <p className="text-[12px] text-muted-foreground">
                {s.company_name || 'Todas as empresas'} · {(s.target_candidate_ids?.length || 0)} funcionário(s) · {(s.questions?.length || 0)} pergunta(s) · {s.climate_responses?.[0]?.count ?? 0} resposta(s)
              </p>
            </div>
            <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5" title="Editar"><Pencil className="w-4 h-4" /></button>
            <button onClick={() => router.push(`/admin/pesquisas-clima/resultados?survey=${s.id}`)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5" title="Ver resultados"><BarChart3 className="w-4 h-4" /></button>
            <button onClick={() => setLinkModal(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5" title="Link / QR Code"><QrCode className="w-4 h-4" /></button>
            <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Remover"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      {/* Modal Nova pesquisa */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <h2 className="text-base font-semibold text-gray-900">{editingId ? 'Editar pesquisa de clima' : 'Nova pesquisa de clima'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Título *</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Pesquisa de Clima 2026" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Descrição</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Empresa</label>
                <select value={company} onChange={e => { setCompany(e.target.value); setSelectedEmp(new Set()) }}
                  className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                  <option value="">Todas as empresas</option>
                  {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Status dos funcionários</label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_KEYS.map(s => (
                    <button key={s} type="button" onClick={() => toggleStatus(s)}
                      className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${statuses.has(s) ? 'bg-primary text-primary-foreground border-primary' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Funcionários */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">Funcionários ({selectedEmp.size} selecionados de {elegiveis.length})</label>
                  {elegiveis.length > 0 && (
                    <button type="button" onClick={toggleAllEmp} className="text-[11px] font-medium text-primary hover:underline">
                      {allSelected ? 'Limpar seleção' : 'Selecionar todos'}
                    </button>
                  )}
                </div>
                <div className="border rounded-lg max-h-40 overflow-y-auto divide-y">
                  {elegiveis.length === 0 && <p className="text-[12px] text-muted-foreground text-center py-3">Ajuste empresa/status para listar funcionários.</p>}
                  {elegiveis.map(e => (
                    <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 text-sm">
                      <input type="checkbox" checked={selectedEmp.has(e.id)} onChange={() => toggleEmp(e.id)} className="accent-primary" />
                      <span className="flex-1 truncate">{e.name}</span>
                      <span className="text-[10px] text-muted-foreground">{STATUS_LABELS[e.status as CandidateStatus] || e.status}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Importar de arquivo */}
              <div className="border-t pt-3">
                <label className="flex items-center gap-2 text-[12px] font-medium text-primary cursor-pointer hover:underline w-fit">
                  {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Importar perguntas de arquivo .docx
                  <input type="file" accept=".docx" className="hidden" onChange={handleDocx} disabled={importing} />
                </label>
                <p className="text-[11px] text-muted-foreground mt-1">
                  O arquivo deve conter perguntas numeradas, opções (com pesos entre parênteses, ex: &ldquo;Ótimo (10)&rdquo;) e tipo [texto]/[múltipla].
                </p>
              </div>

              {/* Perguntas */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Perguntas</label>
                  <Button type="button" variant="outline" size="sm" onClick={addQuestion} className="gap-1 h-7"><Plus className="w-3 h-3" />Pergunta</Button>
                </div>
                {questions.map((q, qi) => (
                  <div key={q.id} className="rounded-lg border p-3 space-y-2 bg-gray-50/50">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-gray-500">{qi + 1}.</span>
                      <Input value={q.text} onChange={e => updQuestion(q.id, { text: e.target.value })} placeholder="Texto da pergunta" className="h-8 text-sm flex-1" />
                      <select value={q.type} onChange={e => updQuestion(q.id, { type: e.target.value as 'texto' | 'multipla' })}
                        className="h-8 text-xs border border-gray-300 rounded-md px-1.5 bg-white">
                        <option value="multipla">Múltipla</option>
                        <option value="texto">Texto</option>
                      </select>
                      <button onClick={() => rmQuestion(q.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    {q.type === 'multipla' ? (
                      <div className="space-y-1 pl-5">
                        {q.options.map((o, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <Input value={o.text} onChange={e => updOption(q.id, oi, { text: e.target.value })} placeholder={`Opção ${oi + 1}`} className="h-7 text-sm flex-1" />
                            <Input value={o.weight} onChange={e => updOption(q.id, oi, { weight: e.target.value })} placeholder="Peso" type="number" className="h-7 text-sm w-20" title="Peso/nota" />
                            <button onClick={() => rmOption(q.id, oi)} className="text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                        <button onClick={() => addOption(q.id)} className="text-[11px] text-primary hover:underline">+ opção</button>
                      </div>
                    ) : (
                      <p className="pl-5 text-[11px] text-muted-foreground italic">Campo de resposta aberta (texto) — sem pontuação.</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Guia de resultados (IA) */}
              <div className="space-y-1.5 border-t pt-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Instruções de resultado</label>
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-primary cursor-pointer hover:underline w-fit">
                    {importingGuide ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Importar .docx
                    <input type="file" accept=".docx" className="hidden" onChange={handleGuide} disabled={importingGuide} />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Envie um arquivo com as instruções de como interpretar/pontuar e gerar os resultados. A IA interpreta e usa esse guia para analisar cada formulário preenchido. Você também pode editar o texto abaixo.
                </p>
                <textarea value={resultGuide} onChange={e => setResultGuide(e.target.value)} rows={5}
                  placeholder="Instruções de interpretação dos resultados (faixas de pontuação, perfis, recomendações...). Importe um .docx ou escreva aqui."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : editingId ? <><CheckCircle2 className="w-3.5 h-3.5" />Salvar alterações</> : <><Plus className="w-3.5 h-3.5" />Criar pesquisa</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Link/QR */}
      {linkModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 text-center">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">{linkModal.title}</h2>
              <button onClick={() => setLinkModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(surveyUrl(linkModal.token))}`} alt="QR Code" className="w-44 h-44 mx-auto rounded-lg border" />
            <div className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2">
              <span className="text-[11px] text-gray-600 truncate flex-1">{surveyUrl(linkModal.token)}</span>
              <button onClick={() => { navigator.clipboard?.writeText(surveyUrl(linkModal.token)); showToast('ok', 'Link copiado!') }} className="text-gray-400 hover:text-primary"><Copy className="w-4 h-4" /></button>
              <a href={surveyUrl(linkModal.token)} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-primary"><ExternalLink className="w-4 h-4" /></a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
