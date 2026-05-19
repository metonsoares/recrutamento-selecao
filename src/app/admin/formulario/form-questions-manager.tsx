'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { FormQuestion, FormSection } from '@/types'
import { Plus, Pencil, Power, ChevronUp, ChevronDown, Trash2, ExternalLink } from 'lucide-react'

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
  { value: 'celular', label: 'Número de celular' },
  { value: 'cpf', label: 'CPF' },
  { value: 'cep', label: 'CEP' },
  { value: 'email', label: 'E-mail' },
  { value: 'address', label: 'Endereço completo' },
  { value: 'job_select', label: 'Vaga de Interesse (vagas cadastradas)' },
]

const defaultForm = {
  question_text: '', field_type: 'short_text', category: '',
  is_required: false, is_active: true, weight: 1, sort_order: 0,
}

export function FormQuestionsManager({
  questions: initialQuestions,
  sections,
}: {
  questions: FormQuestion[]
  sections: FormSection[]
}) {
  const [questions, setQuestions] = useState<FormQuestion[]>(initialQuestions)
  const [filterSection, setFilterSection] = useState<string>('__all__')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FormQuestion | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [moving, setMoving] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FormQuestion | null>(null)

  // All questions sorted by sort_order
  const sorted = [...questions].sort((a, b) => a.sort_order - b.sort_order)

  // Filtered display list
  const filtered = filterSection === '__all__'
    ? sorted
    : sorted.filter(q => q.category === filterSection)

  function openCreate() {
    setEditing(null)
    setForm({ ...defaultForm, sort_order: sorted.length + 1 })
    setOpen(true)
  }

  function openEdit(q: FormQuestion) {
    setEditing(q)
    setForm({
      question_text: q.question_text,
      field_type: q.field_type,
      category: q.category || '',
      is_required: q.is_required,
      is_active: q.is_active,
      weight: q.weight,
      sort_order: q.sort_order,
    })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.question_text.trim()) return
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    const data = {
      ...form,
      form_type: 'registration',
      updated_at: new Date().toISOString(),
    }

    if (editing) {
      const { data: updated } = await supabase
        .from('form_questions')
        .update(data)
        .eq('id', editing.id)
        .select('*')
        .single()
      if (updated) {
        setQuestions(prev => prev.map(q => q.id === editing.id ? (updated as FormQuestion) : q))
      }
    } else {
      const { data: inserted } = await supabase
        .from('form_questions')
        .insert({ ...data, created_at: new Date().toISOString() })
        .select('*')
        .single()
      if (inserted) {
        setQuestions(prev => [...prev, inserted as FormQuestion])
      }
    }

    setSaving(false)
    setOpen(false)
  }

  async function toggleActive(q: FormQuestion) {
    // Optimistic update first
    setQuestions(prev => prev.map(item =>
      item.id === q.id ? { ...item, is_active: !item.is_active } : item
    ))
    const supabase = createSupabaseBrowserClient()
    await supabase.from('form_questions').update({ is_active: !q.is_active }).eq('id', q.id)
  }

  async function moveQuestion(q: FormQuestion, direction: 'up' | 'down') {
    const idx = sorted.findIndex(x => x.id === q.id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= sorted.length) return

    const target = sorted[targetIdx]
    setMoving(q.id)

    // Optimistic swap
    setQuestions(prev => prev.map(item => {
      if (item.id === q.id) return { ...item, sort_order: target.sort_order }
      if (item.id === target.id) return { ...item, sort_order: q.sort_order }
      return item
    }))

    const supabase = createSupabaseBrowserClient()
    await Promise.all([
      supabase.from('form_questions').update({ sort_order: target.sort_order }).eq('id', q.id),
      supabase.from('form_questions').update({ sort_order: q.sort_order }).eq('id', target.id),
    ])
    setMoving(null)
  }

  async function handleDelete(q: FormQuestion) {
    setQuestions(prev => prev.filter(item => item.id !== q.id))
    setConfirmDelete(null)
    const supabase = createSupabaseBrowserClient()
    await supabase.from('form_questions').delete().eq('id', q.id)
  }

  function getSectionLabel(category: string | null) {
    if (!category) return '—'
    const sec = sections.find(s => s.category === category)
    return sec ? sec.name : category
  }

  function getTypeLabel(fieldType: string) {
    return FIELD_TYPES.find(t => t.value === fieldType)?.label || fieldType
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl">

      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Perguntas do Formulário</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {sorted.length} {sorted.length === 1 ? 'pergunta configurada' : 'perguntas configuradas'}
            {' '}· Exibidas em{' '}
            <a
              href="/curriculo"
              target="_blank"
              className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
            >
              /curriculo <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter by Seção */}
          <Select value={filterSection} onValueChange={v => v && setFilterSection(v)}>
            <SelectTrigger className="w-44 text-sm">
              <SelectValue placeholder="Filtrar por Seção" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as Seções</SelectItem>
              {sections.map(s => (
                <SelectItem key={s.id} value={s.category || s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Nova Pergunta</span>
            <span className="sm:hidden">Nova</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-3 py-3 font-medium text-muted-foreground w-20">Ordem</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pergunta</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Tipo</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Seção</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  {filterSection !== '__all__'
                    ? 'Nenhuma pergunta nesta seção.'
                    : <>Nenhuma pergunta configurada.{' '}
                        <button onClick={openCreate} className="text-primary underline">Criar a primeira</button>
                      </>
                  }
                </td>
              </tr>
            ) : (
              filtered.map((q) => {
                const globalIdx = sorted.findIndex(x => x.id === q.id)
                return (
                  <tr key={q.id} className={`border-b last:border-0 hover:bg-muted/10 transition-colors ${moving === q.id ? 'opacity-50' : ''}`}>
                    {/* Order + arrows */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => moveQuestion(q, 'up')}
                            disabled={globalIdx === 0 || !!moving}
                            className="p-0.5 rounded hover:bg-[#f0f0f0] disabled:opacity-20 transition-colors"
                          >
                            <ChevronUp className="w-3.5 h-3.5 text-[#555]" />
                          </button>
                          <button
                            onClick={() => moveQuestion(q, 'down')}
                            disabled={globalIdx === sorted.length - 1 || !!moving}
                            className="p-0.5 rounded hover:bg-[#f0f0f0] disabled:opacity-20 transition-colors"
                          >
                            <ChevronDown className="w-3.5 h-3.5 text-[#555]" />
                          </button>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground w-5 text-center">
                          {q.sort_order}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <p className="line-clamp-1 font-medium">{q.question_text}</p>
                      {q.is_required && <span className="text-xs text-red-500">Obrigatória</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                        {getTypeLabel(q.field_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                      {getSectionLabel(q.category)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={q.is_active ? 'default' : 'secondary'}>
                        {q.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(q)} title="Editar">
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(q)} title={q.is_active ? 'Desativar' : 'Ativar'}>
                          <Power className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setConfirmDelete(q)}
                          title="Remover"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog: Nova / Editar Pergunta */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Pergunta' : 'Nova Pergunta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            <div className="space-y-1">
              <Label>Pergunta *</Label>
              <Input
                value={form.question_text}
                onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))}
                placeholder="Digite a pergunta..."
                className="text-base"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de Campo</Label>
                <Select value={form.field_type} onValueChange={v => v && setForm(f => ({ ...f, field_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Seção</Label>
                <Select
                  value={form.category || '__none__'}
                  onValueChange={v => setForm(f => ({ ...f, category: (!v || v === '__none__') ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Selecionar seção..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem seção</SelectItem>
                    {sections.map(s => (
                      <SelectItem key={s.id} value={s.category || s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="text-base"
                />
              </div>
              <div className="space-y-1">
                <Label>Peso (análise IA)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.weight}
                  onChange={e => setForm(f => ({ ...f, weight: Number(e.target.value) }))}
                  className="text-base"
                />
              </div>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_required}
                  onChange={e => setForm(f => ({ ...f, is_required: e.target.checked }))}
                  className="w-4 h-4"
                />
                Obrigatória
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4"
                />
                Ativa
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !form.question_text.trim()}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Remover pergunta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover a pergunta:{' '}
            <strong>&quot;{confirmDelete?.question_text}&quot;</strong>?
            Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              <Trash2 className="w-4 h-4 mr-1" />Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
