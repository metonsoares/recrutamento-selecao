'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { AiSettings } from '@/types'
import { Sparkles, Loader2, Key, Eye, EyeOff, CheckCircle2 } from 'lucide-react'

type FieldKey =
  | 'mission'
  | 'vision'
  | 'company_culture'
  | 'ideal_candidate_profile'
  | 'desired_behaviors'
  | 'alert_behaviors'
  | 'whatsapp_agent_prompt'
  | 'analysis_prompt'

// ─── helpers ────────────────────────────────────────────────────────────────

function maskKey(key: string | null): string {
  if (!key) return ''
  return '••••••••••••' + key.slice(-4)
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EmpresaSettingsForm({ settings }: { settings: AiSettings | null }) {
  const router = useRouter()

  // ── Dados da empresa ──────────────────────────────────────────────────────
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

  // ── Config da IA ──────────────────────────────────────────────────────────
  const [savingAi, setSavingAi] = useState(false)
  const [aiForm, setAiForm] = useState({
    whatsapp_agent_prompt: settings?.whatsapp_agent_prompt || '',
    analysis_prompt: settings?.analysis_prompt || '',
    culture_weight: settings?.culture_weight ?? 0.5,
    experience_weight: settings?.experience_weight ?? 0.35,
    availability_weight: settings?.availability_weight ?? 0.15,
  })

  // ── Chave de API ──────────────────────────────────────────────────────────
  const [savingKey, setSavingKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keyStatus, setKeyStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const hasStoredKey = !!settings?.anthropic_api_key_encrypted

  const totalWeight =
    Number(aiForm.culture_weight) +
    Number(aiForm.experience_weight) +
    Number(aiForm.availability_weight)

  // ── Salvar dados da empresa ───────────────────────────────────────────────
  async function handleSaveEmpresa() {
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
    alert('Dados da empresa salvos!')
  }

  // ── Salvar config da IA ───────────────────────────────────────────────────
  async function handleSaveAi() {
    setSavingAi(true)
    const supabase = createSupabaseBrowserClient()
    const data = {
      whatsapp_agent_prompt: aiForm.whatsapp_agent_prompt,
      analysis_prompt: aiForm.analysis_prompt,
      culture_weight: Number(aiForm.culture_weight),
      experience_weight: Number(aiForm.experience_weight),
      availability_weight: Number(aiForm.availability_weight),
      updated_at: new Date().toISOString(),
    }
    if (settings?.id) {
      await supabase.from('ai_settings').update(data).eq('id', settings.id)
    } else {
      await supabase.from('ai_settings').insert(data)
    }
    setSavingAi(false)
    router.refresh()
    alert('Configuração da IA salva!')
  }

  // ── Salvar chave de API ───────────────────────────────────────────────────
  async function handleSaveKey() {
    if (!apiKey.trim()) return
    setSavingKey(true)
    setKeyStatus('idle')
    try {
      const res = await fetch('/api/admin/ai/save-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: apiKey.trim(), settingsId: settings?.id }),
      })
      if (res.ok) {
        setKeyStatus('saved')
        setApiKey('')
        router.refresh()
      } else {
        setKeyStatus('error')
      }
    } catch {
      setKeyStatus('error')
    } finally {
      setSavingKey(false)
    }
  }

  // ── Ajustar campo com IA ──────────────────────────────────────────────────
  async function handleImprove(field: FieldKey) {
    const value = field in form
      ? (form as Record<string, string>)[field]
      : (aiForm as Record<string, unknown>)[field] as string

    if (!value?.trim()) {
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
        if (field in form) {
          setForm(f => ({ ...f, [field]: data.improved }))
        } else {
          setAiForm(f => ({ ...f, [field]: data.improved }))
        }
      } else {
        alert(data.error || 'Erro ao ajustar com IA.')
      }
    } catch {
      alert('Erro ao conectar com a IA.')
    } finally {
      setImprovingField(null)
    }
  }

  // ── Sub-componente: label com botão de IA ─────────────────────────────────
  function FieldLabel({ label, field }: { label: string; field: FieldKey }) {
    const isImproving = improvingField === field
    return (
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <Label className="text-sm">{label}</Label>
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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-8 max-w-3xl">

      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Dados da Empresa</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Identidade, cultura e configurações de IA para análise de candidatos
        </p>
      </div>

      {/* ══ SEÇÃO 1: Empresa ════════════════════════════════════════════════ */}
      <section className="space-y-5">
        <h2 className="text-base font-semibold text-[#333333] border-b pb-2">Empresa</h2>

        <div>
          <FieldLabel label="Missão" field="mission" />
          <Input
            value={form.mission}
            onChange={e => setForm(f => ({ ...f, mission: e.target.value }))}
            placeholder="Ex: Servir com excelência, cuidado e sabor."
            className="text-base"
          />
        </div>

        <div>
          <FieldLabel label="Visão" field="vision" />
          <Input
            value={form.vision}
            onChange={e => setForm(f => ({ ...f, vision: e.target.value }))}
            placeholder="Ex: Ser referência em Petrópolis."
            className="text-base"
          />
        </div>

        <div>
          <FieldLabel label="Cultura da Empresa" field="company_culture" />
          <Textarea
            value={form.company_culture}
            onChange={e => setForm(f => ({ ...f, company_culture: e.target.value }))}
            rows={5}
            className="text-base resize-none"
          />
        </div>

        <div>
          <FieldLabel label="Perfil Ideal do Colaborador" field="ideal_candidate_profile" />
          <Textarea
            value={form.ideal_candidate_profile}
            onChange={e => setForm(f => ({ ...f, ideal_candidate_profile: e.target.value }))}
            rows={4}
            className="text-base resize-none"
          />
        </div>

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

        <Button onClick={handleSaveEmpresa} disabled={saving} className="w-full sm:w-auto">
          {saving ? 'Salvando...' : 'Salvar Dados da Empresa'}
        </Button>
      </section>

      {/* ══ SEÇÃO 2: Configuração da IA ═════════════════════════════════════ */}
      <section className="space-y-5">
        <h2 className="text-base font-semibold text-[#333333] border-b pb-2">Configuração da IA</h2>

        {/* Pesos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Peso Cultura</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Input
                type="number" step="0.05" min="0" max="1"
                value={aiForm.culture_weight}
                onChange={e => setAiForm(f => ({ ...f, culture_weight: Number(e.target.value) }))}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {(Number(aiForm.culture_weight) * 100).toFixed(0)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Peso Experiência</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Input
                type="number" step="0.05" min="0" max="1"
                value={aiForm.experience_weight}
                onChange={e => setAiForm(f => ({ ...f, experience_weight: Number(e.target.value) }))}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {(Number(aiForm.experience_weight) * 100).toFixed(0)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Peso Disponibilidade</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Input
                type="number" step="0.05" min="0" max="1"
                value={aiForm.availability_weight}
                onChange={e => setAiForm(f => ({ ...f, availability_weight: Number(e.target.value) }))}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {(Number(aiForm.availability_weight) * 100).toFixed(0)}%
              </p>
            </CardContent>
          </Card>
        </div>

        {Math.abs(totalWeight - 1) > 0.01 && (
          <p className="text-amber-600 text-sm">
            ⚠️ A soma dos pesos deve ser 1.00 (atual: {totalWeight.toFixed(2)})
          </p>
        )}

        {/* Prompts */}
        <div>
          <FieldLabel label="Prompt da IA Atendente (WhatsApp)" field="whatsapp_agent_prompt" />
          <Textarea
            value={aiForm.whatsapp_agent_prompt}
            onChange={e => setAiForm(f => ({ ...f, whatsapp_agent_prompt: e.target.value }))}
            rows={6}
            className="text-base resize-none font-mono text-xs"
            placeholder="Você é um assistente de recrutamento da Brownie do Ton. Seja simpático e profissional..."
          />
        </div>

        <div>
          <FieldLabel label="Prompt da IA Analista (Análise de Candidatos)" field="analysis_prompt" />
          <Textarea
            value={aiForm.analysis_prompt}
            onChange={e => setAiForm(f => ({ ...f, analysis_prompt: e.target.value }))}
            rows={6}
            className="text-base resize-none font-mono text-xs"
            placeholder="Analise o candidato com base nas respostas do formulário e teste cultural..."
          />
        </div>

        <Button onClick={handleSaveAi} disabled={savingAi} className="w-full sm:w-auto">
          {savingAi ? 'Salvando...' : 'Salvar Configuração da IA'}
        </Button>
      </section>

      {/* ══ SEÇÃO 3: Chave de API ═══════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-[#333333] border-b pb-2">Chave de API (Anthropic / Claude)</h2>

        <p className="text-sm text-muted-foreground">
          A chave é necessária para as funcionalidades de IA: &quot;Ajustar com IA&quot;, busca de CBO e análise de candidatos.
          Ela é armazenada de forma criptografada.
        </p>

        {hasStoredKey && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Chave salva: <span className="font-mono">{maskKey(settings?.anthropic_api_key_encrypted || null)}</span>
          </div>
        )}

        <div className="space-y-1">
          <Label className="flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />
            {hasStoredKey ? 'Substituir chave' : 'Adicionar chave'}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setKeyStatus('idle') }}
                placeholder="sk-ant-api03-..."
                className="text-base pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              onClick={handleSaveKey}
              disabled={savingKey || !apiKey.trim()}
              className="shrink-0"
            >
              {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
            </Button>
          </div>

          {keyStatus === 'saved' && (
            <p className="flex items-center gap-1 text-xs text-green-600 mt-1">
              <CheckCircle2 className="w-3 h-3" />Chave salva com sucesso!
            </p>
          )}
          {keyStatus === 'error' && (
            <p className="text-xs text-red-500 mt-1">Erro ao salvar a chave. Tente novamente.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Obtenha sua chave em{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-violet-600 hover:text-violet-800"
            >
              console.anthropic.com
            </a>
          </p>
        </div>
      </section>

    </div>
  )
}
