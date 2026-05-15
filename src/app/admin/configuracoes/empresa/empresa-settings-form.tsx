'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { AiSettings } from '@/types'

export function EmpresaSettingsForm({ settings }: { settings: AiSettings | null }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    mission: settings?.mission || '',
    vision: settings?.vision || '',
    company_culture: settings?.company_culture || '',
    ideal_candidate_profile: settings?.ideal_candidate_profile || '',
    desired_behaviors: (settings?.desired_behaviors || []).join('\n'),
    alert_behaviors: (settings?.alert_behaviors || []).join('\n'),
  })

  async function handleSave() {
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    const data = {
      mission: form.mission,
      vision: form.vision,
      company_culture: form.company_culture,
      ideal_candidate_profile: form.ideal_candidate_profile,
      desired_behaviors: form.desired_behaviors.split('\n').filter(Boolean),
      alert_behaviors: form.alert_behaviors.split('\n').filter(Boolean),
      updated_at: new Date().toISOString(),
    }
    if (settings?.id) {
      await supabase.from('ai_settings').update(data).eq('id', settings.id)
    } else {
      await supabase.from('ai_settings').insert(data)
    }
    setSaving(false)
    router.refresh()
    alert('Configurações salvas!')
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Empresa e Cultura</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure a identidade e valores que guiam a análise da IA</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Missão</Label>
          <Input value={form.mission} onChange={e => setForm(f => ({ ...f, mission: e.target.value }))} placeholder="Ex: Servir com excelência, cuidado e sabor." />
        </div>
        <div className="space-y-1">
          <Label>Visão</Label>
          <Input value={form.vision} onChange={e => setForm(f => ({ ...f, vision: e.target.value }))} placeholder="Ex: Ser referência em Petrópolis." />
        </div>
        <div className="space-y-1">
          <Label>Cultura da Empresa</Label>
          <Textarea value={form.company_culture} onChange={e => setForm(f => ({ ...f, company_culture: e.target.value }))} rows={5} />
        </div>
        <div className="space-y-1">
          <Label>Perfil Ideal do Colaborador</Label>
          <Textarea value={form.ideal_candidate_profile} onChange={e => setForm(f => ({ ...f, ideal_candidate_profile: e.target.value }))} rows={4} />
        </div>
        <div className="space-y-1">
          <Label>Comportamentos Desejados (um por linha)</Label>
          <Textarea value={form.desired_behaviors} onChange={e => setForm(f => ({ ...f, desired_behaviors: e.target.value }))} rows={6} placeholder="Pontualidade&#10;Respeito&#10;Boa comunicação" />
        </div>
        <div className="space-y-1">
          <Label>Comportamentos de Alerta (um por linha)</Label>
          <Textarea value={form.alert_behaviors} onChange={e => setForm(f => ({ ...f, alert_behaviors: e.target.value }))} rows={6} placeholder="Falta de disponibilidade&#10;Postura agressiva" />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  )
}
