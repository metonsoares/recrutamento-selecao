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
import { Plus, Pencil, Trash2, Search, Loader2, CheckCircle2, XCircle } from 'lucide-react'

const EMPTY_FORM = {
  title: '',          // Nome da vaga (dado pela empresa)
  cbo_code: '',       // Código CBO
  cbo_title: '',      // Título oficial do cargo conforme CBO (auto-preenchido)
  description: '',    // Descrição do cargo (auto-preenchida ou manual)
}

type FormState = typeof EMPTY_FORM

export function JobsManager({ jobs }: { jobs: Job[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Job | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Job | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [searchingCbo, setSearchingCbo] = useState(false)
  const [cboStatus, setCboStatus] = useState<'idle' | 'found' | 'not_found'>('idle')

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setCboStatus('idle')
    setOpen(true)
  }

  function openEdit(job: Job) {
    setEditing(job)
    setForm({
      title: job.title,
      cbo_code: job.cbo_code || '',
      cbo_title: job.cbo_title || '',
      description: job.description || '',
    })
    setCboStatus(job.cbo_code ? 'found' : 'idle')
    setOpen(true)
  }

  // Formata o código enquanto o usuário digita: XXXX-XX
  function formatCboInput(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    if (digits.length > 4) return digits.slice(0, 4) + '-' + digits.slice(4)
    return digits
  }

  async function searchCbo() {
    const code = form.cbo_code.trim()
    if (!code || code.replace(/\D/g, '').length < 5) return

    setSearchingCbo(true)
    setCboStatus('idle')

    try {
      const res = await fetch('/api/admin/cbo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()

      if (data.encontrado && data.titulo) {
        setForm(f => ({
          ...f,
          cbo_code: data.codigo || f.cbo_code,
          cbo_title: data.titulo,
          // Preenche a descrição apenas se estiver vazia
          description: f.description.trim() ? f.description : (data.descricao || ''),
        }))
        setCboStatus('found')
      } else {
        setCboStatus('not_found')
      }
    } catch {
      setCboStatus('not_found')
    } finally {
      setSearchingCbo(false)
    }
  }

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    const supabase = createSupabaseBrowserClient()

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      cbo_code: form.cbo_code.trim() || null,
      cbo_title: form.cbo_title.trim() || null,
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

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-w-full overflow-x-hidden">

      {/* Cabeçalho */}
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

      {/* Grid de cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.map(job => (
          <div key={job.id} className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{job.title}</h3>
                {job.cbo_code && (
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">CBO {job.cbo_code}</p>
                )}
                {job.cbo_title && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{job.cbo_title}</p>
                )}
              </div>
              <Badge variant={job.is_active ? 'default' : 'secondary'} className="shrink-0">
                {job.is_active ? 'Ativa' : 'Inativa'}
              </Badge>
            </div>
            {job.description && (
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
        ))}
      </div>

      {/* ── Dialog: Nova / Editar Vaga ──────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Vaga' : 'Nova Vaga'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">

            {/* 1. Nome do cargo (dado pela empresa) */}
            <div className="space-y-1">
              <Label>Nome do Cargo *</Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Atendimento, Caixa, Balconista…"
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">Nome interno da vaga usado pela empresa.</p>
            </div>

            {/* 2. Código CBO */}
            <div className="space-y-1">
              <Label>Código CBO</Label>
              <div className="flex gap-2">
                <Input
                  value={form.cbo_code}
                  onChange={e => {
                    setForm(f => ({ ...f, cbo_code: formatCboInput(e.target.value) }))
                    setCboStatus('idle')
                  }}
                  onKeyDown={e => e.key === 'Enter' && searchCbo()}
                  placeholder="Ex: 4221-05"
                  className="text-base font-mono"
                  maxLength={7}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={searchCbo}
                  disabled={searchingCbo || form.cbo_code.replace(/\D/g, '').length < 5}
                  className="shrink-0 w-10 px-0"
                  title="Buscar cargo pelo código CBO"
                >
                  {searchingCbo
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Search className="w-4 h-4" />
                  }
                </Button>
              </div>

              {/* Feedback da busca */}
              {cboStatus === 'found' && (
                <p className="flex items-center gap-1 text-xs text-green-600 mt-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Cargo encontrado! Título CBO preenchido automaticamente.
                </p>
              )}
              {cboStatus === 'not_found' && (
                <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                  <XCircle className="w-3 h-3" />
                  Código não localizado. Verifique o código ou preencha o título manualmente.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Digite o código e clique na lupa para buscar o cargo automaticamente.
              </p>
            </div>

            {/* 3. Título do cargo CBO (auto-preenchido, editável) */}
            <div className="space-y-1">
              <Label>
                Título do Cargo CBO
                {cboStatus === 'found' && (
                  <span className="ml-1 text-xs text-green-600 font-normal">(preenchido automaticamente)</span>
                )}
              </Label>
              <Input
                value={form.cbo_title}
                onChange={e => setForm(f => ({ ...f, cbo_title: e.target.value }))}
                placeholder="Título oficial conforme CBO 2002"
                className={`text-base ${cboStatus === 'found' ? 'bg-green-50 border-green-200' : ''}`}
              />
              <p className="text-xs text-muted-foreground">
                Título oficial do cargo conforme a Classificação Brasileira de Ocupações.
              </p>
            </div>

            {/* 4. Descrição do cargo */}
            <div className="space-y-1">
              <Label>Descrição do Cargo</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={4}
                placeholder="Descreva as principais atividades e responsabilidades…"
                className="text-base resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !form.title.trim()}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirmação de remoção ──────────────────────── */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Remover vaga</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover a vaga <strong>{confirmDelete?.title}</strong>?
            Essa ação não pode ser desfeita.
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
