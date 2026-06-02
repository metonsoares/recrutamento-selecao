'use client'
import { useState } from 'react'
import { Building2, Plus, Pencil, Trash2, Loader2, X, Search, AlertCircle, CheckCircle2, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string
  apelido: string | null
  cnpj: string | null
  razao_social: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  created_at: string
}

type CompanyPayload = Omit<Company, 'id' | 'created_at'>

interface Props { companies: Company[] }

// ─── CNPJ helpers ─────────────────────────────────────────────────────────────

function maskCNPJ(v: string) {
  return v.replace(/\D/g, '').slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function validateCNPJ(cnpj: string) {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (w: number[]) => w.reduce((a, v, i) => a + +d[i] * v, 0)
  const mod = (n: number) => { const r = n % 11; return r < 2 ? 0 : 11 - r }
  return mod(calc([5,4,3,2,9,8,7,6,5,4,3,2])) === +d[12]
      && mod(calc([6,5,4,3,2,9,8,7,6,5,4,3,2])) === +d[13]
}

function maskCEP(v: string) {
  return v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  )
}

// ─── Form (create / edit) ─────────────────────────────────────────────────────

function CompanyForm({
  initial,
  onSave,
  onClose,
}: {
  initial: CompanyPayload
  onSave: (payload: CompanyPayload) => Promise<void>
  onClose: () => void
}) {
  const [data, setData] = useState<CompanyPayload>(initial)
  const [saving, setSaving] = useState(false)
  const [cnpjError, setCnpjError] = useState('')
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [error, setError] = useState('')

  function set<K extends keyof CompanyPayload>(k: K, v: CompanyPayload[K]) {
    setData(prev => ({ ...prev, [k]: v }))
  }

  function handleCNPJ(raw: string) {
    const masked = maskCNPJ(raw)
    set('cnpj', masked)
    const digits = masked.replace(/\D/g, '')
    if (digits.length === 14) setCnpjError(validateCNPJ(masked) ? '' : 'CNPJ inválido')
    else setCnpjError('')
  }

  async function lookupCNPJ() {
    const digits = (data.cnpj || '').replace(/\D/g, '')
    if (digits.length !== 14 || !validateCNPJ(data.cnpj || '')) { setCnpjError('CNPJ inválido'); return }
    setCnpjLoading(true)
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
      const json = await res.json()
      if (json.razao_social) {
        setData(prev => ({
          ...prev,
          razao_social: json.razao_social || prev.razao_social,
          logradouro: json.logradouro || prev.logradouro,
          numero: json.numero || prev.numero,
          complemento: json.complemento || prev.complemento,
          bairro: json.bairro || prev.bairro,
          cidade: json.municipio || prev.cidade,
          estado: json.uf || prev.estado,
          cep: json.cep ? json.cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2') : prev.cep,
        }))
      }
    } catch { setError('Não foi possível consultar o CNPJ.') }
    finally { setCnpjLoading(false) }
  }

  async function handleCEP(raw: string) {
    const masked = maskCEP(raw)
    set('cep', masked)
    const digits = masked.replace(/\D/g, '')
    if (digits.length === 8) {
      setCepLoading(true)
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
        const json = await res.json()
        if (!json.erro) {
          setData(prev => ({
            ...prev,
            cep: masked,
            logradouro: json.logradouro || prev.logradouro,
            bairro: json.bairro || prev.bairro,
            cidade: json.localidade || prev.cidade,
            estado: json.uf || prev.estado,
          }))
        }
      } catch { /* ignora */ }
      finally { setCepLoading(false) }
    }
  }

  async function handleSubmit() {
    if (cnpjError) return
    setSaving(true)
    setError('')
    try {
      await onSave(data)
    } catch (e) {
      setError((e as Error).message || 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="px-5 py-4 space-y-3">
        <Field label="Apelido (nome interno)">
          <Input value={data.apelido || ''} onChange={e => set('apelido', e.target.value)} placeholder="Ex: Matriz, Filial Centro" />
        </Field>

        {/* CNPJ */}
        <Field label="CNPJ">
          <div className="flex gap-2">
            <Input
              value={data.cnpj || ''}
              onChange={e => handleCNPJ(e.target.value)}
              placeholder="00.000.000/0001-00"
              className={cnpjError ? 'border-red-400' : ''}
            />
            <Button type="button" variant="outline" onClick={lookupCNPJ} disabled={cnpjLoading} className="shrink-0 gap-1.5 text-sm">
              {cnpjLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Buscar
            </Button>
          </div>
          {cnpjError && <p className="text-xs text-red-600 flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{cnpjError}</p>}
        </Field>

        <Field label="Razão Social">
          <Input value={data.razao_social || ''} onChange={e => set('razao_social', e.target.value)} placeholder="Preenchido automaticamente ao buscar o CNPJ" />
        </Field>

        {/* Endereço */}
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-1 border-t">Endereço</p>

        <div className="grid grid-cols-2 gap-3">
          <Field label={cepLoading ? 'CEP — buscando...' : 'CEP'}>
            <div className="relative">
              <Input value={data.cep || ''} onChange={e => handleCEP(e.target.value)} placeholder="00000-000" maxLength={9} />
              {cepLoading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-primary" />}
            </div>
          </Field>
          <Field label="Estado (UF)">
            <Input value={data.estado || ''} onChange={e => set('estado', e.target.value)} placeholder="RJ" maxLength={2} className="uppercase" />
          </Field>
        </div>

        <Field label="Logradouro">
          <Input value={data.logradouro || ''} onChange={e => set('logradouro', e.target.value)} placeholder="Rua, Avenida, Estrada..." />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Número">
            <Input value={data.numero || ''} onChange={e => set('numero', e.target.value)} placeholder="123" />
          </Field>
          <Field label="Complemento">
            <Input value={data.complemento || ''} onChange={e => set('complemento', e.target.value)} placeholder="Sala, Andar, Bloco..." />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Bairro">
            <Input value={data.bairro || ''} onChange={e => set('bairro', e.target.value)} placeholder="Centro" />
          </Field>
          <Field label="Cidade">
            <Input value={data.cidade || ''} onChange={e => set('cidade', e.target.value)} placeholder="Petrópolis" />
          </Field>
        </div>

        {error && (
          <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={saving || !!cnpjError} className="gap-1.5">
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : <><CheckCircle2 className="w-3.5 h-3.5" />Salvar empresa</>}
        </Button>
      </div>
    </>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

const EMPTY: CompanyPayload = {
  apelido: '', cnpj: '', razao_social: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
}

export function CompaniesManager({ companies: initial }: Props) {
  const [companies, setCompanies] = useState<Company[]>(initial)
  const [modal, setModal] = useState<'create' | 'edit' | 'delete' | null>(null)
  const [selected, setSelected] = useState<Company | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleCreate(payload: CompanyPayload) {
    const res = await fetch('/api/admin/companies', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setCompanies(prev => [data.company, ...prev])
    setModal(null)
    showToast('ok', 'Empresa cadastrada com sucesso.')
  }

  async function handleEdit(payload: CompanyPayload) {
    if (!selected) return
    const res = await fetch(`/api/admin/companies/${selected.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setCompanies(prev => prev.map(c => c.id === selected.id ? data.company : c))
    setModal(null)
    showToast('ok', 'Empresa atualizada.')
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const res = await fetch(`/api/admin/companies/${selected.id}`, { method: 'DELETE' })
    const data = await res.json()
    setDeleting(false)
    if (!res.ok) { showToast('err', data.error || 'Erro ao remover.'); setModal(null); return }
    setCompanies(prev => prev.filter(c => c.id !== selected.id))
    setModal(null)
    showToast('ok', 'Empresa removida.')
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Building2 className="w-6 h-6 text-[#333]" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cadastro de Empresa</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {companies.length} empresa{companies.length !== 1 ? 's' : ''} cadastrada{companies.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Button onClick={() => setModal('create')} className="gap-1.5 shrink-0">
          <Plus className="w-4 h-4" />
          Nova empresa
        </Button>
      </div>

      {/* Lista */}
      {companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-gray-300" />
          </div>
          <div>
            <p className="font-medium text-gray-600">Nenhuma empresa cadastrada</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Nova empresa" para adicionar.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          {companies.map((c, i) => (
            <div key={c.id} className={`flex items-start gap-3 px-4 py-4 ${i < companies.length - 1 ? 'border-b' : ''}`}>
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-gray-400" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-semibold text-gray-900">{c.apelido || 'Sem apelido'}</p>
                  {c.cnpj && (
                    <span className="text-[11px] font-mono text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded">{c.cnpj}</span>
                  )}
                </div>
                {c.razao_social && <p className="text-[12px] text-muted-foreground mt-0.5">{c.razao_social}</p>}
                {(c.logradouro || c.cidade) && (
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {[c.logradouro, c.numero, c.bairro, c.cidade, c.estado].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { setSelected(c); setModal('edit') }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors" title="Editar">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => { setSelected(c); setModal('delete') }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Remover">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Criar */}
      {modal === 'create' && (
        <Modal title="Nova empresa" onClose={() => setModal(null)}>
          <CompanyForm initial={EMPTY} onSave={handleCreate} onClose={() => setModal(null)} />
        </Modal>
      )}

      {/* Modal: Editar */}
      {modal === 'edit' && selected && (
        <Modal title={`Editar: ${selected.apelido || selected.razao_social || 'Empresa'}`} onClose={() => setModal(null)}>
          <CompanyForm
            initial={{
              apelido: selected.apelido, cnpj: selected.cnpj, razao_social: selected.razao_social,
              cep: selected.cep, logradouro: selected.logradouro, numero: selected.numero,
              complemento: selected.complemento, bairro: selected.bairro, cidade: selected.cidade, estado: selected.estado,
            }}
            onSave={handleEdit}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {/* Modal: Excluir */}
      {modal === 'delete' && selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Remover empresa</h2>
            <p className="text-sm text-gray-600">
              Tem certeza que deseja remover <strong>{selected.apelido || selected.razao_social || 'esta empresa'}</strong>?
              Esta ação é irreversível.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModal(null)} disabled={deleting}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-1.5">
                {deleting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Removendo...</> : <><Trash2 className="w-3.5 h-3.5" />Remover</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
