'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { FormQuestion } from '@/types'
import { Plus, Pencil, Power, GripVertical } from 'lucide-react'

const FIELD_TYPES = [
  { value: 'short_text', label: 'Texto curto' },
  { value: 'long_text', label: 'Texto longo' },
  { value: 'yes_no', label: 'Sim/Não' },
  { value: 'select', label: 'Seleção única' },
  { value: 'multiple_choice', label: 'Múltipla escolha' },
  { value: 'file_upload', label: 'Upload de arquivo' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'scale', label: 'Escala 1-5' },
]

const CATEGORIES = [
  'dados_pessoais', 'vaga_de_interesse', 'disponibilidade',
  'experiencia_profissional', 'habilidades_operacionais',
  'perfil_comportamental', 'documentos', 'perguntas_abertas',
]

const defaultForm = {
  question_text: '', field_type: 'short_text', category: '',
  is_required: false, is_active: true, weight: 1, sort_order: 0,
}

export function FormQuestionsManager({ questions }: { questions: FormQuestion[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FormQuestion | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)

  function openCreate() {
    setEditing(null)
    setForm({ ...defaultForm, sort_order: questions.length + 1 })
    setOpen(true)
  }

  function openEdit(q: FormQuestion) {
    setEditing(q)
    setForm({ question_text: q.question_text, field_type: q.field_type, category: q.category || '', is_required: q.is_required, is_active: q.is_active, weight: q.weight, sort_order: q.sort_order })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.question_text.trim()) return
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    const data = { ...form, form_type: 'experience', updated_at: new Date().toISOString() }
    if (editing) {
      await supabase.from('form_questions').update(data).eq('id', editing.id)
    } else {
      await supabase.from('form_questions').insert(data)
    }
    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  async function toggleActive(q: FormQuestion) {
    const supabase = createSupabaseBrowserClient()
    await supabase.from('form_questions').update({ is_active: !q.is_active }).eq('id', q.id)
    router.refresh()
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Formulário de Experiência</h1>
          <p className="text-muted-foreground text-sm mt-1">{questions.length} perguntas configuradas</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Nova Pergunta</Button>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-8">#</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pergunta</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Tipo</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Categoria</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {questions.map(q => (
              <tr key={q.id} className="border-b last:border-0 hover:bg-muted/10">
                <td className="px-4 py-3 text-muted-foreground">{q.sort_order}</td>
                <td className="px-4 py-3">
                  <p className="line-clamp-1">{q.question_text}</p>
                  {q.is_required && <span className="text-xs text-red-500">Obrigatória</span>}
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{FIELD_TYPES.find(t => t.value === q.field_type)?.label || q.field_type}</td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{q.category || '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={q.is_active ? 'default' : 'secondary'}>{q.is_active ? 'Ativa' : 'Inativa'}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(q)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(q)}><Power className="w-3 h-3" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Editar Pergunta' : 'Nova Pergunta'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Pergunta *</Label>
              <Input value={form.question_text} onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))} placeholder="Digite a pergunta..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de Campo</Label>
                <Select value={form.field_type} onValueChange={v => v && setForm(f => ({ ...f, field_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={v => v && setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ordem</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>Peso (análise IA)</Label>
                <Input type="number" step="0.1" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_required} onChange={e => setForm(f => ({ ...f, is_required: e.target.checked }))} />
                Obrigatória
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                Ativa
              </label>
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
