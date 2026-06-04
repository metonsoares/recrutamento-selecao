'use client'
import { useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, CalendarClock, MapPin, Clock, User } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface DayOption { date: string; label: string; window: string; remaining: number }

interface Props {
  token: string
  candidateName: string
  interviewerName: string
  locationName: string | null
  locationAddress: string | null
  days: DayOption[]
  alreadyScheduled: boolean
}

interface Confirm { date: string; window: string; position: number; location: string | null; locationAddress: string | null }

export function AgendarEntrevistaForm({ token, candidateName, interviewerName, locationName, locationAddress, days, alreadyScheduled }: Props) {
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  async function submit() {
    if (!selected) { setError('Selecione um dia.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/public/interview-invite/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: selected }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { setError(d.error || 'Erro ao agendar.'); return }
      setConfirm({ date: d.date, window: d.window, position: d.position, location: d.location, locationAddress: d.locationAddress })
    } catch { setError('Erro ao agendar.') } finally { setSaving(false) }
  }

  if (confirm) {
    const diaLabel = confirm.date.charAt(0).toUpperCase() + confirm.date.slice(1)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border p-5 sm:p-7 w-full max-w-sm space-y-5 text-center">
          <div className="space-y-3">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-bold text-gray-900">Entrevista agendada!</h1>
          </div>
          <div className="text-left bg-gray-50 border rounded-xl p-4 space-y-3 text-sm">
            <div className="flex items-start gap-2.5">
              <CalendarClock className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <span className="font-medium text-gray-900 break-words">{diaLabel}</span>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <span className="text-gray-900">Horário: <span className="font-medium">{confirm.window}</span></span>
            </div>
            {confirm.location && (
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <span className="text-gray-900 break-words">
                  <span className="font-medium">{confirm.location}</span>
                  {confirm.locationAddress && <span className="block text-gray-600 text-[13px] mt-0.5">{confirm.locationAddress}</span>}
                </span>
              </div>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-left">
            O atendimento é <strong>por ordem de chegada</strong>. Chegue dentro da janela de horário. Você receberá a confirmação também por WhatsApp.
          </p>
        </div>
      </div>
    )
  }

  if (alreadyScheduled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
        <div><CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" /><h1 className="text-xl font-bold text-gray-900">Entrevista já agendada</h1><p className="text-sm text-muted-foreground mt-1">Você já realizou seu agendamento por este link.</p></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="bg-white rounded-2xl border shadow-sm p-6 text-center">
          <CalendarClock className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
          <h1 className="text-xl font-bold text-gray-900">Agende sua entrevista</h1>
          {candidateName && <p className="text-sm text-muted-foreground mt-1">Olá, {candidateName.split(' ')[0]}! Selecione o melhor dia para sua entrevista presencial.</p>}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-[12px] text-muted-foreground">
            {interviewerName && <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />{interviewerName}</span>}
            {locationName && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{locationName}</span>}
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[13px] leading-relaxed text-amber-800 flex items-start gap-2">
          <Clock className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">As entrevistas são realizadas <strong>por ordem de chegada</strong> dentro da janela de horário do dia escolhido.</span>
        </div>

        {days.length === 0 ? (
          <div className="bg-white rounded-2xl border shadow-sm p-6 text-center text-sm text-muted-foreground">
            Não há dias disponíveis no momento. Entre em contato com o recrutador.
          </div>
        ) : (
          <div className="space-y-2">
            {days.map(d => {
              const full = d.remaining <= 0
              return (
                <button key={d.date} disabled={full} onClick={() => setSelected(d.date)}
                  className={`w-full text-left rounded-xl border p-4 transition-colors ${full ? 'opacity-50 cursor-not-allowed bg-gray-50' : selected === d.date ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-300' : 'bg-white hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{d.label.charAt(0).toUpperCase() + d.label.slice(1)}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">Janela: {d.window}</p>
                    </div>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${full ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {full ? 'Lotado' : `${d.remaining} vaga(s)`}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{error}</p>}

        {days.length > 0 && (
          <Button onClick={submit} disabled={saving || !selected} className="w-full h-12 text-base gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Confirmando...</> : 'Confirmar agendamento'}
          </Button>
        )}
      </div>
    </div>
  )
}
