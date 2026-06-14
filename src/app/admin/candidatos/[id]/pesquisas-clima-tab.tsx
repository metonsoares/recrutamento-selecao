'use client'
import { useState, useMemo } from 'react'
import {
  ClipboardList, Plus, Trash2, Loader2, X, Copy, QrCode, CheckCircle2, AlertCircle,
  Clock, BarChart3, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime } from '@/lib/helpers'

export interface AssignmentResponse { id: string; created_at: string; total_score: number | null; max_score: number | null }
export interface ClimateAssignment {
  id: string
  survey_id: string
  title: string
  token: string
  created_at: string
  response: AssignmentResponse | null
}
export interface SurveyOption { id: string; title: string; token: string }

interface Props {
  candidateId: string
  isMaster: boolean
  appUrl: string
  surveys: SurveyOption[]
  initialAssignments: ClimateAssignment[]
}

function WppIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} fill-current`} aria-hidden>
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.59 5.301l-.999 3.648 3.909-1.748zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z"/>
    </svg>
  )
}

export function PesquisasClimaTab({ candidateId, isMaster, appUrl, surveys, initialAssignments }: Props) {
  const [assignments, setAssignments] = useState<ClimateAssignment[]>(initialAssignments)
  const [selectedSurvey, setSelectedSurvey] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [linkModal, setLinkModal] = useState<ClimateAssignment | null>(null)

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

  async function handleSend(a: ClimateAssignment) {
    setSendingId(a.id)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/climate-assignments/${a.id}/notify`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) { showToast('err', json.error || 'Erro ao enviar a pesquisa.'); return }
      showToast('ok', 'Pesquisa enviada por WhatsApp ao funcionário.')
    } catch {
      showToast('err', 'Erro ao enviar a pesquisa.')
    } finally { setSendingId(null) }
  }

  // Pesquisas ainda não adicionadas
  const available = useMemo(() => {
    const used = new Set(assignments.map(a => a.survey_id))
    return surveys.filter(s => !used.has(s.id))
  }, [surveys, assignments])

  // Ordem cronológica de preenchimento (mais recente no topo); pendentes pela data de atribuição
  const ordered = useMemo(() => {
    return [...assignments].sort((a, b) => {
      const da = a.response?.created_at || a.created_at
      const db = b.response?.created_at || b.created_at
      return db.localeCompare(da)
    })
  }, [assignments])

  function surveyUrl(a: ClimateAssignment) { return `${appUrl || ''}/pesquisa/${a.token}?c=${candidateId}` }

  async function handleAdd() {
    if (!selectedSurvey) return
    setAdding(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/climate-assignments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ survey_id: selectedSurvey }),
      })
      const json = await res.json()
      if (!res.ok) { showToast('err', json.error || 'Erro ao adicionar.'); return }
      const a = json.assignment
      const survey = surveys.find(s => s.id === a.survey_id)
      setAssignments(prev => [{
        id: a.id, survey_id: a.survey_id,
        title: a.climate_surveys?.title || survey?.title || 'Pesquisa',
        token: a.climate_surveys?.token || survey?.token || '',
        created_at: a.created_at, response: null,
      }, ...prev])
      setSelectedSurvey('')
      showToast('ok', 'Pesquisa adicionada à ficha.')
    } finally { setAdding(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta pesquisa da ficha do funcionário?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/climate-assignments/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { showToast('err', json.error || 'Erro ao remover.'); return }
      setAssignments(prev => prev.filter(a => a.id !== id))
      showToast('ok', 'Pesquisa removida.')
    } finally { setDeletingId(null) }
  }

  return (
    <div className="max-w-3xl space-y-4">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{toast.msg}
        </div>
      )}

      <div className="flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-[#333]" />
        <div>
          <h2 className="text-base font-bold text-gray-900">Pesquisas de clima</h2>
          <p className="text-[12px] text-muted-foreground">{assignments.length} pesquisa{assignments.length !== 1 ? 's' : ''} na ficha</p>
        </div>
      </div>

      {/* Adicionar pesquisa */}
      <div className="bg-white rounded-2xl border shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px] space-y-1">
          <label className="text-xs font-medium text-gray-600">Adicionar pesquisa cadastrada</label>
          <select value={selectedSurvey} onChange={e => setSelectedSurvey(e.target.value)}
            className="h-10 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
            <option value="">{available.length ? 'Selecione uma pesquisa...' : 'Todas as pesquisas já foram adicionadas'}</option>
            {available.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
        <Button onClick={handleAdd} disabled={!selectedSurvey || adding} className="gap-1.5">
          {adding ? <><Loader2 className="w-4 h-4 animate-spin" />Adicionando...</> : <><Plus className="w-4 h-4" />Adicionar</>}
        </Button>
      </div>

      {/* Lista de pesquisas */}
      {ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 bg-white rounded-2xl border">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center"><ClipboardList className="w-7 h-7 text-gray-300" /></div>
          <p className="font-medium text-gray-600">Nenhuma pesquisa adicionada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map(a => {
            const done = !!a.response
            const pct = a.response?.max_score ? Math.round(((a.response.total_score || 0) / a.response.max_score) * 100) : null
            return (
              <div key={a.id} className="bg-white rounded-2xl border shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                      {done ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          <CheckCircle2 className="w-3 h-3" />Concluída
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                          <Clock className="w-3 h-3" />Pendente
                        </span>
                      )}
                      {pct != null && <span className="text-[11px] font-bold text-gray-600">{pct}%</span>}
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {done
                        ? `Preenchida em ${formatDateTime(a.response!.created_at)}`
                        : `Adicionada em ${formatDate(a.created_at)} — aguardando preenchimento`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!done && (
                      <button
                        onClick={() => handleSend(a)}
                        disabled={sendingId === a.id}
                        title="Enviar pesquisa por WhatsApp ao funcionário"
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-[#25D366] text-[#128C7E] hover:bg-[#25D366]/10 transition-colors disabled:opacity-60"
                      >
                        {sendingId === a.id
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enviando...</>
                          : <><WppIcon className="w-3.5 h-3.5" />Enviar pesquisa</>}
                      </button>
                    )}
                    <button onClick={() => setLinkModal(a)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5" title="Link / QR Code"><QrCode className="w-4 h-4" /></button>
                    {done && (
                      <a href={`/admin/candidatos/${candidateId}/pesquisa/${a.survey_id}`} target="_blank" rel="noreferrer"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5" title="Ver resultado"><BarChart3 className="w-4 h-4" /></a>
                    )}
                    {isMaster && (
                      <button onClick={() => handleDelete(a.id)} disabled={deletingId === a.id}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Remover">
                        {deletingId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Link/QR */}
      {linkModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 text-center">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 truncate">{linkModal.title}</h2>
              <button onClick={() => setLinkModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-[12px] text-muted-foreground">Link individual — a resposta será vinculada à ficha deste funcionário.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(surveyUrl(linkModal))}`} alt="QR Code" className="w-44 h-44 mx-auto rounded-lg border" />
            <div className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2">
              <span className="text-[11px] text-gray-600 truncate flex-1">{surveyUrl(linkModal)}</span>
              <button onClick={() => { navigator.clipboard?.writeText(surveyUrl(linkModal)); showToast('ok', 'Link copiado!') }} className="text-gray-400 hover:text-primary"><Copy className="w-4 h-4" /></button>
              <a href={surveyUrl(linkModal)} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-primary"><ExternalLink className="w-4 h-4" /></a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
