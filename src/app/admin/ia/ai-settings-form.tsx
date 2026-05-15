'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { AiSettings } from '@/types'

export function AiSettingsForm({ settings }: { settings: AiSettings | null }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    company_culture: settings?.company_culture || '',
    ideal_candidate_profile: settings?.ideal_candidate_profile || '',
    whatsapp_agent_prompt: settings?.whatsapp_agent_prompt || '',
    analysis_prompt: settings?.analysis_prompt || '',
    culture_weight: settings?.culture_weight ?? 0.5,
    experience_weight: settings?.experience_weight ?? 0.35,
    availability_weight: settings?.availability_weight ?? 0.15,
    mission: settings?.mission || '',
    vision: settings?.vision || '',
  })

  async function handleSave() {
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    if (settings?.id) {
      await supabase.from('ai_settings').update({ ...form, updated_at: new Date().toISOString() }).eq('id', settings.id)
    } else {
      await supabase.from('ai_settings').insert(form)
    }
    setSaving(false)
    router.refresh()
    alert('Configurações salvas!')
  }

  const totalWeight = Number(form.culture_weight) + Number(form.experience_weight) + Number(form.availability_weight)

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Configuração da IA</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure os prompts, cultura e pesos de análise da IA</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Peso Cultura</CardTitle></CardHeader>
          <CardContent>
            <Input type="number" step="0.05" min="0" max="1" value={form.culture_weight}
              onChange={e => setForm(f => ({ ...f, culture_weight: Number(e.target.value) }))} />
            <p className="text-xs text-muted-foreground mt-1">{(Number(form.culture_weight) * 100).toFixed(0)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Peso Experiência</CardTitle></CardHeader>
          <CardContent>
            <Input type="number" step="0.05" min="0" max="1" value={form.experience_weight}
              onChange={e => setForm(f => ({ ...f, experience_weight: Number(e.target.value) }))} />
            <p className="text-xs text-muted-foreground mt-1">{(Number(form.experience_weight) * 100).toFixed(0)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Peso Disponibilidade</CardTitle></CardHeader>
          <CardContent>
            <Input type="number" step="0.05" min="0" max="1" value={form.availability_weight}
              onChange={e => setForm(f => ({ ...f, availability_weight: Number(e.target.value) }))} />
            <p className="text-xs text-muted-foreground mt-1">{(Number(form.availability_weight) * 100).toFixed(0)}%</p>
          </CardContent>
        </Card>
      </div>

      {Math.abs(totalWeight - 1) > 0.01 && (
        <p className="text-amber-600 text-sm">⚠️ A soma dos pesos deve ser 1.00 (atual: {totalWeight.toFixed(2)})</p>
      )}

      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Missão</Label>
          <Input value={form.mission} onChange={e => setForm(f => ({ ...f, mission: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Visão</Label>
          <Input value={form.vision} onChange={e => setForm(f => ({ ...f, vision: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Cultura da Empresa</Label>
          <Textarea value={form.company_culture} onChange={e => setForm(f => ({ ...f, company_culture: e.target.value }))} rows={4} />
        </div>
        <div className="space-y-1">
          <Label>Perfil Ideal do Colaborador</Label>
          <Textarea value={form.ideal_candidate_profile} onChange={e => setForm(f => ({ ...f, ideal_candidate_profile: e.target.value }))} rows={4} />
        </div>
        <div className="space-y-1">
          <Label>Prompt da IA Atendente (WhatsApp)</Label>
          <Textarea value={form.whatsapp_agent_prompt} onChange={e => setForm(f => ({ ...f, whatsapp_agent_prompt: e.target.value }))} rows={6} className="font-mono text-xs" />
        </div>
        <div className="space-y-1">
          <Label>Prompt da IA Analista</Label>
          <Textarea value={form.analysis_prompt} onChange={e => setForm(f => ({ ...f, analysis_prompt: e.target.value }))} rows={6} className="font-mono text-xs" />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar Configurações'}
      </Button>
    </div>
  )
}
