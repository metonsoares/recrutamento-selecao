'use client'
import { useState, useEffect } from 'react'
import { Loader2, Check, AlertCircle, X, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props { candidateId: string }

interface Recruiter { id: string; name: string; phone: string | null }

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#25D366]" aria-hidden>
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.59 5.301l-.999 3.648 3.909-1.748zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z"/>
    </svg>
  )
}

export function NotifyRecruiterButton({ candidateId }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recruiters, setRecruiters] = useState<Recruiter[]>([])
  const [recruiterId, setRecruiterId] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [doneName, setDoneName] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/admin/interviews/interviewers')
      .then(r => r.json())
      .then(d => setRecruiters((d.interviewers || []).map((i: { id: string; name: string; phone: string | null }) => ({ id: i.id, name: i.name, phone: i.phone }))))
      .catch(() => setError('Erro ao carregar recrutadores.'))
      .finally(() => setLoading(false))
  }, [open])

  const selected = recruiters.find(r => r.id === recruiterId)

  async function send() {
    setError('')
    if (!recruiterId) { setError('Selecione um recrutador.'); return }
    if (selected && !selected.phone) { setError('Este recrutador não tem WhatsApp cadastrado.'); return }
    setSending(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/notify-recruiter`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recruiter_id: recruiterId }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { setError(d.error || 'Erro ao enviar notificação.'); return }
      setDoneName(d.recruiter || selected?.name || 'recrutador')
    } catch { setError('Erro ao enviar notificação.') } finally { setSending(false) }
  }

  function close() {
    setOpen(false); setRecruiterId(''); setError(''); setDoneName('')
  }

  const base = 'shrink-0 inline-flex items-center gap-1.5 text-sm font-medium border rounded-lg px-3 py-1.5 transition-colors'

  return (
    <>
      <button onClick={() => setOpen(true)} className={`${base} border-[#25D366] text-[#128C7E] hover:bg-[#25D366]/10`} title="Notificar um recrutador por WhatsApp">
        <WhatsAppIcon />Notificar recrutador
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-gray-900">Notificar recrutador</h2>
              <button onClick={close} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>

            {doneName ? (
              <div className="px-5 py-6 space-y-3 text-center">
                <Check className="w-12 h-12 text-emerald-500 mx-auto" />
                <p className="text-sm font-medium text-gray-900">Notificação enviada!</p>
                <p className="text-[12px] text-muted-foreground">{doneName} recebeu por WhatsApp as informações do candidato e o parecer da IA.</p>
                <Button onClick={close} className="w-full">Concluir</Button>
              </div>
            ) : loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="px-5 py-4 space-y-3">
                  <p className="text-[12px] text-muted-foreground">
                    Selecione o recrutador. Ele receberá no WhatsApp uma mensagem com o nome, idade, vaga e o parecer da IA deste candidato.
                  </p>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Recrutador *</label>
                    <select value={recruiterId} onChange={e => { setRecruiterId(e.target.value); setError('') }} className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                      <option value="">Selecione...</option>
                      {recruiters.map(r => (
                        <option key={r.id} value={r.id} disabled={!r.phone}>
                          {r.name}{!r.phone ? ' — sem WhatsApp' : ''}
                        </option>
                      ))}
                    </select>
                    {recruiters.length === 0 && <p className="text-[11px] text-amber-600">Nenhum recrutador cadastrado. Cadastre em Agenda de entrevistas → Entrevistadores.</p>}
                    {selected && !selected.phone && (
                      <p className="text-[11px] text-amber-600">Este recrutador não tem WhatsApp. Adicione o número em Agenda de entrevistas → Entrevistadores.</p>
                    )}
                    {selected && selected.phone && (
                      <p className="text-[11px] text-muted-foreground">WhatsApp: {selected.phone}</p>
                    )}
                  </div>

                  {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
                </div>
                <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
                  <Button variant="outline" onClick={close} disabled={sending}>Cancelar</Button>
                  <Button onClick={send} disabled={sending || !recruiterId || (!!selected && !selected.phone)} className="gap-1.5">
                    {sending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enviando...</> : <><Send className="w-3.5 h-3.5" />Enviar notificação</>}
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
