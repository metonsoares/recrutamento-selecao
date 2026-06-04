'use client'
import { useState } from 'react'
import { Loader2, Check, AlertCircle } from 'lucide-react'

interface Props { candidateId: string }

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#25D366]" aria-hidden>
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.59 5.301l-.999 3.648 3.909-1.748zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z"/>
    </svg>
  )
}

type State = 'idle' | 'sending' | 'sent' | 'error'

export function InviteInterviewButton({ candidateId }: Props) {
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function send() {
    if (state === 'sending') return
    setState('sending'); setErrorMsg('')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/invite-interview`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setState('sent')
        setTimeout(() => setState('idle'), 6000)
      } else {
        setErrorMsg(data.error || 'Falha ao enviar.')
        setState('error')
        setTimeout(() => setState('idle'), 6000)
      }
    } catch {
      setErrorMsg('Erro de conexão.')
      setState('error')
      setTimeout(() => setState('idle'), 6000)
    }
  }

  const base = 'shrink-0 inline-flex items-center gap-1.5 text-sm font-medium border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60'

  if (state === 'sent') {
    return <span className={`${base} border-emerald-300 text-emerald-700 bg-emerald-50`}><Check className="w-4 h-4" />Convite enviado</span>
  }
  if (state === 'error') {
    return (
      <button onClick={send} className={`${base} border-red-300 text-red-700 bg-red-50 hover:bg-red-100`} title={errorMsg}>
        <AlertCircle className="w-4 h-4" />{errorMsg ? `${errorMsg} — tentar de novo` : 'Erro — tentar de novo'}
      </button>
    )
  }
  return (
    <button onClick={send} disabled={state === 'sending'}
      className={`${base} border-[#25D366] text-[#128C7E] hover:bg-[#25D366]/10`}
      title="Enviar convite por WhatsApp">
      {state === 'sending' ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</> : <><WhatsAppIcon />Convidar para entrevista</>}
    </button>
  )
}
