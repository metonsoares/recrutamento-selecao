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
  AlertCircle, FileText, MessageSquare, Building2, Bot, Search, Info,
  Scale, Trash2,
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
  searchUrl1: string
  searchUrl1Label: string
  searchUrl2: string
  searchUrl2Label: string
  searchUrl3: string
  searchUrl3Label: string
  hasDatajudKey: boolean
  hasEscavadorKey: boolean
  hasTransparenciaKey: boolean
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

// ─── DataJud Card ─────────────────────────────────────────────────────────────

function DataJudCard({ hasKey }: { hasKey: boolean }) {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'removed' | 'error'>('idle')

  async function save() {
    if (!apiKey.trim()) return
    setSaving(true); setStatus('idle')
    try {
      const res = await fetch('/api/admin/ai/save-datajud-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: apiKey.trim() }),
      })
      if (res.ok) { setStatus('saved'); setApiKey(''); setTimeout(() => window.location.reload(), 800) }
      else setStatus('error')
    } catch { setStatus('error') }
    finally { setSaving(false) }
  }

  async function remove() {
    setRemoving(true)
    await fetch('/api/admin/ai/save-datajud-key', { method: 'DELETE' })
    setStatus('removed')
    setTimeout(() => window.location.reload(), 600)
    setRemoving(false)
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <Scale className="w-4 h-4 text-blue-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-900">DataJud — CNJ</h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
              ✓ Ativo
            </span>
            {hasKey
              ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Chave própria</span>
              : <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">Chave pública demo</span>
            }
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            API oficial do Conselho Nacional de Justiça — consulta processual em todos os
            tribunais brasileiros (27 TJs estaduais + 24 TRTs trabalhistas) via HTTP puro.
            Rápido, gratuito e sem necessidade de login.
          </p>
        </div>
      </div>

      <div className="flex gap-2 items-start bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-700">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p>
            O sistema já funciona com a <strong>chave pública de demonstração do CNJ</strong>,
            sem necessidade de cadastro. Para uso intenso, registre uma chave própria em{' '}
            <a href="http://datajud-wiki.cnj.jus.br" target="_blank" rel="noopener noreferrer"
              className="underline font-medium">datajud-wiki.cnj.jus.br</a>.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-700">
          {hasKey ? 'Substituir chave própria' : 'Chave de API própria'}{' '}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setStatus('idle') }}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="Cole aqui a chave recebida do CNJ…"
              className="pr-10 font-mono text-sm"
            />
            <button type="button" onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button onClick={save} disabled={saving || !apiKey.trim()} size="sm" className="shrink-0">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
          </Button>
        </div>
      </div>

      {status === 'saved' && <p className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" />Chave salva!</p>}
      {status === 'removed' && <p className="flex items-center gap-1 text-xs text-gray-500"><CheckCircle2 className="w-3.5 h-3.5" />Chave removida. Usando chave pública.</p>}
      {status === 'error' && <p className="flex items-center gap-1 text-xs text-red-500"><AlertCircle className="w-3.5 h-3.5" />Erro ao salvar. Tente novamente.</p>}

      {hasKey && (
        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-1"
          onClick={remove} disabled={removing}>
          {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          Remover chave própria
        </Button>
      )}
    </section>
  )
}

// ─── Search URLs card ─────────────────────────────────────────────────────────

interface SearchUrlEntry {
  url: string
  label: string
}

const URL_HINTS = [
  { label: 'Processos Trabalhistas', placeholder: 'https://consultapje.trt.jus.br/consultaprocessual/?nome={NOME}' },
  { label: 'Benefícios Governamentais', placeholder: 'https://portaldatransparencia.gov.br/beneficios/consulta?nomeBeneficiario={NOME}' },
  { label: 'Redes Sociais / Reputação', placeholder: 'https://www.google.com/search?q={NOME}+site:linkedin.com' },
]

function SearchUrlsCard({
  initial,
}: {
  initial: SearchUrlEntry[]
}) {
  const [entries, setEntries] = useState<SearchUrlEntry[]>(
    initial.length >= 3
      ? initial
      : [
          initial[0] ?? { url: '', label: '' },
          initial[1] ?? { url: '', label: '' },
          initial[2] ?? { url: '', label: '' },
        ]
  )
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  function update(index: number, field: keyof SearchUrlEntry, value: string) {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e))
    setStatus('idle')
  }

  async function save() {
    setSaving(true)
    setStatus('idle')
    try {
      const res = await fetch('/api/admin/ai/save-search-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search_url_1: entries[0]?.url || null,
          search_url_1_label: entries[0]?.label || null,
          search_url_2: entries[1]?.url || null,
          search_url_2_label: entries[1]?.label || null,
          search_url_3: entries[2]?.url || null,
          search_url_3_label: entries[2]?.label || null,
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
        <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
          <Search className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Pesquisa Pública de Candidatos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure até 3 URLs que serão consultadas automaticamente ao analisar cada candidato.
            A IA receberá o conteúdo dessas páginas para incluir na avaliação.
          </p>
        </div>
      </div>

      {/* Hint */}
      <div className="flex gap-2 items-start bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-700">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="space-y-1.5">
          <p>Variáveis disponíveis — substituídas pelos dados reais do candidato em cada análise:</p>
          <div className="flex flex-wrap gap-1">
            {['{NOME}','{CPF}','{TELEFONE}','{EMAIL}','{DATA_NASCIMENTO}','{CIDADE}','{BAIRRO}','{VAGA}'].map(v => (
              <code key={v} className="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-[10px]">{v}</code>
            ))}
          </div>
          <p className="text-[11px] text-blue-600">
            Exemplos de uso: <em>jusbrasil.com.br/busca?q={'{CPF}'}</em> · <em>portaldatransparencia.gov.br/busca?termo={'{NOME}'}</em>
          </p>
        </div>
      </div>

      {/* URL fields */}
      <div className="space-y-3">
        {entries.map((entry, i) => (
          <div key={i} className="space-y-1.5">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              URL {i + 1} — {URL_HINTS[i].label}
            </p>
            <div className="flex gap-2">
              <Input
                value={entry.label}
                onChange={e => update(i, 'label', e.target.value)}
                placeholder="Nome / descrição"
                className="w-[180px] shrink-0 text-sm"
              />
              <Input
                value={entry.url}
                onChange={e => update(i, 'url', e.target.value)}
                placeholder={URL_HINTS[i].placeholder}
                className="flex-1 text-sm font-mono"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Save */}
      <div className="flex items-center justify-between pt-1">
        <div>
          {status === 'saved' && (
            <p className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" />URLs salvas com sucesso!
            </p>
          )}
          {status === 'error' && (
            <p className="flex items-center gap-1 text-xs text-red-500">
              <AlertCircle className="w-3.5 h-3.5" />Erro ao salvar. Tente novamente.
            </p>
          )}
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Salvando...</> : 'Salvar URLs'}
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
  searchUrl1,
  searchUrl1Label,
  searchUrl2,
  searchUrl2Label,
  searchUrl3,
  searchUrl3Label,
  hasDatajudKey,
  hasEscavadorKey,
  hasTransparenciaKey,
}: Props) {
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [escavadorKey, setEscavadorKey] = useState('')
  const [showEscavadorKey, setShowEscavadorKey] = useState(false)
  const [savingEscavador, setSavingEscavador] = useState(false)
  const [escavadorStatus, setEscavadorStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  async function saveEscavador() {
    if (!escavadorKey.trim()) return
    setSavingEscavador(true); setEscavadorStatus('idle')
    try {
      const res = await fetch('/api/admin/ai/save-escavador-key', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: escavadorKey.trim() }),
      })
      if (res.ok) { setEscavadorStatus('saved'); setEscavadorKey(''); setTimeout(() => window.location.reload(), 800) }
      else setEscavadorStatus('error')
    } catch { setEscavadorStatus('error') }
    finally { setSavingEscavador(false) }
  }

  const [transpKey, setTranspKey] = useState('')
  const [showTranspKey, setShowTranspKey] = useState(false)
  const [savingTransp, setSavingTransp] = useState(false)
  const [transpStatus, setTranspStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  async function saveTransparencia() {
    if (!transpKey.trim()) return
    setSavingTransp(true); setTranspStatus('idle')
    try {
      const res = await fetch('/api/admin/ai/save-transparencia-key', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: transpKey.trim() }),
      })
      if (res.ok) { setTranspStatus('saved'); setTranspKey(''); setTimeout(() => window.location.reload(), 800) }
      else setTranspStatus('error')
    } catch { setTranspStatus('error') }
    finally { setSavingTransp(false) }
  }
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

        {/* Escavador */}
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Escavador</p>
              <p className="text-xs text-muted-foreground">Consulta de processos e dados públicos (antecedentes).</p>
            </div>
            {hasEscavadorKey
              ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">✓ Configurada</Badge>
              : <Badge variant="secondary" className="shrink-0">Não configurada</Badge>
            }
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showEscavadorKey ? 'text' : 'password'}
                value={escavadorKey}
                onChange={e => { setEscavadorKey(e.target.value); setEscavadorStatus('idle') }}
                onKeyDown={e => e.key === 'Enter' && saveEscavador()}
                placeholder="Token de API do Escavador"
                className="pr-10 font-mono text-sm"
              />
              <button type="button" onClick={() => setShowEscavadorKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showEscavadorKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button onClick={saveEscavador} disabled={savingEscavador || !escavadorKey.trim()} className="shrink-0">
              {savingEscavador ? <Loader2 className="w-4 h-4 animate-spin" /> : hasEscavadorKey ? 'Substituir' : 'Salvar'}
            </Button>
          </div>
          {escavadorStatus === 'saved' && <p className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3 h-3" />Chave salva!</p>}
          {escavadorStatus === 'error' && <p className="text-xs text-red-500">Erro ao salvar. Tente novamente.</p>}
          <p className="text-xs text-muted-foreground">
            Obtenha em{' '}
            <a href="https://api.escavador.com/" target="_blank" rel="noopener noreferrer"
              className="underline text-violet-600 hover:text-violet-800 inline-flex items-center gap-0.5">
              escavador.com <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>

        {/* Portal da Transparência */}
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Portal da Transparência</p>
              <p className="text-xs text-muted-foreground">Consulta de auxílios governamentais por CPF (Check Auxílios).</p>
            </div>
            {hasTransparenciaKey
              ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">✓ Configurada</Badge>
              : <Badge variant="secondary" className="shrink-0">Não configurada</Badge>}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showTranspKey ? 'text' : 'password'}
                value={transpKey}
                onChange={e => { setTranspKey(e.target.value); setTranspStatus('idle') }}
                onKeyDown={e => e.key === 'Enter' && saveTransparencia()}
                placeholder="Chave da API do Portal da Transparência"
                className="pr-10 font-mono text-sm"
              />
              <button type="button" onClick={() => setShowTranspKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showTranspKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button onClick={saveTransparencia} disabled={savingTransp || !transpKey.trim()} className="shrink-0">
              {savingTransp ? <Loader2 className="w-4 h-4 animate-spin" /> : hasTransparenciaKey ? 'Substituir' : 'Salvar'}
            </Button>
          </div>
          {transpStatus === 'saved' && <p className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3 h-3" />Chave salva!</p>}
          {transpStatus === 'error' && <p className="text-xs text-red-500">Erro ao salvar. Tente novamente.</p>}
          <p className="text-xs text-muted-foreground">
            Chave gratuita em{' '}
            <a href="https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email" target="_blank" rel="noopener noreferrer"
              className="underline text-violet-600 hover:text-violet-800 inline-flex items-center gap-0.5">
              portaldatransparencia.gov.br <ExternalLink className="w-3 h-3" />
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

      <DataJudCard hasKey={hasDatajudKey} />

      <SearchUrlsCard
        initial={[
          { url: searchUrl1, label: searchUrl1Label },
          { url: searchUrl2, label: searchUrl2Label },
          { url: searchUrl3, label: searchUrl3Label },
        ]}
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
