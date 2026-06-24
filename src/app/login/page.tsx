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
    const supabase = createSupabaseBrowserClient()
    let done = false
    const goAdmin = () => { if (!done) { done = true; router.replace('/admin'); router.refresh() } }
    // detectSessionInUrl processa o magic link e dispara o evento de login
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (session) goAdmin() })
    supabase.auth.getSession().then(({ data }) => { if (data.session) goAdmin() })
    // fallback: se nada logar, libera o formulário
    const t = setTimeout(() => setSsoProcessing(false), 4000)
    return () => { sub.subscription.unsubscribe(); clearTimeout(t) }
  }, [router])

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
