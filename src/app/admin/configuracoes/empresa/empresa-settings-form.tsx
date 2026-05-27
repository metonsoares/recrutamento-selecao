'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { AiSettings } from '@/types'
import { Sparkles, Loader2, Upload, ImageIcon, CheckCircle2, Search, AlertCircle } from 'lucide-react'
import Image from 'next/image'

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

type FieldKey =
  | 'mission'
  | 'vision'
  | 'company_culture'
  | 'ideal_candidate_profile'
  | 'desired_behaviors'
  | 'alert_behaviors'
  | 'whatsapp_agent_prompt'
  | 'analysis_prompt'

// ─── helpers ────────────────────────────────────────────────────────────────

function maskKey(key: string | null): string {
  if (!key) return ''
  return '••••••••••••' + key.slice(-4)
}

function FieldLabel({
  label,
  field,
  improvingField,
  onImprove,
}: {
  label: string
  field: FieldKey
  improvingField: FieldKey | null
  onImprove: (field: FieldKey) => void
}) {
  const isImproving = improvingField === field
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <Label className="text-sm">{label}</Label>
      <button
        type="button"
        onClick={() => onImprove(field)}
        disabled={isImproving || !!improvingField}
        className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
        title="Melhorar com IA"
      >
        {isImproving
          ? <><Loader2 className="w-3 h-3 animate-spin" />Ajustando...</>
          : <><Sparkles className="w-3 h-3" />Ajustar com IA</>
        }
      </button>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EmpresaSettingsForm({ settings }: { settings: AiSettings | null }) {
  const router = useRouter()

  // ── Identidade visual ─────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [companyName, setCompanyName] = useState(settings?.company_name || '')
  const [logoUrl, setLogoUrl] = useState(settings?.logo_url || '')
  const [logoPreview, setLogoPreview] = useState<string | null>(settings?.logo_url || null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [savingIdentidade, setSavingIdentidade] = useState(false)

  // ── Dados fiscais ─────────────────────────────────────────────────────────
  const [fiscal, setFiscal] = useState({
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
  const [savingFiscal, setSavingFiscal] = useState(false)
  const [fiscalSaved, setFiscalSaved] = useState(false)

  async function handleCNPJLookup() {
    const digits = fiscal.cnpj.replace(/\D/g, '')
    if (digits.length !== 14) { setCnpjError('CNPJ incompleto.'); return }
    if (!validateCNPJ(digits)) { setCnpjError('CNPJ inválido.'); setCnpjStatus('error'); return }
    setCnpjError(null)
    setCnpjStatus('loading')
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
      if (!res.ok) throw new Error('CNPJ não encontrado na Receita Federal.')
      const data: CNPJData = await res.json()
      setFiscal(f => ({
        ...f,
        razao_social: data.razao_social || f.razao_social,
        endereco_logradouro: data.logradouro || f.endereco_logradouro,
        endereco_numero: data.numero || f.endereco_numero,
        endereco_complemento: data.complemento || f.endereco_complemento,
        endereco_bairro: data.bairro || f.endereco_bairro,
        endereco_cidade: data.municipio || f.endereco_cidade,
        endereco_estado: data.uf || f.endereco_estado,
        endereco_cep: data.cep ? data.cep.replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2') : f.endereco_cep,
      }))
      setCnpjStatus('found')
    } catch (err) {
      setCnpjError(err instanceof Error ? err.message : 'Erro ao consultar a Receita Federal.')
      setCnpjStatus('error')
    }
  }

  async function handleSaveFiscal() {
    const digits = fiscal.cnpj.replace(/\D/g, '')
    if (digits.length > 0 && !validateCNPJ(digits)) {
      setCnpjError('CNPJ inválido. Verifique antes de salvar.'); return
    }
    setSavingFiscal(true)
    setFiscalSaved(false)
    const supabase = createSupabaseBrowserClient()
    const payload = {
      apelido: fiscal.apelido.trim() || null,
      cnpj: digits || null,
      razao_social: fiscal.razao_social.trim() || null,
      endereco_logradouro: fiscal.endereco_logradouro.trim() || null,
      endereco_numero: fiscal.endereco_numero.trim() || null,
      endereco_complemento: fiscal.endereco_complemento.trim() || null,
      endereco_bairro: fiscal.endereco_bairro.trim() || null,
      endereco_cidade: fiscal.endereco_cidade.trim() || null,
      endereco_estado: fiscal.endereco_estado.trim() || null,
      endereco_cep: fiscal.endereco_cep.replace(/\D/g, '') || null,
      updated_at: new Date().toISOString(),
    }
    if (settings?.id) {
      await supabase.from('ai_settings').update(payload).eq('id', settings.id)
    } else {
      await supabase.from('ai_settings').insert(payload)
    }
    setSavingFiscal(false)
    setFiscalSaved(true)
    router.refresh()
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file)
    setLogoPreview(objectUrl)
    setUploadSuccess(false)

    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/company/upload-logo', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.url) {
        setLogoUrl(data.url)
        setLogoPreview(data.url)
        setUploadSuccess(true)
        router.refresh()
      } else {
        alert(data.error || 'Erro ao fazer upload.')
        setLogoPreview(settings?.logo_url || null)
      }
    } catch {
      alert('Erro ao enviar imagem.')
      setLogoPreview(settings?.logo_url || null)
    } finally {
      setUploadingLogo(false)
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSaveIdentidade() {
    setSavingIdentidade(true)
    const supabase = createSupabaseBrowserClient()
    const payload = {
      company_name: companyName.trim() || null,
      logo_url: logoUrl || null,
      updated_at: new Date().toISOString(),
    }
    if (settings?.id) {
      await supabase.from('ai_settings').update(payload).eq('id', settings.id)
    } else {
      await supabase.from('ai_settings').insert(payload)
    }
    setSavingIdentidade(false)
    router.refresh()
    alert('Identidade visual salva!')
  }

  // ── Dados da empresa ──────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [improvingField, setImprovingField] = useState<FieldKey | null>(null)
  const [form, setForm] = useState({
    mission: settings?.mission || '',
    vision: settings?.vision || '',
    company_culture: settings?.company_culture || '',
    ideal_candidate_profile: settings?.ideal_candidate_profile || '',
    desired_behaviors: (settings?.desired_behaviors || []).join('\n'),
    alert_behaviors: (settings?.alert_behaviors || []).join('\n'),
  })

  // ── Config da IA ──────────────────────────────────────────────────────────
  const [savingAi, setSavingAi] = useState(false)
  const [aiForm, setAiForm] = useState({
    whatsapp_agent_prompt: settings?.whatsapp_agent_prompt || '',
    analysis_prompt: settings?.analysis_prompt || '',
    culture_weight: settings?.culture_weight ?? 0.5,
    experience_weight: settings?.experience_weight ?? 0.35,
    availability_weight: settings?.availability_weight ?? 0.15,
  })

  const totalWeight =
    Number(aiForm.culture_weight) +
    Number(aiForm.experience_weight) +
    Number(aiForm.availability_weight)

  // ── Salvar dados da empresa ───────────────────────────────────────────────
  async function handleSaveEmpresa() {
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    const data = {
      mission: form.mission,
      vision: form.vision,
      company_culture: form.company_culture,
      ideal_candidate_profile: form.ideal_candidate_profile,
      desired_behaviors: form.desired_behaviors.split('\n').filter(Boolean),
      alert_behaviors: form.alert_behaviors.split('\n').filter(Boolean),
      updated_at: new Date().toISOString(),
    }
    if (settings?.id) {
      await supabase.from('ai_settings').update(data).eq('id', settings.id)
    } else {
      await supabase.from('ai_settings').insert(data)
    }
    setSaving(false)
    router.refresh()
    alert('Dados da empresa salvos!')
  }

  // ── Salvar config da IA ───────────────────────────────────────────────────
  async function handleSaveAi() {
    setSavingAi(true)
    const supabase = createSupabaseBrowserClient()
    const data = {
      whatsapp_agent_prompt: aiForm.whatsapp_agent_prompt,
      analysis_prompt: aiForm.analysis_prompt,
      culture_weight: Number(aiForm.culture_weight),
      experience_weight: Number(aiForm.experience_weight),
      availability_weight: Number(aiForm.availability_weight),
      updated_at: new Date().toISOString(),
    }
    if (settings?.id) {
      await supabase.from('ai_settings').update(data).eq('id', settings.id)
    } else {
      await supabase.from('ai_settings').insert(data)
    }
    setSavingAi(false)
    router.refresh()
    alert('Configuração da IA salva!')
  }

  // ── Ajustar campo com IA ──────────────────────────────────────────────────
  async function handleImprove(field: FieldKey) {
    const value = field in form
      ? (form as Record<string, string>)[field]
      : (aiForm as Record<string, unknown>)[field] as string

    if (!value?.trim()) {
      alert('Preencha o campo antes de melhorar com IA.')
      return
    }
    setImprovingField(field)
    try {
      const res = await fetch('/api/admin/ai/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value }),
      })
      const data = await res.json()
      if (data.improved) {
        if (field in form) {
          setForm(f => ({ ...f, [field]: data.improved }))
        } else {
          setAiForm(f => ({ ...f, [field]: data.improved }))
        }
      } else {
        alert(data.error || 'Erro ao ajustar com IA.')
      }
    } catch {
      alert('Erro ao conectar com a IA.')
    } finally {
      setImprovingField(null)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-8 max-w-3xl">

      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Dados da Empresa</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Identidade, cultura e configurações de IA para análise de candidatos
        </p>
      </div>

      {/* ══ SEÇÃO 0: Identidade Visual ══════════════════════════════════════ */}
      <section className="space-y-5">
        <h2 className="text-base font-semibold text-[#333333] border-b pb-2">Identidade Visual</h2>

        {/* Logo upload */}
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* Preview */}
          <div className="shrink-0">
            <p className="text-sm font-medium mb-2">Logomarca</p>
            <div
              className="w-24 h-24 rounded-xl border-2 border-dashed border-[#d0d0d0] bg-[#fafafa] flex items-center justify-center overflow-hidden cursor-pointer hover:border-[#aaa] transition-colors relative"
              onClick={() => fileInputRef.current?.click()}
              title="Clique para alterar a logo"
            >
              {logoPreview ? (
                <Image
                  src={logoPreview}
                  alt="Logo da empresa"
                  fill
                  className="object-contain p-1"
                  unoptimized
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-[#bbb]" />
              )}
              {uploadingLogo && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-[#555]" />
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 text-center">Clique para trocar</p>
          </div>

          {/* Upload controls */}
          <div className="flex-1 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
              onChange={handleLogoChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingLogo}
              className="gap-2"
            >
              {uploadingLogo
                ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                : <><Upload className="w-4 h-4" />Selecionar imagem</>
              }
            </Button>
            {uploadSuccess && (
              <p className="flex items-center gap-1.5 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4" />Logo atualizada com sucesso!
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Formatos aceitos: JPG, PNG, GIF, WebP, SVG · Máximo 5MB
              <br />A logo será usada no sidebar, no formulário público e como favicon.
            </p>
          </div>
        </div>

        {/* Company name */}
        <div>
          <Label className="text-sm mb-1.5 block">Nome da Empresa</Label>
          <Input
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            placeholder="Ex: Brownie do Ton"
            className="text-base max-w-sm"
          />
        </div>

        <Button onClick={handleSaveIdentidade} disabled={savingIdentidade} className="w-full sm:w-auto">
          {savingIdentidade ? 'Salvando...' : 'Salvar Identidade Visual'}
        </Button>
      </section>

      {/* ══ SEÇÃO 0B: Dados Fiscais ═════════════════════════════════════════ */}
      <section className="space-y-5">
        <h2 className="text-base font-semibold text-[#333333] border-b pb-2">Cadastro da Empresa</h2>

        {/* Apelido */}
        <div>
          <Label className="text-sm mb-1.5 block">Apelido <span className="text-muted-foreground font-normal">(nome interno)</span></Label>
          <Input
            value={fiscal.apelido}
            onChange={e => setFiscal(f => ({ ...f, apelido: e.target.value }))}
            placeholder="Ex: Filial Centro"
            className="text-base max-w-sm"
          />
        </div>

        {/* CNPJ + botão buscar */}
        <div>
          <Label className="text-sm mb-1.5 block">CNPJ</Label>
          <div className="flex gap-2 max-w-sm">
            <div className="relative flex-1">
              <Input
                value={fiscal.cnpj}
                onChange={e => {
                  const masked = maskCNPJ(e.target.value)
                  setFiscal(f => ({ ...f, cnpj: masked }))
                  setCnpjStatus('idle')
                  setCnpjError(null)
                }}
                placeholder="00.000.000/0001-00"
                className={`text-base pr-8 ${cnpjStatus === 'error' ? 'border-red-400 focus-visible:ring-red-300' : cnpjStatus === 'found' ? 'border-emerald-400 focus-visible:ring-emerald-300' : ''}`}
                maxLength={18}
              />
              {cnpjStatus === 'found' && (
                <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
              )}
              {cnpjStatus === 'error' && (
                <AlertCircle className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleCNPJLookup}
              disabled={cnpjStatus === 'loading' || fiscal.cnpj.replace(/\D/g, '').length !== 14}
              className="gap-1.5 shrink-0"
            >
              {cnpjStatus === 'loading'
                ? <><Loader2 className="w-4 h-4 animate-spin" />Buscando...</>
                : <><Search className="w-4 h-4" />Buscar na Receita</>
              }
            </Button>
          </div>
          {cnpjError && (
            <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />{cnpjError}
            </p>
          )}
          {cnpjStatus === 'found' && (
            <p className="text-sm text-emerald-700 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />Dados preenchidos automaticamente pela Receita Federal.
            </p>
          )}
        </div>

        {/* Razão Social */}
        <div>
          <Label className="text-sm mb-1.5 block">Razão Social</Label>
          <Input
            value={fiscal.razao_social}
            onChange={e => setFiscal(f => ({ ...f, razao_social: e.target.value }))}
            placeholder="Preenchido automaticamente ao buscar o CNPJ"
            className="text-base"
          />
        </div>

        {/* Endereço */}
        <div className="space-y-3">
          <Label className="text-sm block">Endereço</Label>

          {/* CEP + Logradouro */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">CEP</Label>
              <Input
                value={fiscal.endereco_cep}
                onChange={e => setFiscal(f => ({ ...f, endereco_cep: e.target.value }))}
                placeholder="00000-000"
                className="text-sm"
              />
            </div>
            <div className="sm:col-span-3">
              <Label className="text-xs text-muted-foreground mb-1 block">Logradouro</Label>
              <Input
                value={fiscal.endereco_logradouro}
                onChange={e => setFiscal(f => ({ ...f, endereco_logradouro: e.target.value }))}
                placeholder="Rua, Avenida..."
                className="text-sm"
              />
            </div>
          </div>

          {/* Número + Complemento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Número</Label>
              <Input
                value={fiscal.endereco_numero}
                onChange={e => setFiscal(f => ({ ...f, endereco_numero: e.target.value }))}
                placeholder="123"
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Complemento</Label>
              <Input
                value={fiscal.endereco_complemento}
                onChange={e => setFiscal(f => ({ ...f, endereco_complemento: e.target.value }))}
                placeholder="Sala, Andar..."
                className="text-sm"
              />
            </div>
          </div>

          {/* Bairro + Cidade + Estado */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Bairro</Label>
              <Input
                value={fiscal.endereco_bairro}
                onChange={e => setFiscal(f => ({ ...f, endereco_bairro: e.target.value }))}
                placeholder="Centro"
                className="text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground mb-1 block">Cidade</Label>
              <Input
                value={fiscal.endereco_cidade}
                onChange={e => setFiscal(f => ({ ...f, endereco_cidade: e.target.value }))}
                placeholder="Petrópolis"
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Estado</Label>
              <Input
                value={fiscal.endereco_estado}
                onChange={e => setFiscal(f => ({ ...f, endereco_estado: e.target.value }))}
                placeholder="RJ"
                maxLength={2}
                className="text-sm uppercase"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSaveFiscal} disabled={savingFiscal} className="w-full sm:w-auto">
            {savingFiscal ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando...</> : 'Salvar Cadastro da Empresa'}
          </Button>
          {fiscalSaved && (
            <span className="flex items-center gap-1 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />Salvo!
            </span>
          )}
        </div>
      </section>

      {/* ══ SEÇÃO 1: Empresa ════════════════════════════════════════════════ */}
      <section className="space-y-5">
        <h2 className="text-base font-semibold text-[#333333] border-b pb-2">Empresa</h2>

        <div>
          <FieldLabel improvingField={improvingField} onImprove={handleImprove} label="Missão" field="mission" />
          <Input
            value={form.mission}
            onChange={e => setForm(f => ({ ...f, mission: e.target.value }))}
            placeholder="Ex: Servir com excelência, cuidado e sabor."
            className="text-base"
          />
        </div>

        <div>
          <FieldLabel improvingField={improvingField} onImprove={handleImprove} label="Visão" field="vision" />
          <Input
            value={form.vision}
            onChange={e => setForm(f => ({ ...f, vision: e.target.value }))}
            placeholder="Ex: Ser referência em Petrópolis."
            className="text-base"
          />
        </div>

        <div>
          <FieldLabel improvingField={improvingField} onImprove={handleImprove} label="Cultura da Empresa" field="company_culture" />
          <Textarea
            value={form.company_culture}
            onChange={e => setForm(f => ({ ...f, company_culture: e.target.value }))}
            rows={5}
            className="text-base resize-none"
          />
        </div>

        <div>
          <FieldLabel improvingField={improvingField} onImprove={handleImprove} label="Perfil Ideal do Colaborador" field="ideal_candidate_profile" />
          <Textarea
            value={form.ideal_candidate_profile}
            onChange={e => setForm(f => ({ ...f, ideal_candidate_profile: e.target.value }))}
            rows={4}
            className="text-base resize-none"
          />
        </div>

        <div>
          <FieldLabel improvingField={improvingField} onImprove={handleImprove} label="Comportamentos Desejados (um por linha)" field="desired_behaviors" />
          <Textarea
            value={form.desired_behaviors}
            onChange={e => setForm(f => ({ ...f, desired_behaviors: e.target.value }))}
            rows={6}
            placeholder={'Pontualidade\nRespeito\nBoa comunicação'}
            className="text-base resize-none"
          />
        </div>

        <div>
          <FieldLabel improvingField={improvingField} onImprove={handleImprove} label="Comportamentos de Alerta (um por linha)" field="alert_behaviors" />
          <Textarea
            value={form.alert_behaviors}
            onChange={e => setForm(f => ({ ...f, alert_behaviors: e.target.value }))}
            rows={6}
            placeholder={'Falta de disponibilidade\nPostura agressiva'}
            className="text-base resize-none"
          />
        </div>

        <Button onClick={handleSaveEmpresa} disabled={saving} className="w-full sm:w-auto">
          {saving ? 'Salvando...' : 'Salvar Dados da Empresa'}
        </Button>
      </section>

      {/* ══ SEÇÃO 2: Configuração da IA ═════════════════════════════════════ */}
      <section className="space-y-5">
        <h2 className="text-base font-semibold text-[#333333] border-b pb-2">Configuração da IA</h2>

        {/* Pesos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Peso Cultura</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Input
                type="number" step="0.05" min="0" max="1"
                value={aiForm.culture_weight}
                onChange={e => setAiForm(f => ({ ...f, culture_weight: Number(e.target.value) }))}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {(Number(aiForm.culture_weight) * 100).toFixed(0)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Peso Experiência</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Input
                type="number" step="0.05" min="0" max="1"
                value={aiForm.experience_weight}
                onChange={e => setAiForm(f => ({ ...f, experience_weight: Number(e.target.value) }))}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {(Number(aiForm.experience_weight) * 100).toFixed(0)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Peso Disponibilidade</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Input
                type="number" step="0.05" min="0" max="1"
                value={aiForm.availability_weight}
                onChange={e => setAiForm(f => ({ ...f, availability_weight: Number(e.target.value) }))}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {(Number(aiForm.availability_weight) * 100).toFixed(0)}%
              </p>
            </CardContent>
          </Card>
        </div>

        {Math.abs(totalWeight - 1) > 0.01 && (
          <p className="text-amber-600 text-sm">
            ⚠️ A soma dos pesos deve ser 1.00 (atual: {totalWeight.toFixed(2)})
          </p>
        )}

        {/* Prompts */}
        <div>
          <FieldLabel improvingField={improvingField} onImprove={handleImprove} label="Prompt da IA Atendente (WhatsApp)" field="whatsapp_agent_prompt" />
          <Textarea
            value={aiForm.whatsapp_agent_prompt}
            onChange={e => setAiForm(f => ({ ...f, whatsapp_agent_prompt: e.target.value }))}
            rows={6}
            className="text-base resize-none font-mono text-xs"
            placeholder="Você é um assistente de recrutamento da Brownie do Ton. Seja simpático e profissional..."
          />
        </div>

        <div>
          <FieldLabel improvingField={improvingField} onImprove={handleImprove} label="Prompt da IA Analista (Análise de Candidatos)" field="analysis_prompt" />
          <Textarea
            value={aiForm.analysis_prompt}
            onChange={e => setAiForm(f => ({ ...f, analysis_prompt: e.target.value }))}
            rows={6}
            className="text-base resize-none font-mono text-xs"
            placeholder="Analise o candidato com base nas respostas do formulário e teste cultural..."
          />
        </div>

        <Button onClick={handleSaveAi} disabled={savingAi} className="w-full sm:w-auto">
          {savingAi ? 'Salvando...' : 'Salvar Configuração da IA'}
        </Button>
      </section>

      {/* Chaves de API foram movidas para Configurações Plataforma → Configuração IA */}
      <div className="rounded-lg border border-[#e8e8e8] bg-[#fafafa] p-4 text-sm text-muted-foreground flex items-center gap-3">
        <span className="text-[#555]">🔑</span>
        <span>
          As chaves de API (Anthropic / OpenAI) são gerenciadas em{' '}
          <a href="/admin/configuracoes/ia" className="underline text-violet-600 hover:text-violet-800 font-medium">
            Configurações Plataforma → Configuração IA
          </a>.
        </span>
      </div>

    </div>
  )
}
