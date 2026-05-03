'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }

    router.push('/admin/dashboard')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-sidebar flex items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / Título */}
        <div className="text-center space-y-1">
          <div className="text-sidebar-foreground/60 text-xs font-semibold uppercase tracking-widest">
            Brownie do Ton
          </div>
          <h1 className="text-xl font-bold text-sidebar-foreground">
            Painel Administrativo
          </h1>
          <p className="text-sm text-sidebar-foreground/60">
            Acesso restrito à administração
          </p>
        </div>

        {/* Card de login */}
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-2xl border border-border p-6 shadow-md space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium">
              E-mail
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@browniedoton.com.br"
              required
              autoComplete="email"
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium">
              Senha
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="h-11 rounded-xl"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl font-semibold"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        {/* Aviso de segurança */}
        <p className="text-xs text-center text-sidebar-foreground/40 leading-relaxed px-2">
          ⚠️ Altere a senha padrão antes de usar em produção.
        </p>
      </div>
    </main>
  )
}
