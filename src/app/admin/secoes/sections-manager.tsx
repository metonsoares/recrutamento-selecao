'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { FormSection, FormQuestion } from '@/types'
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown,
  ChevronRight, GripVertical, Power, ClipboardList,
} from 'lucide-react'

// ─── Field types ────────────────────────────────────────────────────────────

const FIELD_TYPES = [
  { value: 'short_text',      label: 'Texto curto' },
  { value: 'long_text',       label: 'Texto longo' },
  { value: 'yes_no',          label: 'Sim/Não' },
  { value: 'select',          label: 'Seleção única' },
  { value: 'multiple_choice', label: 'Múltipla escolha' },
  { value: 'file_upload',     label: 'Upload de arquivo' },
  { value: 'number',          label: 'Número' },
  { value: 'date',            label: 'Data' },
  { value: 'scale',           label: 'Escala 1-5' },
  { value: 'celular',         label: 'Número de celular' },
  { value: 'cpf',             label: 'CPF' },
  { value: 'cep',             label: 'CEP' },
  { value: 'email',           label: 'E-mail' },
  { value: 'address',         label: 'Endereço completo' },
  { value: 'job_select',      label: 'Vaga de Interesse (vagas cadastradas)' },
]

function getTypeLabel(v: string) {
  return FIELD_TYPES.find(t => t.value === v)?.label || v
}

// ─── Slug helper ─────────────────────────────────────────────────────────────

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

// ─── Default forms ───────────────────────────────────────────────────────────

const EMPTY_SECTION = { name: '', description: '', category: '', sort_order: 1, is_active: true }
const EMPTY_QUESTION = {
  question_text: '', field_type: 'short_text', is_required: false,
  is_active: true, weight: 1, sort_order: 0,
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SectionsManager({
  sections: initialSections,
  questions: initialQuestions,
}: {
  sections: FormSection[]
  questions: FormQuestion[]
}) {
  // ── Sections state ──────────────────────────────────────────────────────────
  const [sections, setSections] = useState<FormSection[]>(initialSections)
  const [questions, setQuestions] = useState<FormQuestion[]>(initialQuestions)

  // Expanded sections (show questions)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Moving state
  const [movingSection, setMovingSection] = useState<string | null>(null)
  const [movingQuestion, setMovingQuestion] = useState<string | null>(null)

  // ── Section dialog ──────────────────────────────────────────────────────────
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false)
  const [editingSection, setEditingSection] = useState<FormSection | null>(null)
  const [sectionForm, setSectionForm] = useState(EMPTY_SECTION)
  const [savingSection, setSavingSection] = useState(false)
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<FormSection | null>(null)

  // ── Question dialog ─────────────────────────────────────────────────────────
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<FormQuestion | null>(null)
  const [questionForm, setQuestionForm] = useState(EMPTY_QUESTION)
  const [targetSectionId, setTargetSectionId] = useState<string>('')
  const [savingQuestion, setSavingQuestion] = useState(false)
  const [confirmDeleteQuestion, setConfirmDeleteQuestion] = useState<FormQuestion | null>(null)

  // ─── Section helpers ────────────────────────────────────────────────────────

  const sortedSections = [...sections].sort((a, b) => a.sort_order - b.sort_order)

  function questionsForSection(s: FormSection) {
    const key = s.category || s.id
    return [...questions]
      .filter(q => q.category === key)
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ─── Section CRUD ───────────────────────────────────────────────────────────

  function openCreateSection() {
    setEditingSection(null)
    setSectionForm({ ...EMPTY_SECTION, sort_order: sections.length + 1 })
    setSectionDialogOpen(true)
  }

  function openEditSection(s: FormSection) {
    setEditingSection(s)
    setSectionForm({
      name: s.name,
      description: s.description || '',
      category: s.category || '',
      sort_order: s.sort_order,
      is_active: s.is_active,
    })
    setSectionDialogOpen(true)
  }

  async function handleSaveSection() {
    if (!sectionForm.name.trim()) return
    setSavingSection(true)
    const supabase = createSupabaseBrowserClient()

    const payload = {
      name: sectionForm.name.trim(),
      description: sectionForm.description.trim() || null,
      category: sectionForm.category.trim() || slugify(sectionForm.name.trim()),
      sort_order: sectionForm.sort_order,
      is_active: sectionForm.is_active,
      updated_at: new Date().toISOString(),
    }

    if (editingSection) {
      const { data: updated } = await supabase
        .from('form_sections')
        .update(payload)
        .eq('id', editingSection.id)
        .select('*')
        .single()
      if (updated) setSections(prev => prev.map(s => s.id === editingSection.id ? (updated as FormSection) : s))
    } else {
      const { data: inserted } = await supabase
        .from('form_sections')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select('*')
        .single()
      if (inserted) setSections(prev => [...prev, inserted as FormSection])
    }

    setSavingSection(false)
    setSectionDialogOpen(false)
  }

  async function handleDeleteSection(s: FormSection) {
    const supabase = createSupabaseBrowserClient()
    await supabase.from('form_sections').delete().eq('id', s.id)
    setSections(prev => prev.filter(x => x.id !== s.id))
    setConfirmDeleteSection(null)
  }

  async function moveSectionDir(s: FormSection, dir: 'up' | 'down') {
    const idx = sortedSections.findIndex(x => x.id === s.id)
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= sortedSections.length) return
    const target = sortedSections[targetIdx]
    setMovingSection(s.id)
    setSections(prev => prev.map(item => {
      if (item.id === s.id) return { ...item, sort_order: target.sort_order }
      if (item.id === target.id) return { ...item, sort_order: s.sort_order }
      return item
    }))
    const supabase = createSupabaseBrowserClient()
    await Promise.all([
      supabase.from('form_sections').update({ sort_order: target.sort_order }).eq('id', s.id),
      supabase.from('form_sections').update({ sort_order: s.sort_order }).eq('id', target.id),
    ])
    setMovingSection(null)
  }

  // ─── Question CRUD ──────────────────────────────────────────────────────────

  function openCreateQuestion(s: FormSection) {
    setEditingQuestion(null)
    setTargetSectionId(s.id)
    const sectionQuestions = questionsForSection(s)
    setQuestionForm({
      ...EMPTY_QUESTION,
      sort_order: sectionQuestions.length + 1,
    })
    setQuestionDialogOpen(true)
    // Ensure section is expanded
    setExpanded(prev => new Set([...prev, s.id]))
  }

  function openEditQuestion(q: FormQuestion, sectionId: string) {
    setEditingQuestion(q)
    setTargetSectionId(sectionId)
    setQuestionForm({
      question_text: q.question_text,
      field_type: q.field_type,
      is_required: q.is_required,
      is_active: q.is_active,
      weight: q.weight,
      sort_order: q.sort_order,
    })
    setQuestionDialogOpen(true)
  }

  async function handleSaveQuestion() {
    if (!questionForm.question_text.trim()) return
    setSavingQuestion(true)
    const supabase = createSupabaseBrowserClient()

    // Determine category from the target section
    const section = sections.find(s => s.id === targetSectionId)
    const category = section?.category || slugify(section?.name || targetSectionId)

    const payload = {
      question_text: questionForm.question_text.trim(),
      field_type: questionForm.field_type,
      is_required: questionForm.is_required,
      is_active: questionForm.is_active,
      weight: questionForm.weight,
      sort_order: questionForm.sort_order,
      category,
      form_type: 'registration',
      updated_at: new Date().toISOString(),
    }

    if (editingQuestion) {
      const { data: updated } = await supabase
        .from('form_questions')
        .update(payload)
        .eq('id', editingQuestion.id)
        .select('*')
        .single()
      if (updated) setQuestions(prev => prev.map(q => q.id === editingQuestion.id ? (updated as FormQuestion) : q))
    } else {
      const { data: inserted } = await supabase
        .from('form_questions')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select('*')
        .single()
      if (inserted) setQuestions(prev => [...prev, inserted as FormQuestion])
    }

    setSavingQuestion(false)
    setQuestionDialogOpen(false)
  }

  async function toggleQuestionActive(q: FormQuestion) {
    setQuestions(prev => prev.map(item =>
      item.id === q.id ? { ...item, is_active: !item.is_active } : item
    ))
    const supabase = createSupabaseBrowserClient()
    await supabase.from('form_questions').update({ is_active: !q.is_active }).eq('id', q.id)
  }

  async function handleDeleteQuestion(q: FormQuestion) {
    setQuestions(prev => prev.filter(item => item.id !== q.id))
    setConfirmDeleteQuestion(null)
    const supabase = createSupabaseBrowserClient()
    await supabase.from('form_questions').delete().eq('id', q.id)
  }

  async function moveQuestionDir(q: FormQuestion, s: FormSection, dir: 'up' | 'down') {
    const sectionQs = questionsForSection(s)
    const idx = sectionQs.findIndex(x => x.id === q.id)
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= sectionQs.length) return
    const target = sectionQs[targetIdx]
    setMovingQuestion(q.id)
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
    setMovingQuestion(null)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Seções e Perguntas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure as seções do formulário e as perguntas exibidas em{' '}
            <a href="/curriculo" target="_blank" className="text-primary hover:underline font-mono text-xs">/curriculo</a>
          </p>
        </div>
        <Button onClick={openCreateSection} className="shrink-0">
          <Plus className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Nova Seção</span>
          <span className="sm:hidden">Nova</span>
        </Button>
      </div>

      {/* Empty state */}
      {sortedSections.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
          Nenhuma seção cadastrada.{' '}
          <button onClick={openCreateSection} className="text-primary underline">Criar a primeira</button>
        </div>
      )}

      {/* Sections list */}
      <div className="space-y-3">
        {sortedSections.map((s, sIdx) => {
          const sectionQuestions = questionsForSection(s)
          const isExpanded = expanded.has(s.id)

          return (
            <div
              key={s.id}
              className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-opacity ${movingSection === s.id ? 'opacity-50' : ''}`}
            >
              {/* ── Section header ── */}
              <div className="flex items-center gap-2 px-3 py-3">

                {/* Order controls */}
                <div className="flex flex-col items-center gap-0 shrink-0">
                  <GripVertical className="w-4 h-4 text-[#ccc] mb-0.5" />
                  <button
                    onClick={() => moveSectionDir(s, 'up')}
                    disabled={sIdx === 0 || !!movingSection}
                    className="p-0.5 rounded hover:bg-[#f0f0f0] disabled:opacity-20"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-[#555]" />
                  </button>
                  <button
                    onClick={() => moveSectionDir(s, 'down')}
                    disabled={sIdx === sortedSections.length - 1 || !!movingSection}
                    className="p-0.5 rounded hover:bg-[#f0f0f0] disabled:opacity-20"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-[#555]" />
                  </button>
                </div>

                {/* Expand toggle */}
                <button
                  onClick={() => toggleExpand(s.id)}
                  className="p-1 rounded hover:bg-[#f5f5f5] transition-colors"
                >
                  <ChevronRight
                    className={`w-4 h-4 text-[#888] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </button>

                {/* Section info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[#222]">{s.name}</span>
                    {!s.is_active && <Badge variant="secondary" className="text-xs">Inativa</Badge>}
                    {s.category && (
                      <span className="text-xs font-mono bg-[#f5f5f5] border px-1.5 py-0.5 rounded text-[#666]">
                        {s.category}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {sectionQuestions.length} {sectionQuestions.length === 1 ? 'pergunta' : 'perguntas'}
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.description}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm" variant="outline"
                    className="hidden sm:flex items-center gap-1 text-xs h-7 px-2"
                    onClick={() => openCreateQuestion(s)}
                  >
                    <Plus className="w-3 h-3" />
                    Pergunta
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditSection(s)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setConfirmDeleteSection(s)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* ── Questions accordion ── */}
              {isExpanded && (
                <div className="border-t bg-[#fafafa]">
                  {sectionQuestions.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      Nenhuma pergunta nesta seção.{' '}
                      <button
                        onClick={() => openCreateQuestion(s)}
                        className="text-primary underline"
                      >
                        Adicionar pergunta
                      </button>
                    </div>
                  ) : (
                    <div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#ebebeb]">
                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-16">Ordem</th>
                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Pergunta</th>
                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Tipo</th>
                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                            <th className="px-4 py-2 w-24"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionQuestions.map((q, qIdx) => (
                            <tr
                              key={q.id}
                              className={`border-b border-[#f0f0f0] last:border-0 hover:bg-white transition-colors ${movingQuestion === q.id ? 'opacity-50' : ''}`}
                            >
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-0.5">
                                  <div className="flex flex-col">
                                    <button
                                      onClick={() => moveQuestionDir(q, s, 'up')}
                                      disabled={qIdx === 0 || !!movingQuestion}
                                      className="p-0.5 rounded hover:bg-[#eee] disabled:opacity-20"
                                    >
                                      <ChevronUp className="w-3 h-3 text-[#777]" />
                                    </button>
                                    <button
                                      onClick={() => moveQuestionDir(q, s, 'down')}
                                      disabled={qIdx === sectionQuestions.length - 1 || !!movingQuestion}
                                      className="p-0.5 rounded hover:bg-[#eee] disabled:opacity-20"
                                    >
                                      <ChevronDown className="w-3 h-3 text-[#777]" />
                                    </button>
                                  </div>
                                  <span className="text-xs font-mono text-muted-foreground ml-1">{q.sort_order}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <p className="line-clamp-1 text-sm">{q.question_text}</p>
                                {q.is_required && <span className="text-xs text-red-500">Obrigatória</span>}
                              </td>
                              <td className="px-4 py-2.5 hidden sm:table-cell">
                                <span className="text-xs bg-white border px-2 py-0.5 rounded-full text-muted-foreground">
                                  {getTypeLabel(q.field_type)}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 hidden sm:table-cell">
                                <Badge variant={q.is_active ? 'default' : 'secondary'} className="text-xs">
                                  {q.is_active ? 'Ativa' : 'Inativa'}
                                </Badge>
                              </td>
                              <td className="px-4 py-2 text-right">
                                <div className="flex gap-0.5 justify-end">
                                  <Button
                                    size="sm" variant="ghost" className="h-7 w-7 p-0"
                                    onClick={() => openEditQuestion(q, s.id)}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm" variant="ghost" className="h-7 w-7 p-0"
                                    onClick={() => toggleQuestionActive(q)}
                                    title={q.is_active ? 'Desativar' : 'Ativar'}
                                  >
                                    <Power className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => setConfirmDeleteQuestion(q)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Footer add button */}
                      <div className="px-4 py-2 border-t border-[#ebebeb]">
                        <button
                          onClick={() => openCreateQuestion(s)}
                          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Nova pergunta nesta seção
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ══ Dialog: Nova / Editar Seção ═════════════════════════════════════ */}
      <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
        <DialogContent className="max-w-md mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>{editingSection ? 'Editar Seção' : 'Nova Seção'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            <div className="space-y-1">
              <Label>Nome da Seção *</Label>
              <Input
                value={sectionForm.name}
                onChange={e => {
                  const name = e.target.value
                  setSectionForm(f => ({
                    ...f,
                    name,
                    // Auto-fill category only when creating
                    category: !editingSection ? slugify(name) : f.category,
                  }))
                }}
                placeholder="Ex: Dados Pessoais, Experiência…"
                className="text-base"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label>Categoria</Label>
              <Input
                value={sectionForm.category}
                onChange={e => setSectionForm(f => ({ ...f, category: e.target.value }))}
                placeholder="dados_pessoais"
                className="text-base font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Gerado automaticamente. As perguntas desta seção usarão esta categoria.
              </p>
            </div>

            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea
                value={sectionForm.description}
                onChange={e => setSectionForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Instrução exibida ao candidato nesta etapa…"
                className="text-base resize-none"
              />
            </div>

            <div className="flex gap-4 items-end">
              <div className="space-y-1 w-24">
                <Label>Ordem</Label>
                <Input
                  type="number" min="1"
                  value={sectionForm.sort_order}
                  onChange={e => setSectionForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="text-base"
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer pb-1">
                <input
                  type="checkbox"
                  checked={sectionForm.is_active}
                  onChange={e => setSectionForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4"
                />
                Seção ativa
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setSectionDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveSection} disabled={savingSection || !sectionForm.name.trim()}>
                {savingSection ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: Confirmar remoção de seção ══════════════════════════════ */}
      <Dialog open={!!confirmDeleteSection} onOpenChange={() => setConfirmDeleteSection(null)}>
        <DialogContent className="max-w-sm mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Remover seção</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover a seção <strong>{confirmDeleteSection?.name}</strong>?
            As perguntas vinculadas <strong>não serão excluídas</strong>.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDeleteSection(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => confirmDeleteSection && handleDeleteSection(confirmDeleteSection)}>
              <Trash2 className="w-4 h-4 mr-1" />Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: Nova / Editar Pergunta ══════════════════════════════════ */}
      <Dialog open={questionDialogOpen} onOpenChange={setQuestionDialogOpen}>
        <DialogContent className="max-w-lg mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? 'Editar Pergunta' : 'Nova Pergunta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            <div className="space-y-1">
              <Label>Pergunta *</Label>
              <Input
                value={questionForm.question_text}
                onChange={e => setQuestionForm(f => ({ ...f, question_text: e.target.value }))}
                placeholder="Digite a pergunta..."
                className="text-base"
                autoFocus
              />
            </div>

            {/* Seção */}
            <div className="space-y-1">
              <Label>Seção</Label>
              <Select
                value={targetSectionId}
                onValueChange={v => v && setTargetSectionId(v)}
              >
                <SelectTrigger>
                  <span className="truncate text-sm">
                    {sortedSections.find(s => s.id === targetSectionId)?.name || 'Selecionar seção…'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {sortedSections.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de Campo */}
            <div className="space-y-1">
              <Label>Tipo de Campo</Label>
              <Select
                value={questionForm.field_type}
                onValueChange={v => v && setQuestionForm(f => ({ ...f, field_type: v }))}
              >
                <SelectTrigger>
                  <span className="truncate text-sm">
                    {FIELD_TYPES.find(t => t.value === questionForm.field_type)?.label || 'Selecionar tipo…'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Peso (análise IA)</Label>
                <Input
                  type="number" step="0.1"
                  value={questionForm.weight}
                  onChange={e => setQuestionForm(f => ({ ...f, weight: Number(e.target.value) }))}
                  className="text-base"
                />
              </div>
              <div className="space-y-1">
                <Label>Ordem na seção</Label>
                <Input
                  type="number"
                  value={questionForm.sort_order}
                  onChange={e => setQuestionForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="text-base"
                />
              </div>
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={questionForm.is_required}
                  onChange={e => setQuestionForm(f => ({ ...f, is_required: e.target.checked }))}
                  className="w-4 h-4"
                />
                Obrigatória
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={questionForm.is_active}
                  onChange={e => setQuestionForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4"
                />
                Ativa
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setQuestionDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={handleSaveQuestion}
                disabled={savingQuestion || !questionForm.question_text.trim()}
              >
                {savingQuestion ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: Confirmar remoção de pergunta ═══════════════════════════ */}
      <Dialog open={!!confirmDeleteQuestion} onOpenChange={() => setConfirmDeleteQuestion(null)}>
        <DialogContent className="max-w-sm mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Remover pergunta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover:{' '}
            <strong>&quot;{confirmDeleteQuestion?.question_text}&quot;</strong>?
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDeleteQuestion(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteQuestion && handleDeleteQuestion(confirmDeleteQuestion)}
            >
              <Trash2 className="w-4 h-4 mr-1" />Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
