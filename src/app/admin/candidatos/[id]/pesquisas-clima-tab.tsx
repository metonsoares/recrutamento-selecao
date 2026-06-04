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

export function PesquisasClimaTab({ candidateId, isMaster, appUrl, surveys, initialAssignments }: Props) {
  const [assignments, setAssignments] = useState<ClimateAssignment[]>(initialAssignments)
  const [selectedSurvey, setSelectedSurvey] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [linkModal, setLinkModal] = useState<ClimateAssignment | null>(null)

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

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
