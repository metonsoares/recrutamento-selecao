'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { AiSettings } from '@/types'
import { Sparkles, Loader2 } from 'lucide-react'

type FieldKey = 'mission' | 'vision' | 'company_culture' | 'ideal_candidate_profile' | 'desired_behaviors' | 'alert_behaviors'

export function EmpresaSettingsForm({ settings }: { settings: AiSettings | null }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [improvingField, setImprovingField] = useState<FieldKey | null>(null)
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

  async function handleImprove(field: FieldKey) {
    const value = form[field]
    if (!value.trim()) {
      alert('Preencha o campo antes de melhorar com IA.')
      return
    }
    setImprovingField(field)
    try {
      const res = await fetch('/api/admin/ai/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value }),
      })
      const data = await res.json()
      if (data.improved) {
        setForm(f => ({ ...f, [field]: data.improved }))
      } else {
        alert(data.error || 'Erro ao melhorar texto com IA.')
      }
    } catch {
      alert('Erro ao conectar com a IA.')
    } finally {
      setImprovingField(null)
    }
  }

  function FieldLabel({ label, field }: { label: string; field: FieldKey }) {
    const isImproving = improvingField === field
    return (
      <div className="flex items-center justify-between gap-2 mb-1">
        <Label>{label}</Label>
        <button
          type="button"
          onClick={() => handleImprove(field)}
          disabled={isImproving || !!improvingField}
          className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          title="Melhorar com IA"
        >
          {isImproving
            ? <><Loader2 className="w-3 h-3 animate-spin" />Ajustando...</>
            : <><Sparkles className="w-3 h-3" />Ajustar com IA</>
          }
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Empresa e Cultura</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure a identidade e valores que guiam a análise da IA</p>
      </div>

      <div className="space-y-5">
        {/* Missão */}
        <div>
          <FieldLabel label="Missão" field="mission" />
          <Input
            value={form.mission}
            onChange={e => setForm(f => ({ ...f, mission: e.target.value }))}
            placeholder="Ex: Servir com excelência, cuidado e sabor."
            className="text-base"
          />
        </div>

        {/* Visão */}
        <div>
          <FieldLabel label="Visão" field="vision" />
          <Input
            value={form.vision}
            onChange={e => setForm(f => ({ ...f, vision: e.target.value }))}
            placeholder="Ex: Ser referência em Petrópolis."
            className="text-base"
          />
        </div>

        {/* Cultura */}
        <div>
          <FieldLabel label="Cultura da Empresa" field="company_culture" />
          <Textarea
            value={form.company_culture}
            onChange={e => setForm(f => ({ ...f, company_culture: e.target.value }))}
            rows={5}
            className="text-base resize-none"
          />
        </div>

        {/* Perfil Ideal */}
        <div>
          <FieldLabel label="Perfil Ideal do Colaborador" field="ideal_candidate_profile" />
          <Textarea
            value={form.ideal_candidate_profile}
            onChange={e => setForm(f => ({ ...f, ideal_candidate_profile: e.target.value }))}
            rows={4}
            className="text-base resize-none"
          />
        </div>

        {/* Comportamentos Desejados */}
        <div>
          <FieldLabel label="Comportamentos Desejados (um por linha)" field="desired_behaviors" />
          <Textarea
            value={form.desired_behaviors}
            onChange={e => setForm(f => ({ ...f, desired_behaviors: e.target.value }))}
            rows={6}
            placeholder={'Pontualidade\nRespeito\nBoa comunicação'}
            className="text-base resize-none"
          />
        </div>

        {/* Comportamentos de Alerta */}
        <div>
          <FieldLabel label="Comportamentos de Alerta (um por linha)" field="alert_behaviors" />
          <Textarea
            value={form.alert_behaviors}
            onChange={e => setForm(f => ({ ...f, alert_behaviors: e.target.value }))}
            rows={6}
            placeholder={'Falta de disponibilidade\nPostura agressiva'}
            className="text-base resize-none"
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  )
}
