'use client'
import { useState, useEffect } from 'react'
import { Loader2, Check, AlertCircle, X, Copy, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props { candidateId: string }

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
interface Win { weekday: number; start: string; end: string }
interface Interviewer { id: string; name: string; phone: string | null; windows: Win[] }
interface Location { id: string; name: string; address: string | null }

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#25D366]" aria-hidden>
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.59 5.301l-.999 3.648 3.909-1.748zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z"/>
    </svg>
  )
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
function pad(n: number) { return String(n).padStart(2, '0') }
function ymd(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}` }

export function InviteInterviewButton({ candidateId }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [interviewers, setInterviewers] = useState<Interviewer[]>([])
  const [locations, setLocations] = useState<Location[]>([])

  const [interviewerId, setInterviewerId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [dates, setDates] = useState<string[]>([])
  const today = new Date()
  const [viewY, setViewY] = useState(today.getFullYear())
  const [viewM, setViewM] = useState(today.getMonth())
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [doneLink, setDoneLink] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      fetch('/api/admin/interviews/interviewers').then(r => r.json()),
      fetch('/api/admin/interviews/locations').then(r => r.json()),
    ]).then(([i, l]) => {
      setInterviewers(i.interviewers || [])
      setLocations(l.locations || [])
    }).finally(() => setLoading(false))
  }, [open])

  const selectedInterviewer = interviewers.find(i => i.id === interviewerId)
  const availableWeekdays = new Set((selectedInterviewer?.windows || []).map(w => Number(w.weekday)))

  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate())

  // Células do calendário do mês em exibição
  const firstWeekday = new Date(Date.UTC(viewY, viewM, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(viewY, viewM + 1, 0)).getUTCDate()
  const cells: ({ day: number; date: string; weekday: number } | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: ymd(viewY, viewM, d), weekday: new Date(Date.UTC(viewY, viewM, d)).getUTCDay() })

  function prevMonth() { if (viewM === 0) { setViewY(viewY - 1); setViewM(11) } else setViewM(viewM - 1) }
  function nextMonth() { if (viewM === 11) { setViewY(viewY + 1); setViewM(0) } else setViewM(viewM + 1) }
  const atFirstMonth = viewY === today.getFullYear() && viewM === today.getMonth()

  function toggleDay(date: string) {
    setError('')
    setDates(p => p.includes(date) ? p.filter(x => x !== date) : [...p, date].sort())
  }

  async function send() {
    setError('')
    if (!interviewerId) { setError('Selecione o entrevistador.'); return }
    if (dates.length === 0) { setError('Adicione ao menos um dia disponível.'); return }
    setSending(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/interview-invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewer_id: interviewerId, location_id: locationId || null, dates }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { setError(d.error || 'Erro ao enviar convite.'); if (d.link) setDoneLink(d.link); return }
      setDoneLink(d.link || '')
    } catch { setError('Erro ao enviar convite.') } finally { setSending(false) }
  }

  function close() {
    setOpen(false); setInterviewerId(''); setLocationId(''); setDates([]); setError(''); setDoneLink('')
  }

  const base = 'shrink-0 inline-flex items-center gap-1.5 text-sm font-medium border rounded-lg px-3 py-1.5 transition-colors'

  return (
    <>
      <button onClick={() => setOpen(true)} className={`${base} border-[#25D366] text-[#128C7E] hover:bg-[#25D366]/10`} title="Convidar para entrevista">
        <WhatsAppIcon />Convidar para entrevista
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-gray-900">Convidar para entrevista</h2>
              <button onClick={close} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>

            {doneLink ? (
              <div className="px-5 py-6 space-y-4 text-center">
                <Check className="w-12 h-12 text-emerald-500 mx-auto" />
                <p className="text-sm font-medium text-gray-900">Convite enviado por WhatsApp!</p>
                <p className="text-[12px] text-muted-foreground">O candidato recebeu o link para escolher o dia da entrevista.</p>
                <div className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2">
                  <span className="text-[11px] text-gray-600 truncate flex-1">{doneLink}</span>
                  <button onClick={() => navigator.clipboard?.writeText(doneLink)} className="text-gray-400 hover:text-primary"><Copy className="w-4 h-4" /></button>
                </div>
                <Button onClick={close} className="w-full">Concluir</Button>
              </div>
            ) : loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="px-5 py-4 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Entrevistador *</label>
                    <select value={interviewerId} onChange={e => { setInterviewerId(e.target.value); setDates([]) }} className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                      <option value="">Selecione...</option>
                      {interviewers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    {interviewers.length === 0 && <p className="text-[11px] text-amber-600">Nenhum entrevistador configurado. Configure em Agenda de entrevistas.</p>}
                    {selectedInterviewer && (selectedInterviewer.windows.length > 0
                      ? <p className="text-[11px] text-muted-foreground">Janelas: {selectedInterviewer.windows.map(w => `${WEEKDAYS[w.weekday]} ${w.start}-${w.end}`).join(' · ')}</p>
                      : <p className="text-[11px] text-amber-600">Este entrevistador não tem janelas. Configure antes de convidar.</p>)}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Local</label>
                    <select value={locationId} onChange={e => setLocationId(e.target.value)} className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                      <option value="">Selecione...</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Dias disponíveis * {dates.length > 0 && <span className="text-emerald-600 font-semibold">({dates.length} selecionado{dates.length !== 1 ? 's' : ''})</span>}</label>
                    {!interviewerId ? (
                      <p className="text-[12px] text-muted-foreground border rounded-lg px-3 py-3 text-center">Selecione um entrevistador para ver os dias disponíveis.</p>
                    ) : availableWeekdays.size === 0 ? (
                      <p className="text-[12px] text-amber-600 border border-amber-200 bg-amber-50 rounded-lg px-3 py-3">Este entrevistador não tem janelas configuradas.</p>
                    ) : (
                      <div className="border rounded-xl p-3">
                        {/* Navegação do mês */}
                        <div className="flex items-center justify-between mb-2">
                          <button type="button" onClick={prevMonth} disabled={atFirstMonth}
                            className="p-1 rounded-md hover:bg-gray-100 text-gray-500 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                          <span className="text-sm font-semibold text-gray-800">{MONTHS[viewM]} {viewY}</span>
                          <button type="button" onClick={nextMonth} className="p-1 rounded-md hover:bg-gray-100 text-gray-500"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                        {/* Cabeçalho dos dias da semana */}
                        <div className="grid grid-cols-7 gap-1 mb-1">
                          {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-medium text-gray-400">{d}</div>)}
                        </div>
                        {/* Grade */}
                        <div className="grid grid-cols-7 gap-1">
                          {cells.map((c, i) => {
                            if (!c) return <div key={i} />
                            const isAvailable = availableWeekdays.has(c.weekday)
                            const isPast = c.date < todayStr
                            const selectable = isAvailable && !isPast
                            const selected = dates.includes(c.date)
                            return (
                              <button key={i} type="button" disabled={!selectable} onClick={() => toggleDay(c.date)}
                                className={`h-8 rounded-md text-[12px] font-medium transition-colors ${
                                  selected ? 'bg-emerald-600 text-white'
                                  : selectable ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'text-gray-300 cursor-not-allowed'}`}>
                                {c.day}
                              </button>
                            )
                          })}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2">Dias em verde são os que o entrevistador atende. Toque para selecionar um ou mais.</p>
                      </div>
                    )}
                  </div>

                  {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
                </div>
                <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
                  <Button variant="outline" onClick={close} disabled={sending}>Cancelar</Button>
                  <Button onClick={send} disabled={sending} className="gap-1.5">
                    {sending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enviando...</> : <><WhatsAppIcon />Enviar convite</>}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
