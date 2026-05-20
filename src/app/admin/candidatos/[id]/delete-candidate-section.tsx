'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'

export function DeleteCandidateSection({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setStep('deleting')
    setError(null)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Erro ao remover candidato.')
        setStep('confirm')
        return
      }
      router.push('/admin/candidatos')
    } catch {
      setError('Erro de conexão. Tente novamente.')
      setStep('confirm')
    }
  }

  return (
    <div className="border border-red-200 rounded-xl bg-red-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
        <p className="text-sm font-semibold text-red-700">Zona de Perigo</p>
      </div>

      <p className="text-sm text-red-600">
        Remover o currículo de <strong>{candidateName}</strong> apagará permanentemente todos os dados
        cadastrados: candidaturas, respostas de formulário, teste cultural, notas internas e histórico.
        Essa ação <strong>não pode ser desfeita</strong>.
      </p>

      {error && (
        <p className="text-sm text-red-700 bg-red-100 border border-red-300 rounded px-3 py-2">{error}</p>
      )}

      {step === 'idle' && (
        <Button
          variant="outline"
          size="sm"
          className="border-red-300 text-red-600 hover:bg-red-100 hover:text-red-800 gap-1.5"
          onClick={() => setStep('confirm')}
        >
          <Trash2 className="w-4 h-4" />
          Remover Currículo
        </Button>
      )}

      {step === 'confirm' && (
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-red-700">Confirmar exclusão permanente?</p>
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white gap-1"
            onClick={handleDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Sim, apagar tudo
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setStep('idle'); setError(null) }}>
            Cancelar
          </Button>
        </div>
      )}

      {step === 'deleting' && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Removendo todos os dados...
        </div>
      )}
    </div>
  )
}
