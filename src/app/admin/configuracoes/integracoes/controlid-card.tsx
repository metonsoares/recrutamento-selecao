'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, CheckCircle2, AlertCircle, Loader2, Link2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DominioOpcao { domain: string; nome: string }

/**
 * Control iD / RHiD — ponto eletrônico em nuvem.
 * A conexão usa o mesmo login do app do RHiD (domínio + e-mail + senha).
 * A senha fica criptografada no servidor e nunca volta para a tela.
 */
export function ControlIdCard({
  initialStatus, initialConnectedAt, initialEmail, initialDomain, initialCliente,
}: {
  initialStatus: 'connected' | 'disconnected'
  initialConnectedAt: string | null
  initialEmail: string
  initialDomain: string
  initialCliente: string | null
}) {
  const router = useRouter()
  const conectado = initialStatus === 'connected'

  const [aberto, setAberto] = useState(!conectado)
  const [email, setEmail] = useState(initialEmail)
  const [senha, setSenha] = useState('')
  const [dominio, setDominio] = useState(initialDomain)
  const [dominios, setDominios] = useState<DominioOpcao[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [desconectando, setDesconectando] = useState(false)

  async function conectar() {
    setSalvando(true); setErro(''); setAviso('')
    try {
      const res = await fetch('/api/admin/integrations/controlid', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: senha, domain: dominio || null }),
      })
      const d = await res.json().catch(() => ({}))

      // Conta ligada a mais de uma empresa: o RHiD devolve a lista sem token.
      if (d.precisaDominio) {
        setDominios(d.dominios ?? [])
        setDominio((d.dominios?.[0]?.domain as string) ?? '')
        setErro('Esta conta atende mais de uma empresa. Escolha o domínio e conecte novamente.')
        return
      }
      if (!res.ok) throw new Error(d.error || 'Não foi possível conectar.')

      setSenha(''); setAberto(false)
      if (d.aviso) setAviso(d.aviso)
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setSalvando(false) }
  }

  async function desconectar() {
    setDesconectando(true); setErro('')
    try {
      const res = await fetch('/api/admin/integrations/controlid', { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao desconectar.')
      setAberto(true)
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setDesconectando(false) }
  }

  const conectadoEm = initialConnectedAt
    ? new Date(initialConnectedAt).toLocaleString('pt-BR')
    : null

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      {/* Identificação */}
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div className="w-11 h-11 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0 font-bold text-[13px]">
          CiD
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-gray-900">Control iD</h2>
            {conectado ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />Conectado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-gray-100 text-gray-500">
                Desconectado
              </span>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Ponto eletrônico em nuvem (RHiD) — funcionários, marcações e apuração.
          </p>
          {conectado && (
            <p className="text-[11.5px] text-muted-foreground mt-1">
              {initialCliente ? <>Cliente: <strong className="text-gray-700">{initialCliente}</strong> · </> : null}
              {initialDomain ? <>Domínio: <strong className="text-gray-700">{initialDomain}</strong> · </> : null}
              {initialEmail}
              {conectadoEm ? <> · Conectado em {conectadoEm}</> : null}
            </p>
          )}
        </div>
      </div>

      {/* Formulário de conexão */}
      {aberto && (
        <div className="border-t px-4 sm:px-5 py-4 space-y-3 bg-gray-50/60">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600">E-mail do RHiD</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="usuario@empresa.com.br" autoComplete="off"
                className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600">Senha do RHiD</label>
              <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
                placeholder="Senha da conta" autoComplete="new-password"
                className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
            </div>
          </div>

          {dominios.length > 0 ? (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600">Domínio (empresa no RHiD)</label>
              <select value={dominio} onChange={e => setDominio(e.target.value)}
                className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white">
                {dominios.map(d => <option key={d.domain} value={d.domain}>{d.nome || d.domain}</option>)}
              </select>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600">
                Domínio <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <input value={dominio} onChange={e => setDominio(e.target.value)}
                placeholder="deixe em branco se a conta atende só uma empresa"
                className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            São os mesmos dados usados em rhid.com.br. A senha é guardada criptografada no
            servidor e nunca é exibida de volta.
          </p>

          {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{erro}</p>}

          <div className="flex gap-2">
            <Button onClick={conectar} disabled={salvando || !email || !senha} className="gap-1.5">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              {conectado ? 'Atualizar credenciais' : 'Conectar'}
            </Button>
            {conectado && (
              <Button variant="outline" onClick={() => { setAberto(false); setErro('') }} disabled={salvando}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Ações de quem já está conectado */}
      {conectado && !aberto && (
        <div className="border-t px-4 sm:px-5 py-3 flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setAberto(true)} className="gap-1.5">
            <Clock className="w-3.5 h-3.5" />Atualizar credenciais
          </Button>
          <Button variant="outline" size="sm" onClick={desconectar} disabled={desconectando}
            className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50">
            {desconectando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
            Desconectar
          </Button>
          {aviso && <span className="text-[12px] text-amber-700 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{aviso}</span>}
          {erro && <span className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{erro}</span>}
        </div>
      )}
    </div>
  )
}
