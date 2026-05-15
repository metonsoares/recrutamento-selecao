'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { WhatsappSettings, WhatsappLog } from '@/types'
import { formatDateTime } from '@/lib/helpers'
import { Copy, CheckCircle, XCircle, Zap } from 'lucide-react'

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
  })

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const webhookUrl = `${appUrl}/api/webhooks/zapi/received`

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/admin/zapi/save-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
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
    setTestResult({ ok: data.ok, msg: data.ok ? 'Conexão bem-sucedida!' : (data.error || 'Falha na conexão') })
    setTesting(false)
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

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Configurações</TabsTrigger>
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

        <TabsContent value="webhook" className="space-y-4 mt-4">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Configure este URL no painel da Z-API como webhook de mensagens recebidas:</p>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <code className="text-xs flex-1 break-all">{webhookUrl}</code>
              <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(webhookUrl)}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <div className="text-sm space-y-1">
              <p className="font-medium">Outros webhooks:</p>
              <p className="text-muted-foreground text-xs">/api/webhooks/zapi/message-status — Status de mensagens</p>
              <p className="text-muted-foreground text-xs">/api/webhooks/zapi/disconnected — Desconexão</p>
            </div>
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
