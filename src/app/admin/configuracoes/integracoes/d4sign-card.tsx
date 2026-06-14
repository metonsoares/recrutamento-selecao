'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, CheckCircle2, AlertCircle, X, Eye, EyeOff, ExternalLink, Unplug } from 'lucide-react'
import { formatDateTime } from '@/lib/helpers'

interface Props {
  initialStatus: 'connected' | 'disconnected'
  initialEnvironment: 'producao' | 'sandbox'
  initialConnectedAt: string | null
  initialCofres: number | null
}

export function D4SignCard({ initialStatus, initialEnvironment, initialConnectedAt, initialCofres }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [environment, setEnvironment] = useState<'producao' | 'sandbox'>(initialEnvironment)
  const [connectedAt, setConnectedAt] = useState(initialConnectedAt)
  const [cofres, setCofres] = useState<number | null>(initialCofres)

  const [tokenApi, setTokenApi] = useState('')
  const [cryptKey, setCryptKey] = useState('')
  const [showSecrets, setShowSecrets] = useState(false)
  const [editing, setEditing] = useState(initialStatus !== 'connected')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function connect() {
    setError('')
    if (!tokenApi.trim() || !cryptKey.trim()) { setError('Informe o Token API e a Crypt Key.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/integrations/d4sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenApi, cryptKey, environment }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { setError(d.error || 'Falha ao conectar.'); return }
      setStatus('connected')
      setConnectedAt(d.connected_at || new Date().toISOString())
      setCofres(typeof d.cofres === 'number' ? d.cofres : null)
      setTokenApi(''); setCryptKey(''); setEditing(false)
    } catch {
      setError('Falha ao conectar.')
    } finally { setLoading(false) }
  }

  async function disconnect() {
    if (!confirm('Desconectar a integração com a D4Sign? As credenciais serão removidas.')) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/integrations/d4sign', { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { setError(d.error || 'Falha ao desconectar.'); return }
      setStatus('disconnected'); setConnectedAt(null); setCofres(null); setEditing(true)
    } catch {
      setError('Falha ao desconectar.')
    } finally { setLoading(false) }
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      {/* Cabeçalho do card */}
      <div className="flex items-start gap-3 p-5 border-b">
        <div className="w-11 h-11 rounded-xl bg-[#0b5cff]/10 text-[#0b5cff] flex items-center justify-center shrink-0 font-bold">
          D4
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-gray-900">D4Sign</h2>
            {status === 'connected' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <CheckCircle2 className="w-3 h-3" />Conectado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
                <X className="w-3 h-3" />Não conectado
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">Assinatura eletrônica de documentos.</p>
          {status === 'connected' && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Ambiente: <strong>{environment === 'sandbox' ? 'Sandbox' : 'Produção'}</strong>
              {connectedAt && <> · Conectado em {formatDateTime(connectedAt)}</>}
              {cofres != null && <> · {cofres} cofre{cofres !== 1 ? 's' : ''}</>}
            </p>
          )}
        </div>
      </div>

      {/* Corpo: formulário de conexão ou estado conectado */}
      <div className="p-5 space-y-3">
        {status === 'connected' && !editing ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(true)} disabled={loading}>Atualizar credenciais</Button>
            <Button variant="outline" onClick={disconnect} disabled={loading} className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}Desconectar
            </Button>
          </div>
        ) : (
          <>
            <p className="text-[12px] text-muted-foreground">
              A D4Sign autentica por <strong>Token API</strong> e <strong>Crypt Key</strong> (não usa login/senha aqui).
              Gere essas chaves no painel da D4Sign em <em>Configurações → API</em> e cole abaixo. Ao clicar em
              “Conectar”, validamos automaticamente as credenciais.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Ambiente</label>
              <select value={environment} onChange={e => setEnvironment(e.target.value as 'producao' | 'sandbox')}
                className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                <option value="producao">Produção</option>
                <option value="sandbox">Sandbox (testes)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Token API</label>
              <Input type={showSecrets ? 'text' : 'password'} value={tokenApi} onChange={e => setTokenApi(e.target.value)}
                placeholder="tokenAPI da D4Sign" autoComplete="off" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Crypt Key</label>
              <div className="relative">
                <Input type={showSecrets ? 'text' : 'password'} value={cryptKey} onChange={e => setCryptKey(e.target.value)}
                  placeholder="cryptKey da D4Sign" autoComplete="off" className="pr-9" />
                <button type="button" onClick={() => setShowSecrets(s => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}

            <div className="flex items-center gap-2 pt-1">
              <Button onClick={connect} disabled={loading} className="gap-1.5">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Conectando...</> : <>Conectar</>}
              </Button>
              {status === 'connected' && (
                <Button variant="ghost" onClick={() => { setEditing(false); setError('') }} disabled={loading}>Cancelar</Button>
              )}
              <a href="https://docapi.d4sign.com.br/docs/introdu%C3%A7%C3%A3o-a-api" target="_blank" rel="noreferrer"
                className="ml-auto text-[12px] text-primary hover:underline inline-flex items-center gap-1">
                Documentação <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
