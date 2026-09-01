'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/helpers'

/** Idade em anos completos a partir de 'YYYY-MM-DD'. */
function idade(data: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data)
  if (!m) return null
  const hoje = new Date()
  let anos = hoje.getFullYear() - Number(m[1])
  const mesDia = (hoje.getMonth() + 1) * 100 + hoje.getDate()
  if (mesDia < Number(m[2]) * 100 + Number(m[3])) anos--
  return anos >= 0 && anos < 130 ? anos : null
}

/**
 * Data de nascimento na aba Ficha cadastral, editável por Master e Gestor RH.
 *
 * O dado vive na resposta do formulário (é de lá que a ficha e o Kanban leem a
 * idade), então a API grava ali — ver /api/admin/candidatos/[id]/nascimento.
 */
export function EditBirthDate({
  candidateId, initialDate,
}: {
  candidateId: string
  /** 'YYYY-MM-DD' ou null quando o candidato nunca respondeu */
  initialDate: string | null
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(initialDate ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const anos = initialDate ? idade(initialDate) : null

  async function salvar() {
    if (!valor) { setErro('Informe a data.'); return }
    setSalvando(true); setErro('')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/nascimento`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birth_date: valor }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao salvar a data de nascimento.')
      setEditando(false)
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setSalvando(false) }
  }

  if (editando) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground shrink-0">Nascimento</span>
          <div className="flex items-center gap-1">
            <input type="date" value={valor} max={new Date().toISOString().slice(0, 10)}
              onChange={e => setValor(e.target.value)}
              className="h-8 border border-gray-300 rounded-md px-2 text-sm bg-white" />
            <button onClick={salvar} disabled={salvando}
              title="Salvar" className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => { setEditando(false); setValor(initialDate ?? ''); setErro('') }}
              disabled={salvando} title="Cancelar" className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {erro && <p className="text-[11.5px] text-red-600 text-right">{erro}</p>}
      </div>
    )
  }

  return (
    <div className="flex justify-between gap-2 text-sm group">
      <span className="text-muted-foreground shrink-0">Nascimento</span>
      <span className="font-medium text-right flex items-center gap-1.5">
        {initialDate
          ? <>{formatDate(initialDate)}{anos != null ? ` (${anos} anos)` : ''}</>
          : <span className="text-muted-foreground font-normal">não informada</span>}
        <button onClick={() => setEditando(true)} title="Corrigir a data de nascimento"
          className="p-1 rounded-md text-gray-400 hover:text-primary hover:bg-gray-100">
          <Pencil className="w-3 h-3" />
        </button>
      </span>
    </div>
  )
}
