'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { Job } from '@/types'
import { Plus, Pencil, Power } from 'lucide-react'

export function JobsManager({ jobs }: { jobs: Job[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Job | null>(null)
  const [form, setForm] = useState({ title: '', description: '', unit: '', salary_range: '', benefits: '' })
  const [saving, setSaving] = useState(false)

  function openCreate() {
    setEditing(null)
    setForm({ title: '', description: '', unit: '', salary_range: '', benefits: '' })
    setOpen(true)
  }

  function openEdit(job: Job) {
    setEditing(job)
    setForm({ title: job.title, description: job.description || '', unit: job.unit || '', salary_range: job.salary_range || '', benefits: job.benefits || '' })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    if (editing) {
      await supabase.from('jobs').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editing.id)
    } else {
      await supabase.from('jobs').insert({ ...form })
    }
    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  async function toggleActive(job: Job) {
    const supabase = createSupabaseBrowserClient()
    await supabase.from('jobs').update({ is_active: !job.is_active }).eq('id', job.id)
    router.refresh()
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vagas</h1>
          <p className="text-muted-foreground text-sm mt-1">{jobs.length} vagas cadastradas</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Nova Vaga</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.map(job => (
          <div key={job.id} className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{job.title}</h3>
                {job.unit && <p className="text-xs text-muted-foreground">{job.unit}</p>}
              </div>
              <Badge variant={job.is_active ? 'default' : 'secondary'}>
                {job.is_active ? 'Ativa' : 'Inativa'}
              </Badge>
            </div>
            {job.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{job.description}</p>
            )}
            {job.salary_range && (
              <p className="text-xs text-muted-foreground">Salário: {job.salary_range}</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openEdit(job)}>
                <Pencil className="w-3 h-3 mr-1" />Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggleActive(job)}>
                <Power className="w-3 h-3 mr-1" />{job.is_active ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Vaga' : 'Nova Vaga'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Título *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Atendimento" />
            </div>
            <div className="space-y-1">
              <Label>Unidade</Label>
              <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="Ex: Loja Centro" />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Faixa Salarial</Label>
                <Input value={form.salary_range} onChange={e => setForm(f => ({ ...f, salary_range: e.target.value }))} placeholder="Ex: R$ 1.500 - 2.000" />
              </div>
              <div className="space-y-1">
                <Label>Benefícios</Label>
                <Input value={form.benefits} onChange={e => setForm(f => ({ ...f, benefits: e.target.value }))} placeholder="VT, VR..." />
              </div>
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
    </div>
  )
}
