'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { formatDateTime } from '@/lib/helpers'

interface Note {
  id: string
  note: string
  created_at: string
}

export function CandidateNotesEditor({
  candidateId,
  applicationId,
  initialNotes,
}: {
  candidateId: string
  applicationId?: string
  initialNotes: Note[]
}) {
  const router = useRouter()
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    const { data, error } = await supabase
      .from('admin_notes')
      .insert({
        candidate_id: candidateId,
        application_id: applicationId || null,
        note: text.trim(),
      })
      .select('id, note, created_at')
      .single()

    if (!error && data) {
      setNotes(prev => [data as Note, ...prev])
      setText('')
    }
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Editor */}
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Digite uma observação interna sobre este candidato..."
          rows={3}
          className="text-sm resize-none"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave()
          }}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Ctrl+Enter para salvar rápido</p>
          <Button size="sm" onClick={handleSave} disabled={saving || !text.trim()}>
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Salvando...</>
              : <><Send className="w-3.5 h-3.5 mr-1.5" />Salvar Observação</>
            }
          </Button>
        </div>
      </div>

      {/* Notes list */}
      <div className="space-y-2">
        {notes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma observação registrada.</p>
        )}
        {notes.map(n => (
          <div key={n.id} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.note}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{formatDateTime(n.created_at)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
