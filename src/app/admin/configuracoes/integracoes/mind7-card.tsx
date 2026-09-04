'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clock, CheckCircle2, AlertCircle, Loader2, Link2, Unlink, ExternalLink, Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Mind7 — painel de consultas (a de emprego traz os vínculos do CPF).
 *
 * O Mind7 não tem API e o site fica atrás do desafio anti-robô da Cloudflare:
 * login feito pelo servidor responde 403. Por isso o card guarda a credencial
 * (criptografada, como a do RHiD) e mostra por onde a consulta consegue passar,
 * medido de verdade na hora de conectar — em vez de prometer um robô que a
 * Cloudflare recusa.
 */
export function Mind7Card({
  initialStatus, initialConnectedAt, initialUsuario, initialAlcance, initialAlcanceDetalhe,
}: {
  initialStatus: 'connected' | 'disconnected'
  initialConnectedAt: string | null
  initialUsuario: string
  initialAlcance: 'servidor' | 'navegador' | null
  initialAlcanceDetalhe: string | null
}) {
  const router = useRouter()
  const conectado = initialStatus === 'connected'

  const [aberto, setAberto] = useState(!conectado)
  const [usuario, setUsuario] = useState(initialUsuario)
  const [senha, setSenha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [desconectando, setDesconectando] = useState(false)

  async function conectar() {
    setSalvando(true); setErro(''); setAviso('')
    try {
      const res = await fetch('/api/admin/integrations/mind7', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
      })
      const d = await res.json().catch(() => ({}))
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
      const res = await fetch('/api/admin/integrations/mind7', { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao desconectar.')
      setAberto(true)
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally { setDesconectando(false) }
  }

  const conectadoEm = initialConnectedAt ? new Date(initialConnectedAt).toLocaleString('pt-BR') : null

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 font-bold text-[13px]">
          M7
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-gray-900">Mind7</h2>
            {conectado ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />Conectado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-gray-100 text-gray-500">
                Desconectado
              </span>
            )}
            {conectado && initialAlcance === 'navegador' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200">
                <Globe className="w-3 h-3" />Consulta pelo navegador
              </span>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Painel de consultas — a de emprego devolve a linha do tempo de vínculos por CPF.
          </p>
          {conectado && (
            <p className="text-[11.5px] text-muted-foreground mt-1">
              {initialUsuario}
              {conectadoEm ? <> · Conectado em {conectadoEm}</> : null}
            </p>
          )}
        </div>
      </div>

      {/* Como a consulta consegue passar — medido ao conectar. */}
      {conectado && initialAlcance === 'navegador' && (
        <div className="mx-4 sm:mx-5 mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[12.5px] text-amber-900">
            <strong>A consulta precisa sair do seu navegador.</strong> O Mind7 fica atrás do
            desafio anti-robô da Cloudflare
            {initialAlcanceDetalhe ? <> — {initialAlcanceDetalhe}</> : null}, então um login feito
            pelo servidor não passa. A credencial fica guardada aqui, criptografada, e a consulta
            é feita com você logado no painel.
          </p>
          <a href="https://www.mind-7.org/painel/consultas/emprego/" target="_blank" rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-amber-900 hover:underline">
            Abrir o painel do Mind7<ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {aberto && (
        <div className="border-t px-4 sm:px-5 py-4 space-y-3 bg-gray-50/60">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600">Usuário do Mind7</label>
              <input value={usuario} onChange={e => setUsuario(e.target.value)}
                placeholder="login do painel" autoComplete="off"
                className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600">Senha do Mind7</label>
              <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
                placeholder="senha da conta" autoComplete="new-password"
                className="h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            São os mesmos dados usados em mind-7.org. A senha é guardada criptografada no servidor
            e nunca é exibida de volta. Ao conectar, eu testo se o painel aceita requisição do
            servidor ou se a consulta terá que passar pelo seu navegador.
          </p>

          {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{erro}</p>}

          <div className="flex gap-2">
            <Button onClick={conectar} disabled={salvando || !usuario || !senha} className="gap-1.5">
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
