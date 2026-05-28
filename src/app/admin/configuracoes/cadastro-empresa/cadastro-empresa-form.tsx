'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { AiSettings } from '@/types'
import { Search, AlertCircle, CheckCircle2, Loader2, Building2 } from 'lucide-react'

// ─── CNPJ helpers ─────────────────────────────────────────────────────────────

function maskCNPJ(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

function validateCNPJ(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (weights: number[]) =>
    weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0)
  const mod = (n: number) => { const r = n % 11; return r < 2 ? 0 : 11 - r }
  const d1 = mod(calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]))
  const d2 = mod(calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]))
  return d1 === Number(d[12]) && d2 === Number(d[13])
}

interface CNPJData {
  razao_social: string
  nome_fantasia?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  municipio?: string
  uf?: string
  cep?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CadastroEmpresaForm({ settings }: { settings: AiSettings | null }) {
  const router = useRouter()

  const [form, setForm] = useState({
    apelido: settings?.apelido || '',
    cnpj: settings?.cnpj ? maskCNPJ(settings.cnpj) : '',
    razao_social: settings?.razao_social || '',
    endereco_logradouro: settings?.endereco_logradouro || '',
    endereco_numero: settings?.endereco_numero || '',
    endereco_complemento: settings?.endereco_complemento || '',
    endereco_bairro: settings?.endereco_bairro || '',
    endereco_cidade: settings?.endereco_cidade || '',
    endereco_estado: settings?.endereco_estado || '',
    endereco_cep: settings?.endereco_cep || '',
  })

  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'loading' | 'found' | 'error'>('idle')
  const [cnpjError, setCnpjError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = (field: keyof typeof form, val: string) =>
    setForm(f => ({ ...f, [field]: val }))

  async function handleCNPJLookup() {
    const digits = form.cnpj.replace(/\D/g, '')
    if (digits.length !== 14) { setCnpjError('CNPJ incompleto.'); return }
    if (!validateCNPJ(digits)) { setCnpjError('CNPJ inválido.'); setCnpjStatus('error'); return }
    setCnpjError(null)
    setCnpjStatus('loading')
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
      if (!res.ok) throw new Error('CNPJ não encontrado na Receita Federal.')
      const data: CNPJData = await res.json()
      setForm(f => ({
        ...f,
        razao_social: data.razao_social || f.razao_social,
        endereco_logradouro: data.logradouro || f.endereco_logradouro,
        endereco_numero: data.numero || f.endereco_numero,
        endereco_complemento: data.complemento || f.endereco_complemento,
        endereco_bairro: data.bairro || f.endereco_bairro,
        endereco_cidade: data.municipio || f.endereco_cidade,
        endereco_estado: data.uf || f.endereco_estado,
        endereco_cep: data.cep
          ? data.cep.replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2')
          : f.endereco_cep,
      }))
      setCnpjStatus('found')
    } catch (err) {
      setCnpjError(err instanceof Error ? err.message : 'Erro ao consultar a Receita Federal.')
      setCnpjStatus('error')
    }
  }

  async function handleSave() {
    const digits = form.cnpj.replace(/\D/g, '')
    if (digits.length > 0 && !validateCNPJ(digits)) {
      setCnpjError('CNPJ inválido. Verifique antes de salvar.')
      return
    }
    setSaving(true)
    setSaved(false)
    const supabase = createSupabaseBrowserClient()
    const payload = {
      apelido: form.apelido.trim() || null,
      cnpj: digits || null,
      razao_social: form.razao_social.trim() || null,
      endereco_logradouro: form.endereco_logradouro.trim() || null,
      endereco_numero: form.endereco_numero.trim() || null,
      endereco_complemento: form.endereco_complemento.trim() || null,
      endereco_bairro: form.endereco_bairro.trim() || null,
      endereco_cidade: form.endereco_cidade.trim() || null,
      endereco_estado: form.endereco_estado.trim() || null,
      endereco_cep: form.endereco_cep.replace(/\D/g, '') || null,
      updated_at: new Date().toISOString(),
    }
    if (settings?.id) {
      await supabase.from('ai_settings').update(payload).eq('id', settings.id)
    } else {
      await supabase.from('ai_settings').insert(payload)
    }
    setSaving(false)
    setSaved(true)
    router.refresh()
  }

  return (
    <div className="p-4 sm:p-6 space-y-8 max-w-2xl">

      <div className="flex items-center gap-3">
        <Building2 className="w-6 h-6 text-[#333]" />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Cadastro de Empresa</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Dados fiscais e endereço da empresa
          </p>
        </div>
      </div>

      <div className="space-y-5">

        {/* Apelido */}
        <div>
          <Label className="text-sm mb-1.5 block">
            Apelido <span className="text-muted-foreground font-normal text-xs">(nome interno)</span>
          </Label>
          <Input
            value={form.apelido}
            onChange={e => set('apelido', e.target.value)}
            placeholder="Ex: Filial Centro, Matriz"
            className="text-base max-w-sm"
          />
        </div>

        {/* CNPJ */}
        <div>
          <Label className="text-sm mb-1.5 block">CNPJ</Label>
          <div className="flex gap-2 max-w-lg">
            <div className="relative flex-1">
              <Input
                value={form.cnpj}
                onChange={e => {
                  set('cnpj', maskCNPJ(e.target.value))
                  setCnpjStatus('idle')
                  setCnpjError(null)
                }}
                placeholder="00.000.000/0001-00"
                maxLength={18}
                className={`text-base pr-8 ${
                  cnpjStatus === 'error' ? 'border-red-400 focus-visible:ring-red-300' :
                  cnpjStatus === 'found' ? 'border-emerald-400 focus-visible:ring-emerald-300' : ''
                }`}
              />
              {cnpjStatus === 'found' && (
                <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
              )}
              {cnpjStatus === 'error' && (
                <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleCNPJLookup}
              disabled={cnpjStatus === 'loading' || form.cnpj.replace(/\D/g, '').length !== 14}
              className="gap-1.5 shrink-0"
            >
              {cnpjStatus === 'loading'
                ? <><Loader2 className="w-4 h-4 animate-spin" />Buscando...</>
                : <><Search className="w-4 h-4" />Buscar na Receita</>
              }
            </Button>
          </div>
          {cnpjError && (
            <p className="text-sm text-red-600 mt-1.5 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{cnpjError}
            </p>
          )}
          {cnpjStatus === 'found' && (
            <p className="text-sm text-emerald-700 mt-1.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Dados preenchidos automaticamente pela Receita Federal.
            </p>
          )}
        </div>

        {/* Razão Social */}
        <div>
          <Label className="text-sm mb-1.5 block">Razão Social</Label>
          <Input
            value={form.razao_social}
            onChange={e => set('razao_social', e.target.value)}
            placeholder="Preenchido automaticamente ao buscar o CNPJ"
            className="text-base"
          />
        </div>

        {/* Endereço */}
        <div className="space-y-3 pt-1">
          <h3 className="text-sm font-semibold text-[#333] border-b pb-1.5">Endereço</h3>

          {/* CEP + Logradouro */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">CEP</Label>
              <Input
                value={form.endereco_cep}
                onChange={e => set('endereco_cep', e.target.value)}
                placeholder="00000-000"
                className="text-sm"
              />
            </div>
            <div className="sm:col-span-3">
              <Label className="text-xs text-muted-foreground mb-1 block">Logradouro</Label>
              <Input
                value={form.endereco_logradouro}
                onChange={e => set('endereco_logradouro', e.target.value)}
                placeholder="Rua, Avenida, Estrada..."
                className="text-sm"
              />
            </div>
          </div>

          {/* Número + Complemento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Número</Label>
              <Input
                value={form.endereco_numero}
                onChange={e => set('endereco_numero', e.target.value)}
                placeholder="123"
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Complemento</Label>
              <Input
                value={form.endereco_complemento}
                onChange={e => set('endereco_complemento', e.target.value)}
                placeholder="Sala, Andar, Bloco..."
                className="text-sm"
              />
            </div>
          </div>

          {/* Bairro + Cidade + Estado */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Bairro</Label>
              <Input
                value={form.endereco_bairro}
                onChange={e => set('endereco_bairro', e.target.value)}
                placeholder="Centro"
                className="text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground mb-1 block">Cidade</Label>
              <Input
                value={form.endereco_cidade}
                onChange={e => set('endereco_cidade', e.target.value)}
                placeholder="Petrópolis"
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Estado</Label>
              <Input
                value={form.endereco_estado}
                onChange={e => set('endereco_estado', e.target.value.toUpperCase())}
                placeholder="RJ"
                maxLength={2}
                className="text-sm uppercase"
              />
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving
              ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando...</>
              : 'Salvar Cadastro da Empresa'
            }
          </Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />Salvo com sucesso!
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
