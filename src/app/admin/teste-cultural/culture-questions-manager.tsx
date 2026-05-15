'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { CultureQuestion } from '@/types'
import { Plus, Pencil, Power } from 'lucide-react'

const CULTURE_VALUES = [
  'qualidade sem atalho', 'hospitalidade de verdade', 'respeito', 'honestidade',
  'comprometimento', 'senso de dono', 'trabalho em equipe', 'disciplina operacional',
  'cuidado com o cliente', 'vontade de aprender', 'orgulho de fazer bem feito',
]

export function CultureQuestionsManager({ questions }: { questions: CultureQuestion[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CultureQuestion | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    question_text: '',
    optA: '', optB: '', optC: '', optD: '',
    scoreA: 0, scoreB: 10, scoreC: 0, scoreD: 0,
    ideal_answer: 'A',
    culture_value: '',
    weight: 1,
    sort_order: 0,
    is_active: true,
  })

  function openCreate() {
    setEditing(null)
    setForm({ question_text: '', optA: 'A. ', optB: 'B. ', optC: 'C. ', optD: 'D. ', scoreA: 0, scoreB: 10, scoreC: 0, scoreD: 0, ideal_answer: 'B', culture_value: '', weight: 1, sort_order: questions.length + 1, is_active: true })
    setOpen(true)
  }

  function openEdit(q: CultureQuestion) {
    setEditing(q)
    const opts = q.options || []
    const scores = q.scores || {}
    setForm({
      question_text: q.question_text,
      optA: opts[0] || '', optB: opts[1] || '', optC: opts[2] || '', optD: opts[3] || '',
      scoreA: scores['A'] || 0, scoreB: scores['B'] || 10, scoreC: scores['C'] || 0, scoreD: scores['D'] || 0,
      ideal_answer: q.ideal_answer || 'B',
      culture_value: q.culture_value || '',
      weight: q.weight,
      sort_order: q.sort_order,
      is_active: q.is_active,
    })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.question_text.trim()) return
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    const data = {
      question_text: form.question_text,
      options: [form.optA, form.optB, form.optC, form.optD].filter(Boolean),
      ideal_answer: form.ideal_answer,
      scores: { A: form.scoreA, B: form.scoreB, C: form.scoreC, D: form.scoreD },
      culture_value: form.culture_value,
      weight: form.weight,
      sort_order: form.sort_order,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      await supabase.from('culture_questions').update(data).eq('id', editing.id)
    } else {
      await supabase.from('culture_questions').insert(data)
    }
    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  async function toggleActive(q: CultureQuestion) {
    const supabase = createSupabaseBrowserClient()
    await supabase.from('culture_questions').update({ is_active: !q.is_active }).eq('id', q.id)
    router.refresh()
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teste Cultural</h1>
          <p className="text-muted-foreground text-sm mt-1">{questions.length} perguntas configuradas</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Nova Pergunta</Button>
      </div>

      <div className="space-y-3">
        {questions.map(q => (
          <div key={q.id} className="bg-white rounded-xl border shadow-sm p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground font-medium">#{q.sort_order}</span>
                  <Badge variant="outline" className="text-xs">{q.culture_value}</Badge>
                  <Badge variant={q.is_active ? 'default' : 'secondary'} className="text-xs">{q.is_active ? 'Ativa' : 'Inativa'}</Badge>
                </div>
                <p className="font-medium text-sm">{q.question_text}</p>
                <div className="mt-2 space-y-0.5">
                  {(q.options || []).map((opt, i) => {
                    const letter = ['A', 'B', 'C', 'D'][i]
                    const score = (q.scores as Record<string, number>)?.[letter] || 0
                    return (
                      <p key={i} className={`text-xs ${letter === q.ideal_answer ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
                        {opt} <span className="opacity-60">({score} pts)</span>
                      </p>
                    )
                  })}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => openEdit(q)}><Pencil className="w-3 h-3" /></Button>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(q)}><Power className="w-3 h-3" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar Pergunta' : 'Nova Pergunta'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Pergunta *</Label>
              <Textarea value={form.question_text} onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {['A', 'B', 'C', 'D'].map(letter => (
                <div key={letter} className="space-y-1">
                  <Label>Opção {letter}</Label>
                  <Input
                    value={form[`opt${letter}` as keyof typeof form] as string}
                    onChange={e => setForm(f => ({ ...f, [`opt${letter}`]: e.target.value }))}
                    placeholder={`Alternativa ${letter}`}
                  />
                  <Input
                    type="number" min={0} max={10}
                    value={form[`score${letter}` as keyof typeof form] as number}
                    onChange={e => setForm(f => ({ ...f, [`score${letter}`]: Number(e.target.value) }))}
                    placeholder="Pontuação (0-10)"
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Resposta Ideal</Label>
                <Input value={form.ideal_answer} onChange={e => setForm(f => ({ ...f, ideal_answer: e.target.value.toUpperCase() }))} maxLength={1} />
              </div>
              <div className="space-y-1">
                <Label>Valor Cultural</Label>
                <select
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  value={form.culture_value}
                  onChange={e => setForm(f => ({ ...f, culture_value: e.target.value }))}
                >
                  <option value="">Selecionar...</option>
                  {CULTURE_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Ordem</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
