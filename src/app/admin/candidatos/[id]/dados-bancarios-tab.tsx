'use client'
import { useState, useEffect, useMemo } from 'react'
import { Loader2, Save, CheckCircle2, AlertCircle, Landmark, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { contemBusca } from '@/lib/helpers'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface BankData {
  bank_code: string
  bank_name: string
  agency: string
  account: string
  pix_type: string
  pix_key: string
}

interface Bank { code: number | null; name: string; fullName?: string }

interface Props {
  candidateId: string
  initialData: BankData | null
}

const PIX_TYPES = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave aleatória' },
]

function emptyData(): BankData {
  return { bank_code: '', bank_name: '', agency: '', account: '', pix_type: '', pix_key: '' }
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      {children}
    </div>
  )
}

export function DadosBancariosTab({ candidateId, initialData }: Props) {
  const [data, setData] = useState<BankData>(initialData ?? emptyData())
  const [banks, setBanks] = useState<Bank[]>([])
  const [bankSearch, setBankSearch] = useState('')
  const [bankOpen, setBankOpen] = useState(false)
  const [loadingBanks, setLoadingBanks] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function set<K extends keyof BankData>(k: K, v: BankData[K]) {
    setData(prev => ({ ...prev, [k]: v }))
  }

  // Busca lista de bancos na BrasilAPI
  useEffect(() => {
    setLoadingBanks(true)
    fetch('https://brasilapi.com.br/api/banks/v1')
      .then(r => r.json())
      .then((list: Bank[]) => {
        const valid = (list || []).filter(b => b.code != null && b.name)
          .sort((a, b) => (a.code ?? 0) - (b.code ?? 0))
        setBanks(valid)
      })
      .catch(() => {})
      .finally(() => setLoadingBanks(false))
  }, [])

  const filteredBanks = useMemo(() => {
    if (!bankSearch.trim()) return banks.slice(0, 60)
    const q = bankSearch.trim()
    return banks.filter(b =>
      contemBusca(b.name, q) || String(b.code).includes(q.replace(/\D/g, ''))
    ).slice(0, 60)
  }, [banks, bankSearch])

  function selectBank(b: Bank) {
    const code = String(b.code).padStart(3, '0')
    setData(prev => ({ ...prev, bank_code: code, bank_name: b.name }))
    setBankOpen(false)
    setBankSearch('')
  }

  // Máscara da chave PIX por tipo
  function handlePixKey(raw: string) {
    let v = raw
    if (data.pix_type === 'cpf') {
      v = raw.replace(/\D/g, '').slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    } else if (data.pix_type === 'cnpj') {
      v = raw.replace(/\D/g, '').slice(0, 14)
        .replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
    } else if (data.pix_type === 'telefone') {
      v = raw.replace(/\D/g, '').slice(0, 11)
        .replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
    }
    set('pix_key', v)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/bank-data`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setToast({ type: 'ok', msg: 'Dados bancários salvos!' })
    } catch (e) {
      setToast({ type: 'err', msg: (e as Error).message || 'Erro ao salvar.' })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  const pixPlaceholder: Record<string, string> = {
    cpf: '000.000.000-00',
    cnpj: '00.000.000/0001-00',
    email: 'email@exemplo.com',
    telefone: '(00) 00000-0000',
    aleatoria: 'chave aleatória (UUID)',
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-2xl border shadow-sm p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Landmark className="w-5 h-5 text-[#333]" />
          <h2 className="text-base font-bold text-gray-900">Dados Bancários</h2>
        </div>

        {/* Banco — dropdown com busca */}
        <Field label="Banco">
          <div className="relative">
            <button
              type="button"
              onClick={() => setBankOpen(o => !o)}
              className="h-10 w-full border border-gray-300 rounded-md px-3 text-sm bg-white text-left flex items-center justify-between"
            >
              <span className={data.bank_name ? 'text-gray-900' : 'text-gray-400'}>
                {data.bank_name ? `${data.bank_code} — ${data.bank_name}` : 'Selecionar banco...'}
              </span>
              {loadingBanks && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            </button>

            {bankOpen && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
                <div className="p-2 border-b sticky top-0 bg-white">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <Input
                      autoFocus
                      value={bankSearch}
                      onChange={e => setBankSearch(e.target.value)}
                      placeholder="Buscar por nome ou código..."
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto">
                  {filteredBanks.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-4">Nenhum banco encontrado.</p>
                  )}
                  {filteredBanks.map(b => (
                    <button
                      key={`${b.code}-${b.name}`}
                      type="button"
                      onClick={() => selectBank(b)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                    >
                      <span className="font-mono text-[11px] text-muted-foreground w-9 shrink-0">{String(b.code).padStart(3, '0')}</span>
                      <span className="text-gray-700 truncate">{b.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Field>

        {/* Agência / Conta */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Agência">
            <Input
              value={data.agency}
              onChange={e => set('agency', e.target.value.replace(/[^\d-]/g, ''))}
              placeholder="0000"
            />
          </Field>
          <Field label="Conta (com dígito)">
            <Input
              value={data.account}
              onChange={e => set('account', e.target.value.replace(/[^\d-]/g, ''))}
              placeholder="00000-0"
            />
          </Field>
        </div>

        {/* PIX */}
        <div className="border-t pt-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Chave PIX</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Tipo da chave">
              <select
                value={data.pix_type}
                onChange={e => { set('pix_type', e.target.value); set('pix_key', '') }}
                className="h-10 w-full border border-gray-300 rounded-md px-3 text-sm bg-white"
              >
                <option value="">Selecionar...</option>
                {PIX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Chave PIX" className="col-span-2">
              <Input
                value={data.pix_key}
                onChange={e => handlePixKey(e.target.value)}
                placeholder={data.pix_type ? pixPlaceholder[data.pix_type] : 'Selecione o tipo primeiro'}
                disabled={!data.pix_type}
              />
            </Field>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="gap-1.5 w-full sm:w-auto">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />Salvar dados bancários</>}
      </Button>
    </div>
  )
}
