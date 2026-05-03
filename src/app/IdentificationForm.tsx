'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ROLES = [
  'Atendente',
  'Auxiliar de Produção',
  'Caixa',
  'Confeiteiro(a)',
  'Entregador(a)',
  'Estoquista',
  'Gerente',
  'Operador(a) de Caixa',
  'Outro',
]

interface Props {
  requiresCode: boolean
}

export default function IdentificationForm({ requiresCode }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [customRole, setCustomRole] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<{
    name?: string
    role?: string
    accessCode?: string
    consent?: string
  }>({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const finalRole = role === 'Outro' ? customRole.trim() : role

  function validate() {
    const errs: typeof errors = {}
    if (!name.trim() || name.trim().length < 3) {
      errs.name = 'Informe seu nome completo (mínimo 3 caracteres).'
    }
    if (!finalRole) {
      errs.role = 'Selecione ou informe sua função.'
    }
    if (requiresCode && !accessCode.trim()) {
      errs.accessCode = 'Informe o código de acesso fornecido pelo organizador.'
    }
    if (!consent) {
      errs.consent = 'É necessário aceitar os termos para continuar.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleStart() {
    if (!validate()) return

    setLoading(true)
    setApiError(null)

    try {
      // Limpa sessão anterior (se outra pessoa usou o mesmo dispositivo)
      ;[
        'brownie_respondent_id',
        'brownie_respondent_name',
        'brownie_respondent_role',
        'brownie_survey_answers',
        'brownie_survey_section',
      ].forEach((k) => sessionStorage.removeItem(k))

      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role: finalRole,
          accessCode: accessCode.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setApiError(data.error ?? 'Erro ao iniciar. Tente novamente.')
        return
      }

      sessionStorage.setItem('brownie_respondent_id', data.respondent_id)
      sessionStorage.setItem('brownie_respondent_name', name.trim())
      sessionStorage.setItem('brownie_respondent_role', finalRole)

      router.push('/pesquisa')
    } catch {
      setApiError('Sem conexão. Verifique o Wi-Fi e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen brand-gradient-soft flex flex-col">
      {/* Header */}
      <header className="brand-gradient px-6 py-8 text-white text-center">
        <div className="text-xs font-semibold uppercase tracking-widest opacity-75 mb-1">
          Brownie do Ton
        </div>
        <h1 className="text-2xl font-bold leading-tight">Pesquisa Interna</h1>
        <p className="text-sm opacity-80 mt-1">Diagnóstico de Cultura e Perfil</p>
      </header>

      {/* Texto introdutório */}
      <section className="px-5 py-5 max-w-lg mx-auto w-full">
        <div className="bg-white rounded-2xl border border-border p-5 shadow-sm text-sm text-muted-foreground leading-relaxed space-y-3">
          <p>
            Esta pesquisa é{' '}
            <strong className="text-foreground">identificada</strong> — seu nome
            e função ficam associados às suas respostas para permitir uma análise
            mais precisa pela administração.
          </p>
          <p>
            As respostas serão tratadas com responsabilidade e usadas apenas para
            fins internos de gestão e melhoria do ambiente de trabalho.
          </p>
          <p>
            <strong className="text-foreground">
              Não há respostas certas ou erradas.
            </strong>{' '}
            Responda com sinceridade.
          </p>
        </div>
      </section>

      {/* Formulário */}
      <section className="px-5 pb-10 max-w-lg mx-auto w-full flex-1">
        <div className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-5">
          <h2 className="text-base font-semibold text-foreground">
            Antes de começar, se identifique:
          </h2>

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-sm font-medium">
              Nome completo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (errors.name) setErrors((p) => ({ ...p, name: undefined }))
              }}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleStart()}
              placeholder="Digite seu nome completo"
              className="h-12 text-base rounded-xl"
              autoComplete="name"
              disabled={loading}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Função */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Função <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setRole(r)
                    if (errors.role) setErrors((p) => ({ ...p, role: undefined }))
                  }}
                  className={[
                    'h-11 px-3 rounded-xl border text-sm font-medium transition-all text-left',
                    role === r
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-white text-foreground border-border hover:border-primary/60 active:bg-muted',
                    loading ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {r}
                </button>
              ))}
            </div>
            {role === 'Outro' && (
              <Input
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                placeholder="Qual é a sua função?"
                className="h-11 text-sm rounded-xl mt-1"
                disabled={loading}
              />
            )}
            {errors.role && (
              <p className="text-xs text-destructive">{errors.role}</p>
            )}
          </div>

          {/* Código de acesso (somente se necessário) */}
          {requiresCode && (
            <div className="space-y-1.5">
              <Label htmlFor="accessCode" className="text-sm font-medium">
                Código de acesso <span className="text-destructive">*</span>
              </Label>
              <Input
                id="accessCode"
                value={accessCode}
                onChange={(e) => {
                  setAccessCode(e.target.value)
                  if (errors.accessCode)
                    setErrors((p) => ({ ...p, accessCode: undefined }))
                }}
                placeholder="Informe o código fornecido pelo organizador"
                className="h-12 text-base rounded-xl tracking-widest"
                autoComplete="off"
                disabled={loading}
              />
              {errors.accessCode && (
                <p className="text-xs text-destructive">{errors.accessCode}</p>
              )}
            </div>
          )}

          {/* Consentimento LGPD */}
          <div
            className={[
              'rounded-xl border p-4 space-y-2 transition-colors',
              errors.consent
                ? 'border-destructive/50 bg-destructive/5'
                : 'border-border bg-muted/30',
            ].join(' ')}
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked)
                  if (errors.consent)
                    setErrors((p) => ({ ...p, consent: undefined }))
                }}
                disabled={loading}
                className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                Concordo que minhas respostas serão armazenadas de forma
                identificada e utilizadas exclusivamente para gestão interna do
                Brownie do Ton, conforme a{' '}
                <Link
                  href="/privacidade"
                  target="_blank"
                  className="text-primary underline"
                >
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>
            {errors.consent && (
              <p className="text-xs text-destructive">{errors.consent}</p>
            )}
          </div>

          {/* Erro de API */}
          {apiError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm text-destructive">
              {apiError}
            </div>
          )}

          {/* CTA */}
          <Button
            onClick={handleStart}
            disabled={loading}
            className="w-full h-14 text-base font-semibold rounded-xl"
            size="lg"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Iniciando...
              </span>
            ) : (
              'Iniciar Pesquisa →'
            )}
          </Button>
        </div>
      </section>
    </main>
  )
}
