'use client'
import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarClock, Plus, Trash2, Loader2, X, Settings2, MapPin, User, Clock,
  CheckCircle2, AlertCircle, Phone, Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'SÃ¡b']

interface Win { weekday: number; start: string; end: string }
interface Location { id: string; name: string; address: string | null }
interface Interviewer { id: string; name: string; phone: string | null; windows: Win[] }
interface Interview {
  id: string; candidate_id: string; interviewer_id: string | null; location_id: string | null
  scheduled_at: string; duration_min: number; status: string; notes: string | null; cancel_reason?: string | null
  candidates: { full_name: string; phone: string | null } | null
  interviewers: { name: string; phone: string | null } | null
  interview_locations: { name: string; address: string | null } | null
}
interface Props {
  initialLocations: Location[]
  initialInterviewers: Interviewer[]
  initialInterviews: Interview[]
}

const TZ = 'America/Sao_Paulo'
function fmtDateKey(iso: string) { return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: TZ }) }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) }

export function AgendaManager({ initialLocations, initialInterviewers, initialInterviews }: Props) {
  const router = useRouter()
  const [locations, setLocations] = useState<Location[]>(initialLocations)
  const [interviewers, setInterviewers] = useState<Interviewer[]>(initialInterviewers)
  const [interviews, setInterviews] = useState<Interview[]>(initialInterviews)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [view, setView] = useState<'dia' | 'entrevistador'>('entrevistador')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 3500) }

  // Agrupa entrevistas por dia (ordenadas)
  const grouped = useMemo(() => {
    const sorted = [...interviews].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    const map = new Map<string, Interview[]>()
    for (const it of sorted) {
      const key = it.scheduled_at.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return Array.from(map.entries())
  }, [interviews])

  // Agrupa por entrevistador â†’ por dia
  const byInterviewer = useMemo(() => {
    const sorted = [...interviews].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    const map = new Map<string, { name: string; items: Interview[] }>()
    for (const it of sorted) {
      const key = it.interviewer_id || 'sem'
      const name = it.interviewers?.name || 'Sem entrevistador'
      if (!map.has(key)) map.set(key, { name, items: [] })
      map.get(key)!.items.push(it)
    }
    // inclui entrevistadores sem agendamentos
    for (const iv of interviewers) if (!map.has(iv.id)) map.set(iv.id, { name: iv.name, items: [] })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [interviews, interviewers])

  async function deleteInterview(id: string) {
    const res = await fetch(`/api/admin/interviews/${id}`, { method: 'DELETE' })
    if (res.ok) { setInterviews(p => p.filter(i => i.id !== id)); showToast('ok', 'Agendamento removido.') }
    else showToast('err', 'Erro ao remover.')
  }
  // Confirmação em 2 cliques (evita confirm() bloqueante / INP)
  function requestDelete(id: string) {
    if (pendingDelete === id) {
      if (pendingTimer.current) clearTimeout(pendingTimer.current)
      setPendingDelete(null)
      deleteInterview(id)
    } else {
      setPendingDelete(id)
      if (pendingTimer.current) clearTimeout(pendingTimer.current)
      pendingTimer.current = setTimeout(() => setPendingDelete(null), 3000)
    }
  }

  function statusBadge(s: string) {
    if (s === 'realizada') return 'bg-emerald-100 text-emerald-700'
    if (s === 'cancelada') return 'bg-red-100 text-red-700'
    return 'bg-blue-100 text-blue-700'
  }
  function statusLabel(s: string) {
    if (s === 'realizada') return 'Realizada'
    if (s === 'cancelada') return 'Agendamento cancelado'
    return 'Agendada'
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarClock className="w-6 h-6 text-[#333]" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Agenda de entrevistas</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{interviews.length} entrevista{interviews.length !== 1 ? 's' : ''} agendada{interviews.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConfigOpen(true)} className="gap-1.5"><Settings2 className="w-4 h-4" />Configurar</Button>
        </div>
      </div>

      {/* Seletor de visÃ£o */}
      {interviews.length > 0 && (
        <div className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-lg text-sm">
          <button onClick={() => setView('entrevistador')} className={`px-3 py-1 rounded-md transition-colors ${view === 'entrevistador' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500'}`}>Por entrevistador</button>
          <button onClick={() => setView('dia')} className={`px-3 py-1 rounded-md transition-colors ${view === 'dia' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500'}`}>Por dia</button>
        </div>
      )}

      {/* VisÃ£o por entrevistador */}
      {interviews.length > 0 && view === 'entrevistador' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {byInterviewer.map(group => (
            <div key={group.name} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="px-5 py-2.5 bg-gray-50 border-b flex items-center gap-2">
                <User className="w-4 h-4 text-[#333]" />
                <h2 className="text-sm font-bold text-gray-900 flex-1">{group.name}</h2>
                <span className="text-[11px] font-semibold text-muted-foreground bg-white border px-2 py-0.5 rounded-full">{group.items.length}</span>
              </div>
              {group.items.length === 0 ? (
                <p className="text-[12px] text-muted-foreground text-center py-5">Nenhuma entrevista agendada.</p>
              ) : (
                <div className="divide-y">
                  {group.items.map(it => (
                    <div key={it.id} onClick={() => it.candidate_id && router.push(`/admin/candidatos/${it.candidate_id}`)}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                      <div className="w-14 shrink-0 text-center">
                        <p className="text-sm font-bold text-gray-900">{fmtTime(it.scheduled_at)}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(it.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ })}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-sm font-medium truncate ${it.status === 'cancelada' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{it.candidates?.full_name || 'Candidato'}</p>
                          {it.status === 'cancelada' && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">Cancelado</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                          {it.candidates?.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{it.candidates.phone}</span>}
                          {it.interview_locations?.name && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{it.interview_locations.name}</span>}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); requestDelete(it.id) }}
                        className={`shrink-0 rounded-lg transition-colors ${pendingDelete === it.id ? 'px-2 py-1 text-[11px] font-medium bg-red-600 text-white' : 'p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                        title="Remover">
                        {pendingDelete === it.id ? 'Confirmar' : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Agenda por dia */}
      {(interviews.length === 0 || view === 'dia') && (grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 bg-white rounded-2xl border">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center"><CalendarClock className="w-7 h-7 text-gray-300" /></div>
          <p className="font-medium text-gray-600">Nenhuma entrevista agendada</p>
          <p className="text-sm text-muted-foreground">As entrevistas aparecem aqui quando os candidatos agendam pelo link enviado no convite.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, items]) => (
            <div key={day} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="px-5 py-2.5 bg-gray-50 border-b">
                <h2 className="text-sm font-bold text-gray-900 capitalize">{fmtDateKey(items[0].scheduled_at)}</h2>
              </div>
              <div className="divide-y">
                {items.map(it => (
                  <div key={it.id} onClick={() => it.candidate_id && router.push(`/admin/candidatos/${it.candidate_id}`)}
                    className="flex items-start gap-4 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="w-16 shrink-0 text-center">
                      <p className="text-base font-bold text-gray-900">{fmtTime(it.scheduled_at)}</p>
                      <p className="text-[10px] text-muted-foreground">{it.duration_min} min</p>
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{it.candidates?.full_name || 'Candidato'}</p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusBadge(it.status)}`}>{statusLabel(it.status)}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-muted-foreground">
                        {it.candidates?.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{it.candidates.phone}</span>}
                        {it.interviewers?.name && <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{it.interviewers.name}</span>}
                        {it.interview_locations?.name && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{it.interview_locations.name}</span>}
                      </div>
                      {it.status === 'cancelada' && it.cancel_reason && <p className="text-[12px] text-red-600 mt-0.5">Motivo: {it.cancel_reason}</p>}
                      {it.notes && <p className="text-[12px] text-gray-600 mt-0.5">{it.notes}</p>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); requestDelete(it.id) }}
                      className={`shrink-0 rounded-lg transition-colors ${pendingDelete === it.id ? 'px-2 py-1 text-[11px] font-medium bg-red-600 text-white' : 'p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                      title="Remover">
                      {pendingDelete === it.id ? 'Confirmar' : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {configOpen && (
        <ConfigModal
          locations={locations} setLocations={setLocations}
          interviewers={interviewers} setInterviewers={setInterviewers}
          onClose={() => setConfigOpen(false)} showToast={showToast}
        />
      )}

    </div>
  )
}

// â”€â”€â”€ Modal de configuraÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ConfigModal({ locations, setLocations, interviewers, setInterviewers, onClose, showToast }: {
  locations: Location[]; setLocations: React.Dispatch<React.SetStateAction<Location[]>>
  interviewers: Interviewer[]; setInterviewers: React.Dispatch<React.SetStateAction<Interviewer[]>>
  onClose: () => void; showToast: (t: 'ok' | 'err', m: string) => void
}) {
  const [locName, setLocName] = useState(''); const [locAddr, setLocAddr] = useState('')
  const [intName, setIntName] = useState(''); const [intPhone, setIntPhone] = useState('')
  const [busy, setBusy] = useState(false)

  async function addLocation() {
    if (!locName.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/interviews/locations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: locName, address: locAddr }) })
      const d = await res.json(); if (!res.ok) { showToast('err', d.error || 'Erro.'); return }
      setLocations(p => [...p, d.location]); setLocName(''); setLocAddr('')
    } finally { setBusy(false) }
  }
  async function delLocation(id: string) {
    const res = await fetch(`/api/admin/interviews/locations/${id}`, { method: 'DELETE' })
    if (res.ok) setLocations(p => p.filter(l => l.id !== id)); else showToast('err', 'Erro ao remover.')
  }
  async function addInterviewer() {
    if (!intName.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/interviews/interviewers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: intName, phone: intPhone, windows: [] }) })
      const d = await res.json(); if (!res.ok) { showToast('err', d.error || 'Erro.'); return }
      setInterviewers(p => [...p, d.interviewer]); setIntName(''); setIntPhone('')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">Configurar entrevistas</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-6">
          {/* Locais */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><MapPin className="w-4 h-4" />Locais de entrevista</h3>
            <div className="space-y-1.5">
              {locations.map(l => (
                <div key={l.id} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{l.name}</p>
                    {l.address && <p className="text-[12px] text-muted-foreground">{l.address}</p>}
                  </div>
                  <button onClick={() => delLocation(l.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-end pt-1">
              <div className="flex-1 min-w-[140px] space-y-1"><label className="text-xs text-gray-600">Nome do local *</label><Input value={locName} onChange={e => setLocName(e.target.value)} placeholder="Ex: Loja Centro" className="h-9" /></div>
              <div className="flex-1 min-w-[140px] space-y-1"><label className="text-xs text-gray-600">EndereÃ§o</label><Input value={locAddr} onChange={e => setLocAddr(e.target.value)} placeholder="Rua, nÂº, bairro" className="h-9" /></div>
              <Button onClick={addLocation} disabled={busy || !locName.trim()} className="gap-1 h-9"><Plus className="w-4 h-4" />Adicionar</Button>
            </div>
          </div>

          {/* Entrevistadores */}
          <div className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><User className="w-4 h-4" />Entrevistadores</h3>
            <div className="space-y-2">
              {interviewers.map(it => (
                <InterviewerCard key={it.id} interviewer={it}
                  onSaved={(upd) => setInterviewers(p => p.map(x => x.id === upd.id ? upd : x))}
                  onDeleted={() => setInterviewers(p => p.filter(x => x.id !== it.id))}
                  showToast={showToast} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-end pt-1">
              <div className="flex-1 min-w-[140px] space-y-1"><label className="text-xs text-gray-600">Nome *</label><Input value={intName} onChange={e => setIntName(e.target.value)} placeholder="Nome do entrevistador" className="h-9" /></div>
              <div className="flex-1 min-w-[140px] space-y-1"><label className="text-xs text-gray-600">Telefone</label><Input value={intPhone} onChange={e => setIntPhone(e.target.value)} placeholder="(00) 00000-0000" className="h-9" /></div>
              <Button onClick={addInterviewer} disabled={busy || !intName.trim()} className="gap-1 h-9"><Plus className="w-4 h-4" />Adicionar</Button>
            </div>
          </div>
        </div>
        <div className="flex justify-end px-5 py-3 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
          <Button onClick={onClose}>Concluir</Button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Card de entrevistador (com janelas de horÃ¡rio) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function InterviewerCard({ interviewer, onSaved, onDeleted, showToast }: {
  interviewer: Interviewer; onSaved: (i: Interviewer) => void; onDeleted: () => void; showToast: (t: 'ok' | 'err', m: string) => void
}) {
  const [name, setName] = useState(interviewer.name)
  const [phone, setPhone] = useState(interviewer.phone || '')
  const [windows, setWindows] = useState<Win[]>(interviewer.windows || [])
  const [wDay, setWDay] = useState('1'); const [wStart, setWStart] = useState('09:00'); const [wEnd, setWEnd] = useState('12:00')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  function addWindow() {
    if (!wStart || !wEnd) return
    setWindows(p => [...p, { weekday: Number(wDay), start: wStart, end: wEnd }].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)))
  }
  function rmWindow(i: number) { setWindows(p => p.filter((_, idx) => idx !== i)) }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/interviews/interviewers/${interviewer.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone, windows }) })
      const d = await res.json(); if (!res.ok) { showToast('err', d.error || 'Erro.'); return }
      onSaved(d.interviewer); setEditing(false); showToast('ok', 'Entrevistador salvo.')
    } finally { setSaving(false) }
  }
  async function del() {
    if (!confirm('Remover este entrevistador?')) return
    const res = await fetch(`/api/admin/interviews/interviewers/${interviewer.id}`, { method: 'DELETE' })
    if (res.ok) onDeleted(); else showToast('err', 'Erro ao remover.')
  }

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-gray-50/40">
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-8 text-sm flex-1" placeholder="Nome" />
            <Input value={phone} onChange={e => setPhone(e.target.value)} className="h-8 text-sm w-40" placeholder="Telefone" />
          </>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">{interviewer.name}</p>
            {interviewer.phone && <p className="text-[12px] text-muted-foreground inline-flex items-center gap-1"><Phone className="w-3 h-3" />{interviewer.phone}</p>}
          </div>
        )}
        {!editing && <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-primary" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>}
        <button onClick={del} className="text-gray-400 hover:text-red-500" title="Remover"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>

      {/* Janelas de horÃ¡rio */}
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Disponibilidade</p>
        {windows.length === 0 && <p className="text-[12px] text-muted-foreground">Nenhuma janela definida.</p>}
        <div className="flex flex-wrap gap-1.5">
          {windows.map((w, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-white border rounded-full px-2 py-0.5">
              <Clock className="w-3 h-3 text-gray-400" />{WEEKDAYS[w.weekday]} {w.start}â€“{w.end}
              <button onClick={() => rmWindow(i)} className="text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-1.5 pt-1">
          <select value={wDay} onChange={e => setWDay(e.target.value)} className="h-8 text-xs border border-gray-300 rounded-md px-1.5 bg-white">
            {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <input type="time" value={wStart} onChange={e => setWStart(e.target.value)} className="h-8 text-xs border border-gray-300 rounded-md px-1.5 bg-white" />
          <span className="text-xs text-gray-400">atÃ©</span>
          <input type="time" value={wEnd} onChange={e => setWEnd(e.target.value)} className="h-8 text-xs border border-gray-300 rounded-md px-1.5 bg-white" />
          <Button type="button" size="sm" variant="outline" onClick={addWindow} className="h-8 gap-1"><Plus className="w-3 h-3" />Janela</Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving} className="h-7 gap-1">
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : <><CheckCircle2 className="w-3.5 h-3.5" />Salvar</>}
        </Button>
      </div>
    </div>
  )
}
