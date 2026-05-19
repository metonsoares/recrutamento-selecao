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
import {
  Plus, Pencil, Power, Sparkles, Loader2,
  ChevronLeft, CheckCircle2, AlertCircle, Trash2,
} from 'lucide-react'

const CULTURE_VALUES = [
  'qualidade sem atalho', 'hospitalidade de verdade', 'respeito', 'honestidade',
  'comprometimento', 'senso de dono', 'trabalho em equipe', 'disciplina operacional',
  'cuidado com o cliente', 'vontade de aprender', 'orgulho de fazer bem feito',
]

const LETTERS = ['A', 'B', 'C', 'D'] as const

// ─── tipos internos ───────────────────────────────────────────────────────────

interface AiSuggestion {
  question_text: string
  options: string[]
  scores: Record<string, number>
  ideal_answer: string
  culture_value: string
  explanation: string
}

type AiStep = 'input' | 'loading' | 'review'

// ─── helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 8) return 'text-emerald-600 font-semibold'
  if (score >= 5) return 'text-amber-600'
  return 'text-muted-foreground'
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={`text-xs ml-1 ${scoreColor(score)}`}>
      {score}/10
    </span>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export function CultureQuestionsManager({ questions }: { questions: CultureQuestion[] }) {
  const router = useRouter()

  // ── Edit dialog ──────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CultureQuestion | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<CultureQuestion | null>(null)
  const [form, setForm] = useState({
    question_text: '',
    optA: '', optB: '', optC: '', optD: '',
    scoreA: 0, scoreB: 10, scoreC: 0, scoreD: 0,
    ideal_answer: 'B',
    culture_value: '',
    weight: 1,
    sort_order: 0,
    is_active: true,
  })

  // ── AI dialog ────────────────────────────────────────────────────────────
  const [aiOpen, setAiOpen] = useState(false)
  const [aiTarget, setAiTarget] = useState<CultureQuestion | null>(null)
  const [aiStep, setAiStep] = useState<AiStep>('input')
  const [aiRequest, setAiRequest] = useState('')
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null)
  const [aiError, setAiError] = useState('')
  const [aiSaving, setAiSaving] = useState(false)

  // Suggested form (editable after AI responds)
  const [sugForm, setSugForm] = useState({
    question_text: '',
    optA: '', optB: '', optC: '', optD: '',
    scoreA: 0, scoreB: 10, scoreC: 0, scoreD: 0,
    ideal_answer: 'A',
    culture_value: '',
  })

  // ── Edit dialog helpers ───────────────────────────────────────────────────

  function openCreate() {
    setEditing(null)
    setForm({
      question_text: '', optA: 'A. ', optB: 'B. ', optC: 'C. ', optD: 'D. ',
      scoreA: 0, scoreB: 10, scoreC: 0, scoreD: 0,
      ideal_answer: 'B', culture_value: '', weight: 1,
      sort_order: questions.length + 1, is_active: true,
    })
    setOpen(true)
  }

  function openEdit(q: CultureQuestion) {
    setEditing(q)
    const opts = q.options || []
    const scores = q.scores as Record<string, number> || {}
    setForm({
      question_text: q.question_text,
      optA: opts[0] || '', optB: opts[1] || '', optC: opts[2] || '', optD: opts[3] || '',
      scoreA: scores['A'] ?? 0, scoreB: scores['B'] ?? 10,
      scoreC: scores['C'] ?? 0, scoreD: scores['D'] ?? 0,
      ideal_answer: q.ideal_answer || 'B',
      culture_value: q.culture_value || '',
      weight: q.weight, sort_order: q.sort_order, is_active: q.is_active,
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

  async function handleDelete(q: CultureQuestion) {
    const supabase = createSupabaseBrowserClient()
    await supabase.from('culture_questions').delete().eq('id', q.id)
    setConfirmDelete(null)
    router.refresh()
  }

  // ── AI dialog helpers ─────────────────────────────────────────────────────

  function openAiHelp(q: CultureQuestion) {
    setAiTarget(q)
    setAiRequest('')
    setAiStep('input')
    setAiSuggestion(null)
    setAiError('')
    setAiOpen(true)
  }

  function suggestionToForm(s: AiSuggestion) {
    const opts = s.options || []
    const scores = s.scores || {}
    setSugForm({
      question_text: s.question_text,
      optA: opts[0] || '', optB: opts[1] || '', optC: opts[2] || '', optD: opts[3] || '',
      scoreA: scores['A'] ?? 0, scoreB: scores['B'] ?? 10,
      scoreC: scores['C'] ?? 0, scoreD: scores['D'] ?? 0,
      ideal_answer: s.ideal_answer || 'A',
      culture_value: s.culture_value || '',
    })
  }

  async function handleAiGenerate() {
    if (!aiRequest.trim() || !aiTarget) return
    setAiStep('loading')
    setAiError('')
    try {
      const res = await fetch('/api/admin/ai/improve-culture-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: aiTarget, userRequest: aiRequest }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setAiError(data.error || 'Erro ao gerar sugestão.')
        setAiStep('input')
        return
      }
      setAiSuggestion(data.improved)
      suggestionToForm(data.improved)
      setAiStep('review')
    } catch {
      setAiError('Erro de conexão. Tente novamente.')
      setAiStep('input')
    }
  }

  async function handleAiApply() {
    if (!aiTarget) return
    setAiSaving(true)
    const supabase = createSupabaseBrowserClient()
    await supabase.from('culture_questions').update({
      question_text: sugForm.question_text,
      options: [sugForm.optA, sugForm.optB, sugForm.optC, sugForm.optD].filter(Boolean),
      scores: { A: sugForm.scoreA, B: sugForm.scoreB, C: sugForm.scoreC, D: sugForm.scoreD },
      ideal_answer: sugForm.ideal_answer,
      culture_value: sugForm.culture_value,
      updated_at: new Date().toISOString(),
    }).eq('id', aiTarget.id)
    setAiSaving(false)
    setAiOpen(false)
    router.refresh()
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Teste Cultural</h1>
          <p className="text-muted-foreground text-sm mt-1">{questions.length} perguntas configuradas</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />Nova Pergunta
        </Button>
      </div>

      {/* Lista de perguntas */}
      <div className="space-y-3">
        {questions.map(q => {
          const scores = q.scores as Record<string, number> || {}
          return (
            <div key={q.id} className="bg-white rounded-xl border shadow-sm p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  {/* Badges de cabeçalho */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs text-muted-foreground font-mono">#{q.sort_order}</span>
                    {q.culture_value && (
                      <Badge variant="outline" className="text-xs border-violet-200 text-violet-700 bg-violet-50">
                        {q.culture_value}
                      </Badge>
                    )}
                    <Badge
                      variant={q.is_active ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {q.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>

                  {/* Texto da pergunta */}
                  <p className="font-medium text-sm text-[#1a1a1a] leading-snug mb-2">
                    {q.question_text}
                  </p>

                  {/* Alternativas */}
                  <div className="space-y-0.5">
                    {(q.options || []).map((opt, i) => {
                      const letter = LETTERS[i]
                      const score = scores[letter] ?? 0
                      const isIdeal = letter === q.ideal_answer
                      return (
                        <p
                          key={i}
                          className={`text-xs flex items-baseline gap-1 ${isIdeal ? 'text-emerald-700 font-medium' : 'text-muted-foreground'}`}
                        >
                          {isIdeal && <span className="text-emerald-500">✓</span>}
                          {opt}
                          <ScoreBadge score={score} />
                        </p>
                      )
                    })}
                  </div>
                </div>

                {/* Ações */}
                <div className="flex flex-col gap-1.5 shrink-0">
                  {/* Botão IA — destaque */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400 w-full justify-start gap-1.5"
                    onClick={() => openAiHelp(q)}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Ajuda da IA
                  </Button>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(q)} title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(q)} title="Ativar/Desativar">
                      <Power className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:bg-red-50"
                      onClick={() => setConfirmDelete(q)}
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {questions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
            Nenhuma pergunta cadastrada.{' '}
            <button onClick={openCreate} className="text-primary underline">Criar a primeira</button>
          </div>
        )}
      </div>

      {/* ══ Dialog: Editar / Nova pergunta ═══════════════════════════════════ */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Pergunta' : 'Nova Pergunta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            <div className="space-y-1">
              <Label>Pergunta *</Label>
              <Textarea
                value={form.question_text}
                onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))}
                rows={2}
                className="text-base resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {LETTERS.map(letter => (
                <div key={letter} className="space-y-1 bg-[#fafafa] border rounded-lg p-3">
                  <Label className="text-xs font-semibold text-muted-foreground">Opção {letter}</Label>
                  <Input
                    value={form[`opt${letter}` as keyof typeof form] as string}
                    onChange={e => setForm(f => ({ ...f, [`opt${letter}`]: e.target.value }))}
                    placeholder={`Alternativa ${letter}`}
                    className="text-sm"
                  />
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Pontuação (0-10)</Label>
                    <Input
                      type="number" min={0} max={10}
                      value={form[`score${letter}` as keyof typeof form] as number}
                      onChange={e => setForm(f => ({ ...f, [`score${letter}`]: Number(e.target.value) }))}
                      className="text-sm w-16"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Resposta Ideal</Label>
                <Input
                  value={form.ideal_answer}
                  onChange={e => setForm(f => ({ ...f, ideal_answer: e.target.value.toUpperCase() }))}
                  maxLength={1}
                  className="text-base font-bold text-center"
                />
              </div>
              <div className="space-y-1">
                <Label>Valor Cultural</Label>
                <select
                  className="w-full border rounded-md px-2 py-2 text-sm bg-white"
                  value={form.culture_value}
                  onChange={e => setForm(f => ({ ...f, culture_value: e.target.value }))}
                >
                  <option value="">Selecionar...</option>
                  {CULTURE_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="text-base"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                className="w-4 h-4"
              />
              Pergunta ativa
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !form.question_text.trim()}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: Confirmar remoção ═════════════════════════════════════════ */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm mx-4 sm:mx-auto">
          <DialogHeader><DialogTitle>Remover pergunta</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover esta pergunta?
            <br />
            <strong className="text-foreground">&quot;{confirmDelete?.question_text}&quot;</strong>
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => confirmDelete && handleDelete(confirmDelete)}>
              <Trash2 className="w-4 h-4 mr-1" />Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: Ajuda da IA ═══════════════════════════════════════════════ */}
      <Dialog open={aiOpen} onOpenChange={o => { if (!aiSaving) setAiOpen(o) }}>
        <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0">

          {/* Header */}
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-violet-700">
              <Sparkles className="w-5 h-5" />
              Ajuda da IA — Melhorar Pergunta
            </DialogTitle>
            {aiTarget && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                Pergunta atual: &quot;{aiTarget.question_text}&quot;
              </p>
            )}
          </DialogHeader>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

            {/* ── STEP: input ─────────────────────────────────────────────── */}
            {(aiStep === 'input' || aiStep === 'loading') && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    O que você gostaria de melhorar ou ajustar?
                  </Label>
                  <Textarea
                    value={aiRequest}
                    onChange={e => setAiRequest(e.target.value)}
                    disabled={aiStep === 'loading'}
                    rows={5}
                    placeholder={
                      'Exemplos:\n' +
                      '• "Quero que as alternativas fiquem mais naturais e menos óbvias"\n' +
                      '• "Mude o valor cultural para comprometimento e ajuste as pontuações"\n' +
                      '• "Reescreva a pergunta com foco em trabalho em equipe em ambiente de padaria"\n' +
                      '• "As respostas estão muito parecidas, diferencie mais cada perfil"'
                    }
                    className="text-sm resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Seja específico! Quanto mais detalhe, melhor o resultado da IA.
                  </p>
                </div>

                {/* Prévia da pergunta atual */}
                {aiTarget && (
                  <div className="bg-[#f8f9fb] border rounded-lg p-3 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pergunta atual</p>
                    <p className="text-sm font-medium">{aiTarget.question_text}</p>
                    <div className="space-y-0.5 mt-1">
                      {(aiTarget.options || []).map((opt, i) => {
                        const l = LETTERS[i]
                        const s = (aiTarget.scores as Record<string, number>)?.[l] ?? 0
                        return (
                          <p key={i} className={`text-xs ${l === aiTarget.ideal_answer ? 'text-emerald-700 font-medium' : 'text-muted-foreground'}`}>
                            {l === aiTarget.ideal_answer && '✓ '}{opt} <ScoreBadge score={s} />
                          </p>
                        )
                      })}
                    </div>
                    {aiTarget.culture_value && (
                      <p className="text-xs text-violet-600 mt-1">Valor cultural: {aiTarget.culture_value}</p>
                    )}
                  </div>
                )}

                {aiError && (
                  <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {aiError}
                  </div>
                )}
              </>
            )}

            {/* ── STEP: loading ────────────────────────────────────────────── */}
            {aiStep === 'loading' && (
              <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
                <span className="text-sm">A IA está analisando e melhorando a pergunta...</span>
              </div>
            )}

            {/* ── STEP: review ─────────────────────────────────────────────── */}
            {aiStep === 'review' && aiSuggestion && (
              <>
                {/* Explicação da IA */}
                {aiSuggestion.explanation && (
                  <div className="flex items-start gap-2 text-sm bg-violet-50 border border-violet-200 rounded-lg p-3 text-violet-800">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-violet-500" />
                    <p>{aiSuggestion.explanation}</p>
                  </div>
                )}

                <p className="text-sm font-medium text-[#333] border-b pb-2">
                  Revise e ajuste a sugestão antes de salvar:
                </p>

                {/* Pergunta sugerida */}
                <div className="space-y-1">
                  <Label>Pergunta</Label>
                  <Textarea
                    value={sugForm.question_text}
                    onChange={e => setSugForm(f => ({ ...f, question_text: e.target.value }))}
                    rows={2}
                    className="text-base resize-none"
                  />
                </div>

                {/* Alternativas sugeridas */}
                <div className="grid grid-cols-2 gap-3">
                  {LETTERS.map(letter => (
                    <div key={letter} className="space-y-1 bg-[#fafafa] border rounded-lg p-3">
                      <Label className="text-xs font-semibold text-muted-foreground">Opção {letter}</Label>
                      <Input
                        value={sugForm[`opt${letter}` as keyof typeof sugForm] as string}
                        onChange={e => setSugForm(f => ({ ...f, [`opt${letter}`]: e.target.value }))}
                        className="text-sm"
                      />
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">Pts (0-10)</Label>
                        <Input
                          type="number" min={0} max={10}
                          value={sugForm[`score${letter}` as keyof typeof sugForm] as number}
                          onChange={e => setSugForm(f => ({ ...f, [`score${letter}`]: Number(e.target.value) }))}
                          className="text-sm w-16"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Resposta Ideal</Label>
                    <Input
                      value={sugForm.ideal_answer}
                      onChange={e => setSugForm(f => ({ ...f, ideal_answer: e.target.value.toUpperCase() }))}
                      maxLength={1}
                      className="text-base font-bold text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Valor Cultural</Label>
                    <select
                      className="w-full border rounded-md px-2 py-2 text-sm bg-white"
                      value={sugForm.culture_value}
                      onChange={e => setSugForm(f => ({ ...f, culture_value: e.target.value }))}
                    >
                      <option value="">Selecionar...</option>
                      {CULTURE_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer com ações */}
          <div className="px-5 py-3 border-t bg-[#f9fafb] flex items-center justify-between gap-3 shrink-0">

            {/* Voltar / Cancelar */}
            {aiStep === 'review' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAiStep('input')}
                className="text-muted-foreground"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />Ajustar pedido
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setAiOpen(false)} className="text-muted-foreground">
                Cancelar
              </Button>
            )}

            {/* Ação principal */}
            {aiStep === 'input' && (
              <Button
                onClick={handleAiGenerate}
                disabled={!aiRequest.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                Gerar com IA
              </Button>
            )}

            {aiStep === 'loading' && (
              <Button disabled className="bg-violet-600 text-white opacity-70">
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Gerando...
              </Button>
            )}

            {aiStep === 'review' && (
              <Button
                onClick={handleAiApply}
                disabled={aiSaving || !sugForm.question_text.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {aiSaving
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando...</>
                  : <><CheckCircle2 className="w-4 h-4 mr-1.5" />Aplicar e Salvar</>
                }
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
