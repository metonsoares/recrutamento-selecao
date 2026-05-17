'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { FormSection } from '@/types'
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown,
  GripVertical, Info,
} from 'lucide-react'

const EMPTY_FORM = {
  name: '',
  description: '',
  category: '',
  sort_order: 1,
  is_active: true,
}

export function SectionsManager({ sections: initial }: { sections: FormSection[] }) {
  const router = useRouter()
  const [sections, setSections] = useState<FormSection[]>(initial)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FormSection | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FormSection | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [moving, setMoving] = useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, sort_order: sections.length + 1 })
    setOpen(true)
  }

  function openEdit(s: FormSection) {
    setEditing(s)
    setForm({
      name: s.name,
      description: s.description || '',
      category: s.category || '',
      sort_order: s.sort_order,
      is_active: s.is_active,
    })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    const supabase = createSupabaseBrowserClient()

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      sort_order: form.sort_order,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    }

    if (editing) {
      await supabase.from('form_sections').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('form_sections').insert(payload)
    }

    setSaving(false)
    setOpen(false)
    router.refresh()
    // Reload sections from router
  }

  async function handleDelete(s: FormSection) {
    const supabase = createSupabaseBrowserClient()
    await supabase.from('form_sections').delete().eq('id', s.id)
    setConfirmDelete(null)
    router.refresh()
  }

  async function moveSection(s: FormSection, direction: 'up' | 'down') {
    const idx = sections.findIndex(x => x.id === s.id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= sections.length) return

    const target = sections[targetIdx]
    setMoving(s.id)

    const supabase = createSupabaseBrowserClient()
    // Troca os sort_order
    await Promise.all([
      supabase.from('form_sections').update({ sort_order: target.sort_order }).eq('id', s.id),
      supabase.from('form_sections').update({ sort_order: s.sort_order }).eq('id', target.id),
    ])

    // Atualiza estado local imediatamente para feedback visual
    const updated = [...sections]
    updated[idx] = { ...s, sort_order: target.sort_order }
    updated[targetIdx] = { ...target, sort_order: s.sort_order }
    updated.sort((a, b) => a.sort_order - b.sort_order)
    setSections(updated)
    setMoving(null)
    router.refresh()
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Seções do Formulário</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Defina as etapas que o candidato irá preencher ao se cadastrar
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Nova Seção</span>
          <span className="sm:hidden">Nova</span>
        </Button>
      </div>

      {/* Info box */}
      <div className="flex gap-2 items-start bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          Cada seção representa uma etapa do formulário. As perguntas cadastradas em{' '}
          <strong>Config Currículos → Perguntas</strong> com a categoria correspondente
          serão exibidas nessa etapa. Use as setas para definir a ordem de apresentação.
        </p>
      </div>

      {/* Lista de seções */}
      <div className="space-y-2">
        {sections.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
            Nenhuma seção cadastrada. Clique em &quot;Nova Seção&quot; para começar.
          </div>
        )}

        {sections.map((s, idx) => (
          <div
            key={s.id}
            className={`bg-white border rounded-xl p-4 flex items-center gap-3 transition-opacity ${moving === s.id ? 'opacity-50' : ''}`}
          >
            {/* Grip + ordem */}
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <GripVertical className="w-4 h-4 text-[#ccc]" />
              <span className="text-[11px] font-mono text-[#aaa] leading-none">{s.sort_order}</span>
            </div>

            {/* Setas */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                onClick={() => moveSection(s, 'up')}
                disabled={idx === 0 || !!moving}
                className="p-0.5 rounded hover:bg-[#f0f0f0] disabled:opacity-20 transition-colors"
              >
                <ChevronUp className="w-4 h-4 text-[#555]" />
              </button>
              <button
                onClick={() => moveSection(s, 'down')}
                disabled={idx === sections.length - 1 || !!moving}
                className="p-0.5 rounded hover:bg-[#f0f0f0] disabled:opacity-20 transition-colors"
              >
                <ChevronDown className="w-4 h-4 text-[#555]" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-[#333]">{s.name}</h3>
                {!s.is_active && (
                  <Badge variant="secondary" className="text-xs">Inativa</Badge>
                )}
                {s.category && (
                  <span className="text-xs font-mono bg-[#f5f5f5] border px-1.5 py-0.5 rounded text-[#666]">
                    {s.category}
                  </span>
                )}
              </div>
              {s.description && (
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{s.description}</p>
              )}
            </div>

            {/* Ações */}
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                <Pencil className="w-3 h-3 mr-1" />Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setConfirmDelete(s)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Dialog: Nova / Editar Seção ─────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Seção' : 'Nova Seção'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">

            {/* Nome */}
            <div className="space-y-1">
              <Label>Nome da Seção *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Dados Pessoais, Experiência Profissional…"
                className="text-base"
              />
            </div>

            {/* Categoria */}
            <div className="space-y-1">
              <Label>Categoria (vincula às perguntas)</Label>
              <Input
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="Ex: dados_pessoais"
                className="text-base font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                As perguntas com essa categoria aparecerão nesta seção.
                Use underline no lugar de espaços (ex: <code>dados_pessoais</code>).
              </p>
            </div>

            {/* Descrição */}
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Instruções exibidas ao candidato no topo desta etapa…"
                className="text-base resize-none"
              />
            </div>

            {/* Ordem + Ativo */}
            <div className="flex gap-4 items-end">
              <div className="space-y-1 w-28">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="text-base"
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer pb-1">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4"
                />
                Seção ativa
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirmar remoção ───────────────────────────────────────── */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Remover seção</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover a seção <strong>{confirmDelete?.name}</strong>?
            As perguntas vinculadas a ela <strong>não serão excluídas</strong>,
            mas deixarão de estar associadas a esta seção.
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
