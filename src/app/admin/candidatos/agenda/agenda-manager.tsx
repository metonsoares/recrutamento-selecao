'use client'
import { useState, useMemo } from 'react'
import {
  CalendarClock, Plus, Trash2, Loader2, X, Settings2, MapPin, User, Clock,
  CheckCircle2, AlertCircle, Phone, Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

interface Win { weekday: number; start: string; end: string }
interface Location { id: string; name: string; address: string | null }
interface Interviewer { id: string; name: string; phone: string | null; windows: Win[] }
interface Interview {
  id: string; candidate_id: string; interviewer_id: string | null; location_id: string | null
  scheduled_at: string; duration_min: number; status: string; notes: string | null
  candidates: { full_name: string; phone: string | null } | null
  interviewers: { name: string; phone: string | null } | null
  interview_locations: { name: string; address: string | null } | null
}
interface CandidateOpt { id: string; name: string; phone: string | null; status: string }

interface Props {
  initialLocations: Location[]
  initialInterviewers: Interviewer[]
  initialInterviews: Interview[]
  candidates: CandidateOpt[]
}

const TZ = 'America/Sao_Paulo'
function fmtDateKey(iso: string) { return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: TZ }) }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) }

const SLOT_MIN = 30
/** Quantidade de slots de 30 min nas janelas do entrevistador para um dia da semana. */
function slotCount(windows: Win[], weekday: number): number {
  let n = 0
  for (const w of windows.filter(w => Number(w.weekday) === weekday)) {
    const [sh, sm] = w.start.split(':').map(Number)
    const [eh, em] = w.end.split(':').map(Number)
    n += Math.max(0, Math.floor(((eh * 60 + em) - (sh * 60 + sm)) / SLOT_MIN))
  }
  return n
}

export function AgendaManager({ initialLocations, initialInterviewers, initialInterviews, candidates }: Props) {
  const [locations, setLocations] = useState<Location[]>(initialLocations)
  const [interviewers, setInterviewers] = useState<Interviewer[]>(initialInterviewers)
  const [interviews, setInterviews] = useState<Interview[]>(initialInterviews)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [schedOpen, setSchedOpen] = useState(false)

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

  async function deleteInterview(id: string) {
    if (!confirm('Remover este agendamento?')) return
    const res = await fetch(`/api/admin/interviews/${id}`, { method: 'DELETE' })
    if (res.ok) { setInterviews(p => p.filter(i => i.id !== id)); showToast('ok', 'Agendamento removido.') }
    else showToast('err', 'Erro ao remover.')
  }

  function statusBadge(s: string) {
    if (s === 'realizada') return 'bg-emerald-100 text-emerald-700'
    if (s === 'cancelada') return 'bg-red-100 text-red-700'
    return 'bg-blue-100 text-blue-700'
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
          <Button onClick={() => setSchedOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" />Agendar entrevista</Button>
        </div>
      </div>

      {/* Agenda */}
      {grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 bg-white rounded-2xl border">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center"><CalendarClock className="w-7 h-7 text-gray-300" /></div>
          <p className="font-medium text-gray-600">Nenhuma entrevista agendada</p>
          <p className="text-sm text-muted-foreground">Configure local e entrevistadores e clique em &ldquo;Agendar entrevista&rdquo;.</p>
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
                  <div key={it.id} className="flex items-start gap-4 px-5 py-3.5">
                    <div className="w-16 shrink-0 text-center">
                      <p className="text-base font-bold text-gray-900">{fmtTime(it.scheduled_at)}</p>
                      <p className="text-[10px] text-muted-foreground">{it.duration_min} min</p>
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{it.candidates?.full_name || 'Candidato'}</p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusBadge(it.status)}`}>{it.status}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-muted-foreground">
                        {it.candidates?.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{it.candidates.phone}</span>}
                        {it.interviewers?.name && <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{it.interviewers.name}</span>}
                        {it.interview_locations?.name && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{it.interview_locations.name}</span>}
                      </div>
                      {it.notes && <p className="text-[12px] text-gray-600 mt-0.5">{it.notes}</p>}
                    </div>
                    <button onClick={() => deleteInterview(it.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0" title="Remover"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {configOpen && (
        <ConfigModal
          locations={locations} setLocations={setLocations}
          interviewers={interviewers} setInterviewers={setInterviewers}
          onClose={() => setConfigOpen(false)} showToast={showToast}
        />
      )}

      {schedOpen && (
        <ScheduleModal
          candidates={candidates} locations={locations} interviewers={interviewers} interviews={interviews}
          onClose={() => setSchedOpen(false)}
          onCreated={(iv) => { setInterviews(p => [...p, iv]); showToast('ok', 'Entrevista agendada.') }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ─── Modal de configuração ──────────────────────────────────────────────────
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
              <div className="flex-1 min-w-[140px] space-y-1"><label className="text-xs text-gray-600">Endereço</label><Input value={locAddr} onChange={e => setLocAddr(e.target.value)} placeholder="Rua, nº, bairro" className="h-9" /></div>
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

// ─── Card de entrevistador (com janelas de horário) ─────────────────────────
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

      {/* Janelas de horário */}
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Disponibilidade</p>
        {windows.length === 0 && <p className="text-[12px] text-muted-foreground">Nenhuma janela definida.</p>}
        <div className="flex flex-wrap gap-1.5">
          {windows.map((w, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-white border rounded-full px-2 py-0.5">
              <Clock className="w-3 h-3 text-gray-400" />{WEEKDAYS[w.weekday]} {w.start}–{w.end}
              <button onClick={() => rmWindow(i)} className="text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-1.5 pt-1">
          <select value={wDay} onChange={e => setWDay(e.target.value)} className="h-8 text-xs border border-gray-300 rounded-md px-1.5 bg-white">
            {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <input type="time" value={wStart} onChange={e => setWStart(e.target.value)} className="h-8 text-xs border border-gray-300 rounded-md px-1.5 bg-white" />
          <span className="text-xs text-gray-400">até</span>
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

// ─── Modal de agendamento ───────────────────────────────────────────────────
function ScheduleModal({ candidates, locations, interviewers, interviews, onClose, onCreated, showToast }: {
  candidates: CandidateOpt[]; locations: Location[]; interviewers: Interviewer[]; interviews: Interview[]
  onClose: () => void; onCreated: (iv: Interview) => void; showToast: (t: 'ok' | 'err', m: string) => void
}) {
  const [candidateId, setCandidateId] = useState('')
  const [interviewerId, setInterviewerId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedInterviewer = interviewers.find(i => i.id === interviewerId)

  // Capacidade e ocupação do dia escolhido
  const capacityInfo = useMemo(() => {
    if (!selectedInterviewer || !date) return null
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const capacity = slotCount(selectedInterviewer.windows || [], weekday)
    const used = interviews.filter(i =>
      i.interviewer_id === interviewerId && i.status !== 'cancelada' && i.scheduled_at.slice(0, 10) === date
    ).length
    const dayWindows = (selectedInterviewer.windows || []).filter(w => Number(w.weekday) === weekday)
    return { weekday, capacity, used, remaining: Math.max(0, capacity - used), dayWindows }
  }, [selectedInterviewer, date, interviewerId, interviews])

  async function save() {
    setError('')
    if (!candidateId) { setError('Selecione o candidato.'); return }
    if (!interviewerId) { setError('Selecione o entrevistador.'); return }
    if (!date) { setError('Informe o dia.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/interviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: candidateId, interviewer_id: interviewerId, location_id: locationId || null, date, notes }),
      })
      const d = await res.json(); if (!res.ok) { setError(d.error || 'Erro ao agendar.'); return }
      onCreated(d.interview); onClose()
    } catch { setError('Erro ao agendar.') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-gray-900">Agendar entrevista</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-[12px] text-muted-foreground bg-gray-50 border rounded-lg px-3 py-2">
            As entrevistas são por <strong>ordem de chegada</strong> (30 min cada). Basta escolher entrevistador, local e dia — o horário é distribuído automaticamente dentro da janela do entrevistador.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Candidato *</label>
            <select value={candidateId} onChange={e => setCandidateId(e.target.value)} className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
              <option value="">Selecione...</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {candidates.length === 0 && <p className="text-[11px] text-amber-600">Nenhum candidato com status &ldquo;Novo&rdquo; ou &ldquo;Apto para entrevista&rdquo;.</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Entrevistador *</label>
            <select value={interviewerId} onChange={e => setInterviewerId(e.target.value)} className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
              <option value="">Selecione...</option>
              {interviewers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            {selectedInterviewer && (
              selectedInterviewer.windows.length > 0
                ? <p className="text-[11px] text-muted-foreground">Janelas: {selectedInterviewer.windows.map(w => `${WEEKDAYS[w.weekday]} ${w.start}-${w.end}`).join(' · ')}</p>
                : <p className="text-[11px] text-amber-600">Este entrevistador ainda não tem janelas de disponibilidade. Configure antes de agendar.</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Local</label>
            <select value={locationId} onChange={e => setLocationId(e.target.value)} className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
              <option value="">Selecione...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Dia *</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" />
          </div>

          {/* Capacidade do dia */}
          {capacityInfo && (
            capacityInfo.capacity === 0 ? (
              <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />O entrevistador não atende em {WEEKDAYS[capacityInfo.weekday]}.
              </p>
            ) : (
              <div className={`text-[12px] rounded-lg px-3 py-2 border ${capacityInfo.remaining > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                <p className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 shrink-0" />
                  Capacidade do dia: <strong>{capacityInfo.capacity}</strong> entrevistas · {capacityInfo.used} agendada(s) · <strong>{capacityInfo.remaining} vaga(s)</strong>
                </p>
                {capacityInfo.remaining > 0 && <p className="mt-0.5">Próximo na fila será o nº {capacityInfo.used + 1}.</p>}
              </div>
            )
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Observações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving || capacityInfo?.remaining === 0} className="gap-1.5">
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Agendando...</> : <><CalendarClock className="w-3.5 h-3.5" />Agendar</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
