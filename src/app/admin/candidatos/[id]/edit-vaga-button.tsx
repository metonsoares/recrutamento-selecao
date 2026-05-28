'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { Pencil, Check, X, Loader2 } from 'lucide-react'

interface Props {
  applicationId: string
  currentJobId: string | null
  currentJobTitle: string | null
  jobs: { id: string; title: string }[]
}

export function EditVagaButton({ applicationId, currentJobId, currentJobTitle, jobs }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState(currentJobId || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (selected === (currentJobId || '')) { setEditing(false); return }
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    await supabase
      .from('applications')
      .update({ job_id: selected || null, updated_at: new Date().toISOString() })
      .eq('id', applicationId)
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground shrink-0">Vaga</span>
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-right">{currentJobTitle || '—'}</span>
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            title="Editar vaga"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-muted-foreground">Alterar vaga</span>
      <div className="flex items-center gap-1.5">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        >
          <option value="">— Sem vaga —</option>
          {jobs.map(j => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
        </select>
        <button
          onClick={handleSave}
          disabled={saving}
          className="p-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          title="Salvar"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => { setEditing(false); setSelected(currentJobId || '') }}
          className="p-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
          title="Cancelar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
