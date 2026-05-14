'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Survey } from '@/lib/types/database'

interface Props {
  survey: Survey | null
}

const STATUS_OPTIONS = [
  {
    value: 'active',
    label: 'Ativa',
    desc: 'Funcionários podem responder normalmente.',
    color: 'border-green-500 bg-green-50 text-green-700',
    inactive: 'border-border text-muted-foreground hover:border-green-400',
  },
  {
    value: 'draft',
    label: 'Rascunho',
    desc: 'Formulário público indisponível. Use para preparar a pesquisa.',
    color: 'border-amber-500 bg-amber-50 text-amber-700',
    inactive: 'border-border text-muted-foreground hover:border-amber-400',
  },
  {
    value: 'closed',
    label: 'Encerrada',
    desc: 'Pesquisa fechada. Nenhuma nova resposta será aceita.',
    color: 'border-red-500 bg-red-50 text-red-700',
    inactive: 'border-border text-muted-foreground hover:border-red-400',
  },
] as const

export default function ConfiguracoesSurvey({ survey }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(survey?.title ?? '')
  const [description, setDescription] = useState(survey?.description ?? '')
  const [status, setStatus] = useState<Survey['status']>(survey?.status ?? 'active')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!survey || !title.trim()) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('surveys')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        status,
      })
      .eq('id', survey.id)

    if (err) {
      setError('Erro ao salvar. Tente novamente.')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      router.refresh()
    }
    setSaving(false)
  }

  if (!survey) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16 text-center">
        <p className="text-muted-foreground text-sm">Nenhuma pesquisa encontrada.</p>
      </div>
    )
  }

  const publicUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://pequisa-team-ashen.vercel.app'

  return (
    <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Dados da pesquisa e status de coleta.
        </p>
      </div>

      {/* ─── Dados da Pesquisa ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Dados da Pesquisa</h2>

        <div className="space-y-1.5">
          <Label htmlFor="title" className="text-sm font-medium">
            Título <span className="text-destructive">*</span>
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl h-10 text-sm"
            placeholder="Ex: Pesquisa de Clima – Maio 2026"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="desc" className="text-sm font-medium">
            Descrição{' '}
            <span className="text-muted-foreground font-normal">(exibida no início do formulário)</span>
          </Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="resize-none rounded-xl text-sm"
            placeholder="Explique o objetivo da pesquisa e como as respostas serão usadas..."
          />
        </div>

        {/* ─── Status ───────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Status da coleta</Label>
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={[
                  'rounded-xl border-2 p-3 text-left transition-all',
                  status === opt.value ? opt.color : opt.inactive,
                ].join(' ')}
              >
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-[11px] mt-0.5 leading-snug opacity-70">
                  {opt.desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end pt-1">
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="rounded-xl"
          >
            {saved ? '✓ Salvo com sucesso' : saving ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      </div>

      {/* ─── Link da Pesquisa ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Link da Pesquisa</h2>
        <p className="text-xs text-muted-foreground">
          Compartilhe este link com os funcionários ou gere um QR Code.
        </p>

        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted rounded-xl px-3 py-2.5 text-foreground truncate font-mono">
            {publicUrl}
          </code>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-xs flex-shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(publicUrl)
            }}
          >
            Copiar
          </Button>
        </div>

        <div className="bg-muted/50 rounded-xl px-4 py-3 text-xs text-muted-foreground leading-relaxed">
          💡 Para criar um <strong>QR Code</strong>, acesse{' '}
          <a
            href={`https://qr.io/?url=${encodeURIComponent(publicUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            qr.io
          </a>{' '}
          e cole o link acima. Imprima e fixe na loja para os funcionários escanearem.
        </div>
      </div>

      {/* ─── Acesso Admin ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Acesso Administrativo</h2>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3 bg-muted/40 rounded-xl px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">E-mail de acesso</p>
              <p className="font-mono text-sm font-medium text-foreground">
                admin@browniedoton.com.br
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground px-1">
            Para alterar a senha, acesse o{' '}
            <a
              href="https://supabase.com/dashboard/project/vwfswdupzslfuowccggp/auth/users"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Supabase → Authentication → Users
            </a>
            {' '}e clique em "Send password reset".
          </p>
        </div>
      </div>
    </div>
  )
}
