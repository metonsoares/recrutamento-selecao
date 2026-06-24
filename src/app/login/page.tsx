'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // SSO via Portal BDT: o magic link redireciona pra cá com a sessão na URL (#access_token).
  // Enquanto processa, mostramos "Entrando..." em vez do formulário.
  const [ssoProcessing, setSsoProcessing] = useState(
    typeof window !== 'undefined' && window.location.hash.includes('access_token'),
  )

  useEffect(() => {
    // Captura o hash ANTES de inicializar o client (evita corrida com o
    // detectSessionInUrl do Supabase, que pode limpar o hash antes da leitura).
    const hash = window.location.hash.replace(/^#/, '')
    const supabase = createSupabaseBrowserClient()
    let cancelled = false

    async function enterFromPortal() {
      // O magic link do Portal volta com a sessão no hash:
      // #access_token=...&refresh_token=...&type=magiclink
      if (hash.includes('access_token')) {
        const p = new URLSearchParams(hash)
        const access_token = p.get('access_token')
        const refresh_token = p.get('refresh_token')
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (!error) {
            // reload completo garante que o servidor leia o cookie da sessão
            window.location.replace('/admin')
            return
          }
        }
      }
      // Já autenticado? entra direto
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) { window.location.replace('/admin'); return }
      // Sem SSO/sessão: libera o formulário local (fallback)
      setSsoProcessing(false)
    }

    enterFromPortal()
    return () => { cancelled = true }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }
    router.push('/admin')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[oklch(0.20_0.03_150)] to-[oklch(0.28_0.04_150)] p-4">
      <Card className="w-full max-w-[400px] shadow-2xl">
        <CardHeader className="text-center space-y-2 pb-6">
          <div className="mx-auto w-16 h-16 bg-[oklch(0.88_0.08_85)] rounded-2xl flex items-center justify-center text-2xl font-bold text-[oklch(0.20_0.03_150)]">
            BT
          </div>
          <CardTitle className="text-xl sm:text-2xl font-bold">Banco de Talentos do Ton</CardTitle>
          <CardDescription>Acesso restrito ao painel administrativo</CardDescription>
        </CardHeader>
        <CardContent>
          {ssoProcessing ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Entrando pelo Portal BDT…</p>
            </div>
          ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com.br"
                required
                autoComplete="email"
                className="text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="text-base"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
