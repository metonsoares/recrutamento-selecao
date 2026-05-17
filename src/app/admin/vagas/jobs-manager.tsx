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
import { Job } from '@/types'
import { Plus, Pencil, Trash2, Search, Loader2, CheckCircle2 } from 'lucide-react'

export function JobsManager({ jobs }: { jobs: Job[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Job | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Job | null>(null)
  const [form, setForm] = useState({ title: '', description: '', cbo_code: '', cbo_description: '' })
  const [saving, setSaving] = useState(false)
  const [searchingCbo, setSearchingCbo] = useState(false)
  const [cboFound, setCboFound] = useState<boolean | null>(null)

  function openCreate() {
    setEditing(null)
    setForm({ title: '', description: '', cbo_code: '', cbo_description: '' })
    setCboFound(null)
    setOpen(true)
  }

  function openEdit(job: Job) {
    setEditing(job)
    setForm({
      title: job.title,
      description: job.description || '',
      cbo_code: job.cbo_code || '',
      cbo_description: job.cbo_description || '',
    })
    setCboFound(null)
    setOpen(true)
  }

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    const payload = {
      title: form.title,
      description: form.description,
      cbo_code: form.cbo_code || null,
      cbo_description: form.cbo_description || null,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      await supabase.from('jobs').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('jobs').insert({ ...payload })
    }
    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  async function handleDelete(job: Job) {
    const supabase = createSupabaseBrowserClient()
    await supabase.from('jobs').delete().eq('id', job.id)
    setConfirmDelete(null)
    router.refresh()
  }

  async function searchCbo() {
    const code = form.cbo_code.trim()
    if (!code) return
    setSearchingCbo(true)
    setCboFound(null)
    try {
      const res = await fetch('/api/admin/cbo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (data.encontrado) {
        setForm(f => ({
          ...f,
          cbo_code: data.codigo,
          title: f.title || data.titulo,
          cbo_description: data.descricao,
        }))
        setCboFound(true)
      } else {
        setCboFound(false)
      }
    } catch {
      setCboFound(false)
    } finally {
      setSearchingCbo(false)
    }
  }

  function formatCboInput(value: string) {
    // Formata automaticamente: 5141-05 ou 514105
    const digits = value.replace(/\D/g, '').slice(0, 6)
    if (digits.length > 4) return digits.slice(0, 4) + '-' + digits.slice(4)
    return digits
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Vagas</h1>
          <p className="text-muted-foreground text-sm mt-1">{jobs.length} vagas cadastradas</p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Nova Vaga</span>
          <span className="sm:hidden">Nova</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.map(job => {
          return (
            <div key={job.id} className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{job.title}</h3>
                  {job.cbo_code && (
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">CBO {job.cbo_code}</p>
                  )}
                </div>
                <Badge variant={job.is_active ? 'default' : 'secondary'} className="shrink-0">
                  {job.is_active ? 'Ativa' : 'Inativa'}
                </Badge>
              </div>
              {job.cbo_description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{job.cbo_description}</p>
              )}
              {!job.cbo_description && job.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{job.description}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(job)}>
                  <Pencil className="w-3 h-3 mr-1" />Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setConfirmDelete(job)}
                >
                  <Trash2 className="w-3 h-3 mr-1" />Remover
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Dialog — Nova / Editar Vaga */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Vaga' : 'Nova Vaga'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            {/* CBO */}
            <div className="space-y-1">
              <Label>Código CBO</Label>
              <div className="flex gap-2">
                <Input
                  value={form.cbo_code}
                  onChange={e => {
                    const formatted = formatCboInput(e.target.value)
                    setForm(f => ({ ...f, cbo_code: formatted }))
                    setCboFound(null)
                  }}
                  onKeyDown={e => e.key === 'Enter' && searchCbo()}
                  placeholder="Ex: 5141-05"
                  className="text-base font-mono"
                  maxLength={7}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={searchCbo}
                  disabled={searchingCbo || !form.cbo_code.trim()}
                  className="shrink-0"
                >
                  {searchingCbo
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Search className="w-4 h-4" />
                  }
                </Button>
              </div>
              {cboFound === true && (
                <p className="flex items-center gap-1 text-xs text-green-600 mt-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Cargo encontrado! Título e descrição preenchidos automaticamente.
                </p>
              )}
              {cboFound === false && (
                <p className="text-xs text-red-500 mt-1">Código CBO não encontrado. Verifique e tente novamente.</p>
              )}
              <p className="text-xs text-muted-foreground">Digite o código e clique na lupa para buscar o cargo automaticamente.</p>
            </div>

            {/* Título */}
            <div className="space-y-1">
              <Label>Título do Cargo *</Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Atendente de Loja"
                className="text-base"
              />
            </div>

            {/* Descrição CBO (auto-preenchida ou manual) */}
            <div className="space-y-1">
              <Label>Descrição do Cargo</Label>
              <Textarea
                value={form.cbo_description || form.description}
                onChange={e => setForm(f => ({
                  ...f,
                  cbo_description: e.target.value,
                  description: e.target.value,
                }))}
                rows={4}
                placeholder="Descreva as principais atividades e responsabilidades..."
                className="text-base resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !form.title.trim()}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de remoção */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Remover vaga</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover a vaga <strong>{confirmDelete?.title}</strong>? Essa ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => confirmDelete && handleDelete(confirmDelete)}>
              <Trash2 className="w-4 h-4 mr-1" />Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
