'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WhatsappSettings, WhatsappLog } from '@/types'
import { formatDateTime } from '@/lib/helpers'
import { Copy, CheckCircle, XCircle, Zap, Bot, Check } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

function maskToken(token: string | null) {
  if (!token) return ''
  return '••••••••••••' + token.slice(-4)
}

export function ZApiSettingsForm({ settings, logs }: { settings: WhatsappSettings | null; logs: WhatsappLog[] }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [testMsg, setTestMsg] = useState('Olá! Mensagem de teste do Banco de Talentos do Ton. 🎉')
  const [sendingTest, setSendingTest] = useState(false)
  const [testingWebhook, setTestingWebhook] = useState(false)
  const [webhookTestResult, setWebhookTestResult] = useState<{ ok: boolean; msg: string; detail?: string } | null>(null)
  const [registeringHooks, setRegisteringHooks] = useState(false)
  const [registerResult, setRegisterResult] = useState<{ ok: boolean; msg: string; detail?: string } | null>(null)

  const DEFAULT_WELCOME = `Olá! Aqui é {ATENDENTE}, do Brownie do Ton 😊\n\nObrigado pelo contato! Ficamos felizes com seu interesse em fazer parte da nossa equipe.\n\nPara se candidatar, acesse nosso formulário:\n{LINK}\n\nApós o envio, nossa equipe de RH analisará seu perfil e entrará em contato. 😊`

  const [form, setForm] = useState({
    instance_name: settings?.instance_name || '',
    instance_id: settings?.instance_id || '',
    instance_token: '',
    client_token: '',
    whatsapp_number: settings?.whatsapp_number || '',
    attendant_name: settings?.attendant_name || 'Assistente do Ton',
    api_base_url: settings?.api_base_url || 'https://api.z-api.io',
    environment: settings?.environment || 'production',
    is_active: settings?.is_active || false,
    auto_reply_enabled: settings?.auto_reply_enabled ?? true,
    welcome_message: settings?.welcome_message || '',
  })

  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const webhooks = [
    {
      key: 'received',
      zapiLabel: 'Ao receber',
      description: 'Disparado quando uma mensagem é recebida — necessário para a resposta automática.',
      url: `${appUrl}/api/webhooks/zapi/received`,
      required: true,
    },
    {
      key: 'disconnected',
      zapiLabel: 'Ao desconectar',
      description: 'Disparado quando a instância se desconecta do WhatsApp.',
      url: `${appUrl}/api/webhooks/zapi/disconnected`,
      required: false,
    },
    {
      key: 'status',
      zapiLabel: 'Receber status da mensagem',
      description: 'Disparado quando o status de uma mensagem enviada muda (entregue, lida etc.).',
      url: `${appUrl}/api/webhooks/zapi/message-status`,
      required: false,
    },
    {
      key: 'delivered',
      zapiLabel: 'Ao enviar',
      description: 'Disparado após o envio de cada mensagem. Permite capturar erros de entrega e confirmar que a mensagem saiu corretamente.',
      url: `${appUrl}/api/webhooks/zapi/delivered`,
      required: false,
    },
  ]

  function copyWebhook(key: string, url: string) {
    navigator.clipboard.writeText(url)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/admin/zapi/save-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        welcome_message: form.welcome_message || null,
      }),
    })
    setSaving(false)
    if (res.ok) { router.refresh(); alert('Configurações salvas!') }
    else alert('Erro ao salvar.')
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    const res = await fetch('/api/admin/zapi/test-connection', { method: 'POST' })
    const data = await res.json()
    const zerr = data?.data?.error as string | undefined
    setTestResult({
      ok: data.ok,
      msg: data.ok
        ? 'Conectado! WhatsApp ativo na instância.'
        : (data.connected === false
            ? `Instância DESCONECTADA do WhatsApp${zerr ? ` — ${zerr}` : ''}. Leia o QR Code novamente no painel da Z-API.`
            : (data.error || 'Falha na conexão')),
    })
    setTesting(false)
  }

  async function handleRegisterWebhooks() {
    setRegisteringHooks(true)
    setRegisterResult(null)
    try {
      const res = await fetch('/api/admin/zapi/register-webhooks', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        const fails = (data.results || []).filter((r: { ok: boolean }) => !r.ok).map((r: { key: string }) => r.key)
        setRegisterResult({
          ok: true,
          msg: data.allOk ? '✅ Webhooks registrados na Z-API com sucesso!' : '✅ Webhook de recebimento registrado!',
          detail: fails.length ? `Não registrados (opcionais): ${fails.join(', ')}` : `Apontando para ${data.base}`,
        })
        router.refresh()
      } else {
        setRegisterResult({ ok: false, msg: `❌ ${data.error || 'Falha ao registrar webhooks.'}` })
      }
    } catch {
      setRegisterResult({ ok: false, msg: '❌ Erro ao registrar webhooks.' })
    }
    setRegisteringHooks(false)
  }

  async function handleTestWebhook() {
    setTestingWebhook(true)
    setWebhookTestResult(null)
    try {
      const res = await fetch('/api/admin/zapi/test-webhook', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setWebhookTestResult({
          ok: true,
          msg: `✅ Webhook funcionando! Respondeu em ${data.elapsed_ms}ms`,
          detail: data.log_created ? 'Log registrado no banco ✓' : 'Webhook chamado mas log não encontrado',
        })
      } else {
        setWebhookTestResult({ ok: false, msg: `❌ ${data.error}` })
      }
    } catch {
      setWebhookTestResult({ ok: false, msg: '❌ Erro ao chamar o endpoint de teste' })
    }
    setTestingWebhook(false)
  }

  async function handleSendTest() {
    if (!testPhone || !testMsg) return
    setSendingTest(true)
    const res = await fetch('/api/admin/zapi/send-test-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhone, message: testMsg }),
    })
    const data = await res.json()
    setSendingTest(false)
    alert(data.ok ? '✅ Mensagem enviada!' : `❌ Erro: ${data.error}`)
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">WhatsApp / Z-API</h1>
        <p className="text-muted-foreground text-sm mt-1">Configuração da integração com WhatsApp via Z-API</p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${settings?.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
            <div>
              <p className="text-xs text-muted-foreground">Integração</p>
              <p className="text-sm font-medium">{settings?.is_active ? 'Ativa' : 'Inativa'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Última conexão</p>
            <p className="text-sm font-medium">{formatDateTime(settings?.last_connection_at || null)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Última mensagem</p>
            <p className="text-sm font-medium">{formatDateTime(settings?.last_message_received_at || null)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Diagnostics checklist */}
      {(() => {
        const checks = [
          { label: 'Integração ativa', ok: !!settings?.is_active, fix: 'Marque "Integração ativa" na aba Configurações e salve.' },
          { label: 'Instance ID configurado', ok: !!settings?.instance_id, fix: 'Preencha o Instance ID na aba Configurações.' },
          { label: 'Token da instância configurado', ok: !!settings?.instance_token_encrypted, fix: 'Preencha o Token da Instância na aba Configurações.' },
          { label: 'Client Token configurado', ok: !!settings?.client_token_encrypted, fix: 'Preencha o Client Token na aba Configurações.' },
          { label: 'Auto-resposta ativada', ok: settings?.auto_reply_enabled !== false, fix: 'Ative a resposta automática na aba Auto-resposta.' },
        ]
        const hasIssues = checks.some(c => !c.ok)
        if (!hasIssues) return null
        return (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-red-800">⚠️ Pendências na configuração</p>
            <ul className="space-y-1">
              {checks.filter(c => !c.ok).map(c => (
                <li key={c.label} className="text-xs text-red-700">
                  <span className="font-medium">• {c.label}:</span> {c.fix}
                </li>
              ))}
            </ul>
          </div>
        )
      })()}

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Configurações</TabsTrigger>
          <TabsTrigger value="auto_reply">Auto-resposta</TabsTrigger>
          <TabsTrigger value="test">Testar</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Nome da Instância</Label>
              <Input value={form.instance_name} onChange={e => setForm(f => ({ ...f, instance_name: e.target.value }))} placeholder="brownie-ton" />
            </div>
            <div className="space-y-1">
              <Label>Número WhatsApp</Label>
              <Input value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} placeholder="5524999999999" />
            </div>
            <div className="space-y-1">
              <Label>Instance ID</Label>
              <Input value={form.instance_id} onChange={e => setForm(f => ({ ...f, instance_id: e.target.value }))} placeholder="ABC123..." />
            </div>
            <div className="space-y-1">
              <Label>Token da Instância {settings?.instance_token_encrypted && <span className="text-xs text-muted-foreground">(atual: {maskToken(settings.instance_token_encrypted)})</span>}</Label>
              <Input type="password" value={form.instance_token} onChange={e => setForm(f => ({ ...f, instance_token: e.target.value }))} placeholder="Deixe vazio para manter o atual" />
            </div>
            <div className="space-y-1">
              <Label>Client Token {settings?.client_token_encrypted && <span className="text-xs text-muted-foreground">(atual: {maskToken(settings.client_token_encrypted)})</span>}</Label>
              <Input type="password" value={form.client_token} onChange={e => setForm(f => ({ ...f, client_token: e.target.value }))} placeholder="Deixe vazio para manter o atual" />
            </div>
            <div className="space-y-1">
              <Label>Nome do Atendente</Label>
              <Input value={form.attendant_name} onChange={e => setForm(f => ({ ...f, attendant_name: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              Integração ativa
            </label>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            <Zap className="w-4 h-4 mr-1" />
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </TabsContent>

        {/* ── Auto-resposta ───────────────────────────────────────────── */}
        <TabsContent value="auto_reply" className="space-y-5 mt-4">
          <div className="flex items-start gap-3 p-4 rounded-xl border bg-muted/30">
            <Bot className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium">Como funciona</p>
              <p className="text-muted-foreground">Quando um candidato mandar a primeira mensagem, o sistema responde automaticamente com a mensagem de boas-vindas abaixo. Nas mensagens seguintes, a IA (configurada em <strong>Config → IA</strong>) responde de forma contextual usando o prompt do agente WhatsApp.</p>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.auto_reply_enabled}
              onChange={e => setForm(f => ({ ...f, auto_reply_enabled: e.target.checked }))}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm font-medium">Resposta automática ativada</span>
          </label>

          <div className="space-y-2">
            <Label>Mensagem de boas-vindas (1ª mensagem recebida)</Label>
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: <code className="bg-muted px-1 rounded">{'{ATENDENTE}'}</code> → nome do atendente &nbsp;|&nbsp; <code className="bg-muted px-1 rounded">{'{LINK}'}</code> → link do formulário de currículo
            </p>
            <Textarea
              rows={10}
              value={form.welcome_message || DEFAULT_WELCOME}
              onChange={e => setForm(f => ({ ...f, welcome_message: e.target.value }))}
              placeholder={DEFAULT_WELCOME}
              className="font-mono text-sm"
            />
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setForm(f => ({ ...f, welcome_message: DEFAULT_WELCOME }))}
            >
              Restaurar mensagem padrão
            </button>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pré-visualização (com valores reais)</Label>
            <pre className="text-sm whitespace-pre-wrap bg-muted/40 border rounded-xl p-4 leading-relaxed">
              {(form.welcome_message || DEFAULT_WELCOME)
                .replace(/\{ATENDENTE\}/g, form.attendant_name || 'Assistente do Ton')
                .replace(/\{LINK\}/g, 'https://recrutamento-selecao-ashen.vercel.app/curriculo')}
            </pre>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            <Zap className="w-4 h-4 mr-1" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </TabsContent>

        <TabsContent value="test" className="space-y-4 mt-4">
          <div className="space-y-4">
            <Button onClick={handleTestConnection} disabled={testing} variant="outline">
              {testing ? 'Testando...' : 'Testar Conexão'}
            </Button>
            {testResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {testResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.msg}
              </div>
            )}
            <div className="border-t pt-4 space-y-3">
              <h3 className="font-medium text-sm">Enviar Mensagem de Teste</h3>
              <div className="space-y-1">
                <Label>Número (com DDI)</Label>
                <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="5524999999999" />
              </div>
              <div className="space-y-1">
                <Label>Mensagem</Label>
                <Input value={testMsg} onChange={e => setTestMsg(e.target.value)} />
              </div>
              <Button onClick={handleSendTest} disabled={sendingTest || !testPhone}>
                {sendingTest ? 'Enviando...' : 'Enviar Mensagem de Teste'}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="webhook" className="space-y-5 mt-4">

          {/* Registro automático */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div>
              <p className="font-semibold text-sm">Registrar webhooks automaticamente</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configura os webhooks direto na sua instância da Z-API (recebimento, status e desconexão), apontando para esta plataforma. É o que faz as mensagens recebidas chegarem e a resposta automática funcionar.
              </p>
            </div>
            <Button onClick={handleRegisterWebhooks} disabled={registeringHooks} className="gap-2">
              {registeringHooks
                ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>Registrando…</>
                : <><Zap className="w-4 h-4" />Registrar webhooks na Z-API</>
              }
            </Button>
            {registerResult && (
              <div className={`p-3 rounded-lg text-sm space-y-1 ${registerResult.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                <p className="font-medium">{registerResult.msg}</p>
                {registerResult.detail && <p className="text-xs opacity-80 break-all">{registerResult.detail}</p>}
              </div>
            )}
          </div>

          {/* Instruction banner */}
          <div className="flex gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
            <span className="text-amber-500 text-lg shrink-0">⚠️</span>
            <div className="text-sm">
              <p className="font-semibold text-amber-800">Ou configure manualmente no painel do Z-API</p>
              <p className="text-amber-700 mt-0.5">
                Se preferir, acesse <strong>Z-API → sua instância → Webhooks e configurações gerais</strong> e cole cada URL no campo correspondente. Sem isso, as mensagens não chegam à plataforma.
              </p>
            </div>
          </div>

          {/* Webhook list */}
          <div className="space-y-3">
            {webhooks.map(wh => (
              <div key={wh.key} className={`rounded-xl border p-4 space-y-2 ${wh.required ? 'border-primary/30 bg-primary/5' : 'bg-muted/30'}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      Campo no Z-API: <span className="text-primary">{wh.zapiLabel}</span>
                    </span>
                    {wh.required && (
                      <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full">Obrigatório</span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={copiedKey === wh.key ? 'default' : 'outline'}
                    className="gap-1.5 shrink-0"
                    onClick={() => copyWebhook(wh.key, wh.url)}
                  >
                    {copiedKey === wh.key
                      ? <><Check className="w-3.5 h-3.5" /> Copiado!</>
                      : <><Copy className="w-3.5 h-3.5" /> Copiar URL</>
                    }
                  </Button>
                </div>
                <code className="block text-xs bg-white border rounded-lg px-3 py-2 break-all text-muted-foreground">
                  {wh.url}
                </code>
                <p className="text-xs text-muted-foreground">{wh.description}</p>
              </div>
            ))}
          </div>

          {/* Test webhook button */}
          <div className="rounded-xl border p-4 space-y-3">
            <div>
              <p className="font-semibold text-sm">Testar recebimento de webhook</p>
              <p className="text-xs text-muted-foreground mt-0.5">Simula uma mensagem chegando à plataforma e verifica se o fluxo está funcionando ponta a ponta.</p>
            </div>
            <Button
              variant="outline"
              onClick={handleTestWebhook}
              disabled={testingWebhook}
              className="gap-2"
            >
              {testingWebhook
                ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>Testando…</>
                : <><Zap className="w-4 h-4" />Testar Webhook</>
              }
            </Button>
            {webhookTestResult && (
              <div className={`p-3 rounded-lg text-sm space-y-1 ${webhookTestResult.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                <p className="font-medium">{webhookTestResult.msg}</p>
                {webhookTestResult.detail && <p className="text-xs opacity-80">{webhookTestResult.detail}</p>}
              </div>
            )}
          </div>

          {/* Z-API extra tips */}
          <div className="rounded-xl border p-4 space-y-2 text-sm">
            <p className="font-semibold">Outras configurações recomendadas no Z-API</p>
            <ul className="space-y-1 text-muted-foreground text-xs list-disc list-inside">
              <li>Ative <strong>&quot;Ler mensagens automático&quot;</strong> para marcar como lidas ao receber</li>
              <li>Ative <strong>&quot;WhatsApp Business&quot;</strong> se a conta for Business</li>
              <li>Ative <strong>&quot;Rejeitar chamadas automático&quot;</strong> para evitar chamadas indesejadas</li>
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="text-xs border rounded p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={log.direction === 'inbound' ? 'default' : 'secondary'} className="text-xs">{log.direction || log.action}</Badge>
                  <span className="text-muted-foreground">{formatDateTime(log.created_at)}</span>
                  {log.phone && <span>{log.phone}</span>}
                </div>
                {log.message && <p className="text-muted-foreground line-clamp-1">{log.message}</p>}
                {log.error_message && <p className="text-red-500">{log.error_message}</p>}
              </div>
            ))}
            {!logs.length && <p className="text-muted-foreground text-sm">Nenhum log ainda</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
