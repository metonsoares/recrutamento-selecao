'use client'
import { useState } from 'react'
import type { ElementType } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Eye, EyeOff, Key, CheckCircle2, Loader2, ExternalLink,
  AlertCircle, FileText, MessageSquare, Building2, Bot,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = 'anthropic' | 'openai'
type KeyStatus = 'idle' | 'saved' | 'error'
type Service = 'analysis' | 'whatsapp' | 'company'

interface Props {
  hasAnthropicKey: boolean
  hasOpenaiKey: boolean
  settingsId: string | null
  analysisProvider: Provider | null
  analysisPrompt: string
  whatsappProvider: Provider | null
  whatsappPrompt: string
  companyProvider: Provider | null
  companyPrompt: string
}

// ─── Provider radio ───────────────────────────────────────────────────────────

function ProviderRadio({
  value,
  onChange,
  hasAnthropicKey,
  hasOpenaiKey,
}: {
  value: Provider | null
  onChange: (v: Provider | null) => void
  hasAnthropicKey: boolean
  hasOpenaiKey: boolean
}) {
  const options: { val: Provider | null; label: string; desc: string; available: boolean }[] = [
    {
      val: null,
      label: 'Automático',
      desc: 'Usa Claude se disponível, senão GPT',
      available: hasAnthropicKey || hasOpenaiKey,
    },
    {
      val: 'anthropic',
      label: 'Anthropic — Claude',
      desc: 'claude-haiku (rápido e preciso)',
      available: hasAnthropicKey,
    },
    {
      val: 'openai',
      label: 'OpenAI — GPT',
      desc: 'gpt-4o-mini (alternativa)',
      available: hasOpenaiKey,
    },
  ]

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      {options.map(opt => {
        const isSelected = value === opt.val
        const disabled = !opt.available
        return (
          <button
            key={String(opt.val)}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.val)}
            className={[
              'flex-1 text-left px-3 py-2.5 rounded-xl border-2 text-sm transition-all',
              isSelected
                ? 'border-primary bg-primary/5 text-primary'
                : disabled
                  ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700',
            ].join(' ')}
          >
            <p className="font-semibold leading-tight">{opt.label}</p>
            <p className="text-[11px] mt-0.5 opacity-70">{opt.desc}</p>
            {disabled && <p className="text-[10px] text-red-400 mt-0.5">Chave não configurada</p>}
          </button>
        )
      })}
    </div>
  )
}

// ─── Service card ─────────────────────────────────────────────────────────────

function ServiceCard({
  icon: Icon,
  title,
  description,
  service,
  provider,
  prompt,
  promptPlaceholder,
  hasAnthropicKey,
  hasOpenaiKey,
}: {
  icon: ElementType
  title: string
  description: string
  service: Service
  provider: Provider | null
  prompt: string
  promptPlaceholder: string
  hasAnthropicKey: boolean
  hasOpenaiKey: boolean
}) {
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(provider)
  const [promptText, setPromptText] = useState(prompt)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  async function save() {
    setSaving(true)
    setStatus('idle')
    try {
      const res = await fetch('/api/admin/ai/save-service-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service,
          provider: selectedProvider,
          prompt: promptText,
        }),
      })
      setStatus(res.ok ? 'saved' : 'error')
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      {/* Provider selector */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-gray-700">Qual IA usar para este serviço?</Label>
        <ProviderRadio
          value={selectedProvider}
          onChange={setSelectedProvider}
          hasAnthropicKey={hasAnthropicKey}
          hasOpenaiKey={hasOpenaiKey}
        />
      </div>

      {/* Prompt */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-gray-700">
          Prompt — como a IA deve se comportar
        </Label>
        <Textarea
          value={promptText}
          onChange={e => { setPromptText(e.target.value); setStatus('idle') }}
          placeholder={promptPlaceholder}
          rows={5}
          className="text-sm resize-y"
        />
        <p className="text-[11px] text-muted-foreground">
          Defina o tom, regras de comportamento e o que a IA deve ou não deve fazer neste serviço.
        </p>
      </div>

      {/* Save */}
      <div className="flex items-center justify-between pt-1">
        <div>
          {status === 'saved' && (
            <p className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" />Configuração salva!
            </p>
          )}
          {status === 'error' && (
            <p className="flex items-center gap-1 text-xs text-red-500">
              <AlertCircle className="w-3.5 h-3.5" />Erro ao salvar. Tente novamente.
            </p>
          )}
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Salvando...</> : 'Salvar configuração'}
        </Button>
      </div>
    </section>
  )
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function IaSettingsForm({
  hasAnthropicKey,
  hasOpenaiKey,
  settingsId,
  analysisProvider,
  analysisPrompt,
  whatsappProvider,
  whatsappPrompt,
  companyProvider,
  companyPrompt,
}: Props) {
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [savingProvider, setSavingProvider] = useState<Provider | null>(null)
  const [statusMap, setStatusMap] = useState<Record<Provider, KeyStatus>>({ anthropic: 'idle', openai: 'idle' })

  async function saveKey(provider: Provider) {
    const key = provider === 'anthropic' ? anthropicKey : openaiKey
    if (!key.trim()) return
    setSavingProvider(provider)
    setStatusMap(s => ({ ...s, [provider]: 'idle' }))
    try {
      const res = await fetch('/api/admin/ai/save-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim(), provider, settingsId }),
      })
      if (res.ok) {
        setStatusMap(s => ({ ...s, [provider]: 'saved' }))
        if (provider === 'anthropic') setAnthropicKey('')
        else setOpenaiKey('')
        setTimeout(() => window.location.reload(), 800)
      } else {
        setStatusMap(s => ({ ...s, [provider]: 'error' }))
      }
    } catch {
      setStatusMap(s => ({ ...s, [provider]: 'error' }))
    } finally {
      setSavingProvider(null)
    }
  }

  const noneConfigured = !hasAnthropicKey && !hasOpenaiKey

  return (
    <div className="p-4 sm:p-6 space-y-8 max-w-3xl">

      {/* Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Configuração de IA</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie as chaves de API e defina qual IA será usada — e como ela deve se comportar — em cada serviço da plataforma.
        </p>
      </div>

      {noneConfigured && (
        <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            Nenhuma chave de IA configurada. Adicione pelo menos uma chave abaixo para habilitar
            a análise automática de candidatos e o assistente virtual do WhatsApp.
          </p>
        </div>
      )}

      {/* ── Chaves de API ─────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-5">
        <div className="flex items-center gap-2 border-b pb-3">
          <Key className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-gray-900">Chaves de API</h2>
          <p className="text-xs text-muted-foreground ml-1">armazenadas criptografadas no banco</p>
        </div>

        {/* Anthropic */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Anthropic — Claude</p>
              <p className="text-xs text-muted-foreground">Recomendado. Melhor desempenho para análise e WhatsApp.</p>
            </div>
            {hasAnthropicKey
              ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">✓ Configurada</Badge>
              : <Badge variant="secondary" className="shrink-0">Não configurada</Badge>
            }
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showAnthropicKey ? 'text' : 'password'}
                value={anthropicKey}
                onChange={e => { setAnthropicKey(e.target.value); setStatusMap(s => ({ ...s, anthropic: 'idle' })) }}
                onKeyDown={e => e.key === 'Enter' && saveKey('anthropic')}
                placeholder="sk-ant-api03-..."
                className="pr-10 font-mono text-sm"
              />
              <button type="button" onClick={() => setShowAnthropicKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button onClick={() => saveKey('anthropic')} disabled={savingProvider === 'anthropic' || !anthropicKey.trim()} className="shrink-0">
              {savingProvider === 'anthropic' ? <Loader2 className="w-4 h-4 animate-spin" /> : hasAnthropicKey ? 'Substituir' : 'Salvar'}
            </Button>
          </div>
          {statusMap.anthropic === 'saved' && <p className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3 h-3" />Chave salva!</p>}
          {statusMap.anthropic === 'error' && <p className="text-xs text-red-500">Erro ao salvar. Tente novamente.</p>}
          <p className="text-xs text-muted-foreground">
            Obtenha em{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
              className="underline text-violet-600 hover:text-violet-800 inline-flex items-center gap-0.5">
              console.anthropic.com <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>

        {/* OpenAI */}
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">OpenAI — GPT</p>
              <p className="text-xs text-muted-foreground">Alternativa ao Claude para qualquer serviço.</p>
            </div>
            {hasOpenaiKey
              ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">✓ Configurada</Badge>
              : <Badge variant="secondary" className="shrink-0">Não configurada</Badge>
            }
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showOpenaiKey ? 'text' : 'password'}
                value={openaiKey}
                onChange={e => { setOpenaiKey(e.target.value); setStatusMap(s => ({ ...s, openai: 'idle' })) }}
                onKeyDown={e => e.key === 'Enter' && saveKey('openai')}
                placeholder="sk-..."
                className="pr-10 font-mono text-sm"
              />
              <button type="button" onClick={() => setShowOpenaiKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button onClick={() => saveKey('openai')} disabled={savingProvider === 'openai' || !openaiKey.trim()} className="shrink-0">
              {savingProvider === 'openai' ? <Loader2 className="w-4 h-4 animate-spin" /> : hasOpenaiKey ? 'Substituir' : 'Salvar'}
            </Button>
          </div>
          {statusMap.openai === 'saved' && <p className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3 h-3" />Chave salva!</p>}
          {statusMap.openai === 'error' && <p className="text-xs text-red-500">Erro ao salvar. Tente novamente.</p>}
          <p className="text-xs text-muted-foreground">
            Obtenha em{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
              className="underline text-violet-600 hover:text-violet-800 inline-flex items-center gap-0.5">
              platform.openai.com <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </section>

      {/* ── Serviços ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-gray-900">Configuração por Serviço</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Selecione qual IA será utilizada em cada serviço e defina o comportamento esperado via prompt.
        </p>
      </div>

      <ServiceCard
        icon={FileText}
        title="Análise de Currículo"
        description="IA utilizada para analisar candidatos automaticamente: pontuação, parecer, pontos fortes e riscos."
        service="analysis"
        provider={analysisProvider}
        prompt={analysisPrompt}
        promptPlaceholder={
          'Você é um analista de RH especializado em recrutamento e seleção.\n' +
          'Avalie o candidato com base nos dados de experiência, perfil cultural e comportamentos esperados.\n' +
          'Seja objetivo, imparcial e destaque pontos relevantes para a tomada de decisão do gestor.'
        }
        hasAnthropicKey={hasAnthropicKey}
        hasOpenaiKey={hasOpenaiKey}
      />

      <ServiceCard
        icon={MessageSquare}
        title="Conversa no WhatsApp"
        description="IA que responde automaticamente aos candidatos que entram em contato pelo WhatsApp."
        service="whatsapp"
        provider={whatsappProvider}
        prompt={whatsappPrompt}
        promptPlaceholder={
          'Você é a atendente virtual de RH do Brownie do Ton.\n' +
          'Sua única função é orientar o candidato a preencher o currículo na plataforma.\n' +
          'Seja breve (1-2 frases), amigável e sempre inclua o link do formulário.\n' +
          'Nunca prometa vagas, salários ou datas de retorno.'
        }
        hasAnthropicKey={hasAnthropicKey}
        hasOpenaiKey={hasOpenaiKey}
      />

      <ServiceCard
        icon={Building2}
        title="Dados da Empresa"
        description="IA utilizada em funcionalidades relacionadas ao perfil da empresa: busca de CBO, melhoria de textos institucionais e sugestões de perguntas culturais."
        service="company"
        provider={companyProvider}
        prompt={companyPrompt}
        promptPlaceholder={
          'Você é um especialista em gestão de pessoas e cultura organizacional.\n' +
          'Auxilie na construção de perfis de vagas, descrições de cargos e questões culturais.\n' +
          'Mantenha tom profissional e adequado ao segmento de alimentação artesanal.'
        }
        hasAnthropicKey={hasAnthropicKey}
        hasOpenaiKey={hasOpenaiKey}
      />

    </div>
  )
}
