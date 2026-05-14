'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, X } from 'lucide-react'
import type { QuestionType } from '@/lib/types/database'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Option {
  id?: string
  option_text: string
  display_order: number
}

interface Question {
  id: string
  question_text: string
  question_type: string
  is_required: boolean
  max_choices: number | null
  display_order: number
  question_options: Option[]
}

interface Section {
  id: string
  title: string
  description: string | null
  display_order: number
  questions: Question[]
}

interface Props {
  surveyId: string
  sections: Section[]
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const QUESTION_TYPES = [
  { value: 'single_choice', label: 'Escolha única' },
  { value: 'multiple_choice', label: 'Múltipla escolha' },
  { value: 'scale', label: 'Escala 1–5' },
  { value: 'open_text', label: 'Texto aberto' },
  { value: 'number', label: 'Número' },
] as const

const HAS_OPTIONS = ['single_choice', 'multiple_choice', 'scale']

const defaultForm = {
  question_text: '',
  question_type: 'single_choice' as QuestionType,
  is_required: true,
  max_choices: null as number | null,
  display_order: 1,
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PerguntasManager({ surveyId, sections }: Props) {
  const router = useRouter()

  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(sections.map((s) => s.id))
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [options, setOptions] = useState<{ text: string; id?: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ─── Abrir dialog ─────────────────────────────────────────────────────────

  function openNew(sectionId: string, questionCount: number) {
    setEditingQuestion(null)
    setEditingSectionId(sectionId)
    setForm({ ...defaultForm, display_order: questionCount + 1 })
    setOptions([{ text: '' }, { text: '' }])
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(question: Question, sectionId: string) {
    setEditingQuestion(question)
    setEditingSectionId(sectionId)
    setForm({
      question_text: question.question_text,
      question_type: question.question_type as QuestionType,
      is_required: question.is_required,
      max_choices: question.max_choices,
      display_order: question.display_order,
    })
    setOptions(
      [...question.question_options]
        .sort((a, b) => a.display_order - b.display_order)
        .map((o) => ({ text: o.option_text, id: o.id }))
    )
    setError(null)
    setDialogOpen(true)
  }

  // ─── Salvar ───────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.question_text.trim()) return
    if (!editingSectionId) return
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const hasOptions = HAS_OPTIONS.includes(form.question_type)

    try {
      let questionId = editingQuestion?.id

      if (editingQuestion) {
        // Atualiza pergunta existente
        const { error: updateErr } = await supabase
          .from('questions')
          .update({
            question_text: form.question_text.trim(),
            question_type: form.question_type,
            is_required: form.is_required,
            max_choices:
              form.question_type === 'multiple_choice' ? form.max_choices : null,
            display_order: form.display_order,
          })
          .eq('id', editingQuestion.id)
        if (updateErr) throw updateErr
      } else {
        // Cria nova pergunta
        const { data: newQ, error: insertErr } = await supabase
          .from('questions')
          .insert({
            survey_id: surveyId,
            section_id: editingSectionId,
            question_text: form.question_text.trim(),
            question_type: form.question_type,
            is_required: form.is_required,
            max_choices:
              form.question_type === 'multiple_choice' ? form.max_choices : null,
            display_order: form.display_order,
          })
          .select('id')
          .single()
        if (insertErr) throw insertErr
        questionId = newQ.id
      }

      // Gerencia opções
      if (questionId) {
        if (hasOptions) {
          const validOptions = options.filter((o) => o.text.trim())

          if (editingQuestion) {
            // Remove opções que foram deletadas
            const keepIds = options.filter((o) => o.id).map((o) => o.id!)
            const toDelete = editingQuestion.question_options
              .filter((o) => o.id && !keepIds.includes(o.id!))
              .map((o) => o.id!)
            if (toDelete.length > 0) {
              await supabase
                .from('question_options')
                .delete()
                .in('id', toDelete)
            }
            // Atualiza/insere opções
            for (let i = 0; i < validOptions.length; i++) {
              const opt = validOptions[i]
              if (opt.id) {
                await supabase
                  .from('question_options')
                  .update({ option_text: opt.text.trim(), display_order: i + 1 })
                  .eq('id', opt.id)
              } else {
                await supabase.from('question_options').insert({
                  question_id: questionId,
                  option_text: opt.text.trim(),
                  display_order: i + 1,
                })
              }
            }
          } else {
            // Insere opções para nova pergunta
            if (validOptions.length > 0) {
              await supabase.from('question_options').insert(
                validOptions.map((o, i) => ({
                  question_id: questionId!,
                  option_text: o.text.trim(),
                  display_order: i + 1,
                }))
              )
            }
          }
        } else if (editingQuestion) {
          // Tipo mudou para sem opções — remove todas
          await supabase
            .from('question_options')
            .delete()
            .eq('question_id', questionId)
        }
      }

      setDialogOpen(false)
      router.refresh()
    } catch (err) {
      setError('Erro ao salvar. Tente novamente.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // ─── Excluir ──────────────────────────────────────────────────────────────

  async function handleDelete(questionId: string) {
    if (!confirm('Excluir esta pergunta permanentemente?')) return
    setDeletingId(questionId)
    const supabase = createClient()
    await supabase.from('questions').delete().eq('id', questionId)
    setDeletingId(null)
    router.refresh()
  }

  // ─── Opções no dialog ─────────────────────────────────────────────────────

  function addOption() {
    setOptions((prev) => [...prev, { text: '' }])
  }

  function removeOption(idx: number) {
    setOptions((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateOption(idx: number, text: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, text } : o)))
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  const totalQ = sections.reduce((sum, s) => sum + s.questions.length, 0)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-5 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Gerenciar Perguntas</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {sections.length} seções · {totalQ} perguntas
        </p>
      </div>

      {/* Seções */}
      <div className="space-y-3">
        {sections.map((section) => {
          const isExpanded = expanded.has(section.id)
          const sorted = [...section.questions].sort(
            (a, b) => a.display_order - b.display_order
          )

          return (
            <div
              key={section.id}
              className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden"
            >
              {/* Cabeçalho da seção */}
              <button
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev)
                    next.has(section.id) ? next.delete(section.id) : next.add(section.id)
                    return next
                  })
                }
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-muted/30 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      Seção {section.display_order}
                    </span>
                    <span className="text-xs text-muted-foreground/50">
                      {section.questions.length} pergunta
                      {section.questions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-tight">
                    {section.title}
                  </p>
                </div>
              </button>

              {/* Perguntas */}
              {isExpanded && (
                <div className="border-t border-border">
                  {sorted.length > 0 ? (
                    <div className="divide-y divide-border">
                      {sorted.map((q) => (
                        <div
                          key={q.id}
                          className="flex items-start gap-3 px-5 py-3.5 group hover:bg-muted/20 transition-colors"
                        >
                          <span className="text-xs text-muted-foreground/40 mt-0.5 w-5 flex-shrink-0 tabular-nums text-right">
                            {q.display_order}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground leading-snug">
                              {q.question_text}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 h-4"
                              >
                                {QUESTION_TYPES.find((t) => t.value === q.question_type)
                                  ?.label ?? q.question_type}
                              </Badge>
                              {q.is_required && (
                                <span className="text-[10px] text-destructive font-medium">
                                  Obrigatória
                                </span>
                              )}
                              {q.question_options.length > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  {q.question_options.length} opções
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Ações — aparecem no hover */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={() => openEdit(q, section.id)}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar pergunta"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(q.id)}
                              disabled={deletingId === q.id}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="Excluir pergunta"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-4 text-sm text-muted-foreground italic">
                      Nenhuma pergunta nesta seção ainda.
                    </div>
                  )}

                  {/* Botão adicionar */}
                  <div className="px-5 py-3 bg-muted/20 border-t border-border">
                    <button
                      onClick={() => openNew(section.id, section.questions.length)}
                      className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar pergunta nesta seção
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ─── Dialog de edição/criação ────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingQuestion ? 'Editar Pergunta' : 'Nova Pergunta'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Texto */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Pergunta <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={form.question_text}
                onChange={(e) =>
                  setForm((f) => ({ ...f, question_text: e.target.value }))
                }
                placeholder="Digite o enunciado da pergunta..."
                rows={3}
                className="resize-none rounded-xl text-sm"
              />
            </div>

            {/* Tipo + Ordem */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Tipo de resposta</Label>
                <Select
                  value={form.question_type}
                  onValueChange={(v) =>
                    setForm((f) => {
                      const next = { ...f, question_type: v as QuestionType }
                      // Pré-popula opções de escala
                      if (v === 'scale') {
                        setOptions([
                          { text: '1 – Muito ruim' },
                          { text: '2' },
                          { text: '3 – Regular' },
                          { text: '4' },
                          { text: '5 – Excelente' },
                        ])
                      } else if (
                        HAS_OPTIONS.includes(v) &&
                        !HAS_OPTIONS.includes(f.question_type)
                      ) {
                        setOptions([{ text: '' }, { text: '' }])
                      }
                      return next
                    })
                  }
                >
                  <SelectTrigger className="rounded-xl h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Ordem</Label>
                <Input
                  type="number"
                  value={form.display_order}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      display_order: Number(e.target.value) || 1,
                    }))
                  }
                  className="rounded-xl h-10 text-sm"
                  min={1}
                />
              </div>
            </div>

            {/* Obrigatória + Máx. escolhas */}
            <div className="flex items-center gap-5">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_required}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_required: e.target.checked }))
                  }
                  className="w-4 h-4 accent-primary rounded"
                />
                Obrigatória
              </label>

              {form.question_type === 'multiple_choice' && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">Máx. escolhas:</Label>
                  <Input
                    type="number"
                    value={form.max_choices ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        max_choices: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className="w-16 h-8 text-sm rounded-lg"
                    min={1}
                    placeholder="—"
                  />
                </div>
              )}
            </div>

            {/* Opções de resposta */}
            {HAS_OPTIONS.includes(form.question_type) && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {form.question_type === 'scale'
                    ? 'Rótulos da escala (1 a 5)'
                    : 'Opções de resposta'}
                </Label>
                <div className="space-y-2">
                  {options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5 text-right flex-shrink-0 tabular-nums">
                        {idx + 1}.
                      </span>
                      <Input
                        value={opt.text}
                        onChange={(e) => updateOption(idx, e.target.value)}
                        placeholder={
                          form.question_type === 'scale'
                            ? `Rótulo ${idx + 1}`
                            : `Opção ${idx + 1}`
                        }
                        className="rounded-lg h-9 text-sm flex-1"
                      />
                      {form.question_type !== 'scale' && (
                        <button
                          onClick={() => removeOption(idx)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                          title="Remover opção"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {form.question_type !== 'scale' && (
                  <button
                    onClick={addOption}
                    className="flex items-center gap-1 text-xs text-primary font-medium hover:underline mt-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar opção
                  </button>
                )}
              </div>
            )}

            {/* Erro */}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Ações */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.question_text.trim()}
                className="rounded-xl"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
