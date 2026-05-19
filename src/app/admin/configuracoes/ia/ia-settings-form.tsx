'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Eye, EyeOff, Key, CheckCircle2, Loader2, ExternalLink, AlertCircle } from 'lucide-react'

interface Props {
  hasAnthropicKey: boolean
  hasOpenaiKey: boolean
  settingsId: string | null
}

type Provider = 'anthropic' | 'openai'
type KeyStatus = 'idle' | 'saved' | 'error'

export function IaSettingsForm({ hasAnthropicKey, hasOpenaiKey, settingsId }: Props) {
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [savingProvider, setSavingProvider] = useState<Provider | null>(null)
  const [statusMap, setStatusMap] = useState<Record<Provider, KeyStatus>>({
    anthropic: 'idle',
    openai: 'idle',
  })

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
        // reload to update hasKey flags
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

  return (
    <div className="p-4 sm:p-6 space-y-8 max-w-2xl">

      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Configuração de IA</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie as chaves de API utilizadas para análise de candidatos, busca de CBO e outras funcionalidades de inteligência artificial.
        </p>
      </div>

      {/* ── Info geral ─────────────────────────────────────────── */}
      <div className="flex gap-2 items-start bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          As chaves são armazenadas de forma criptografada no banco de dados.
          Configure pelo menos uma chave para habilitar as funcionalidades de IA.
          O sistema usa <strong>Anthropic (Claude)</strong> como prioridade,
          e <strong>OpenAI</strong> como alternativa caso a chave Claude não esteja configurada.
        </p>
      </div>

      {/* ── Anthropic / Claude ──────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <h2 className="text-base font-semibold text-[#333333]">Anthropic — Claude</h2>
            <p className="text-xs text-muted-foreground">Recomendado. Usado para análise de candidatos, ajuste de textos e busca de CBO.</p>
          </div>
          {hasAnthropicKey
            ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">✓ Configurada</Badge>
            : <Badge variant="secondary">Não configurada</Badge>
          }
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />
            {hasAnthropicKey ? 'Substituir chave Anthropic' : 'Adicionar chave Anthropic'}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showAnthropicKey ? 'text' : 'password'}
                value={anthropicKey}
                onChange={e => { setAnthropicKey(e.target.value); setStatusMap(s => ({ ...s, anthropic: 'idle' })) }}
                onKeyDown={e => e.key === 'Enter' && saveKey('anthropic')}
                placeholder="sk-ant-api03-..."
                className="text-base pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowAnthropicKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              onClick={() => saveKey('anthropic')}
              disabled={savingProvider === 'anthropic' || !anthropicKey.trim()}
              className="shrink-0"
            >
              {savingProvider === 'anthropic'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : 'Salvar'
              }
            </Button>
          </div>
          {statusMap.anthropic === 'saved' && (
            <p className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="w-3 h-3" />Chave Anthropic salva com sucesso!
            </p>
          )}
          {statusMap.anthropic === 'error' && (
            <p className="text-xs text-red-500">Erro ao salvar. Tente novamente.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Obtenha sua chave em{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-violet-600 hover:text-violet-800 inline-flex items-center gap-0.5"
            >
              console.anthropic.com <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </section>

      {/* ── OpenAI ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <h2 className="text-base font-semibold text-[#333333]">OpenAI — GPT</h2>
            <p className="text-xs text-muted-foreground">Alternativa ao Claude. Usado se a chave Anthropic não estiver configurada.</p>
          </div>
          {hasOpenaiKey
            ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">✓ Configurada</Badge>
            : <Badge variant="secondary">Não configurada</Badge>
          }
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />
            {hasOpenaiKey ? 'Substituir chave OpenAI' : 'Adicionar chave OpenAI'}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showOpenaiKey ? 'text' : 'password'}
                value={openaiKey}
                onChange={e => { setOpenaiKey(e.target.value); setStatusMap(s => ({ ...s, openai: 'idle' })) }}
                onKeyDown={e => e.key === 'Enter' && saveKey('openai')}
                placeholder="sk-..."
                className="text-base pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowOpenaiKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              onClick={() => saveKey('openai')}
              disabled={savingProvider === 'openai' || !openaiKey.trim()}
              className="shrink-0"
            >
              {savingProvider === 'openai'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : 'Salvar'
              }
            </Button>
          </div>
          {statusMap.openai === 'saved' && (
            <p className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="w-3 h-3" />Chave OpenAI salva com sucesso!
            </p>
          )}
          {statusMap.openai === 'error' && (
            <p className="text-xs text-red-500">Erro ao salvar. Tente novamente.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Obtenha sua chave em{' '}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-violet-600 hover:text-violet-800 inline-flex items-center gap-0.5"
            >
              platform.openai.com <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </section>

    </div>
  )
}
