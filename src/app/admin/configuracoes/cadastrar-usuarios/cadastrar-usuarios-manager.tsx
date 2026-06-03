'use client'
import { useState } from 'react'
import {
  UserPlus, Trash2, Loader2, X, CheckCircle2, AlertCircle, Users, Eye, EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SystemUser {
  id: string
  email: string
  name: string
  code: string
  empresa: string
  perfil: string
  candidate_id: string
}

interface Eligible {
  id: string
  full_name: string
  email: string
  cpf: string
  empresa: string
}

interface Props {
  systemUsers: SystemUser[]
  eligible: Eligible[]
}

const PERFIS = [
  { value: 'administrador', label: 'Administrador' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'operador', label: 'Operador' },
]
const PERFIL_LABEL: Record<string, string> = {
  administrador: 'Administrador', gestor: 'Gestor', operador: 'Operador',
}

// Gera código: iniciais do 1º e último nome + 4 primeiros dígitos do CPF
function genCode(name: string, cpf: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  const digits = (cpf || '').replace(/\D/g, '').slice(0, 4)
  return (first + last).toUpperCase() + digits
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CadastrarUsuariosManager({ systemUsers: initial, eligible }: Props) {
  const [users, setUsers] = useState<SystemUser[]>(initial)
  const [available, setAvailable] = useState<Eligible[]>(eligible)
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // form
  const [selectedId, setSelectedId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('123456')
  const [showPwd, setShowPwd] = useState(false)
  const [code, setCode] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [perfil, setPerfil] = useState('operador')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

  function openModal() {
    setSelectedId(''); setEmail(''); setPassword('123456'); setCode(''); setEmpresa(''); setPerfil('operador'); setError('')
    setModalOpen(true)
  }

  function handleSelect(id: string) {
    setSelectedId(id)
    const e = available.find(a => a.id === id)
    if (e) {
      setEmail(e.email)
      setCode(genCode(e.full_name, e.cpf))
      setEmpresa(e.empresa)
    }
  }

  async function handleSave() {
    setError('')
    if (!selectedId) { setError('Selecione um colaborador.'); return }
    if (!email.trim()) { setError('E-mail obrigatório (preencha no cadastro do colaborador).'); return }
    if (!password || password.length < 6) { setError('Senha precisa ter ao menos 6 caracteres.'); return }
    const sel = available.find(a => a.id === selectedId)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/system-users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: selectedId, full_name: sel?.full_name, email, password, code, empresa, perfil,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(prev => [...prev, {
        id: data.user.id, email: data.user.email, name: sel?.full_name || '',
        code: code.toUpperCase(), empresa, perfil, candidate_id: selectedId,
      }])
      setAvailable(prev => prev.filter(a => a.id !== selectedId))
      setModalOpen(false)
      showToast('ok', 'Usuário cadastrado com sucesso.')
    } catch (e) {
      setError((e as Error).message || 'Erro ao cadastrar.')
    } finally { setSaving(false) }
  }

  async function handleDelete(u: SystemUser) {
    if (!confirm(`Remover o usuário ${u.name || u.email}?`)) return
    setDeletingId(u.id)
    const res = await fetch(`/api/admin/system-users/${u.id}`, { method: 'DELETE' })
    const data = await res.json()
    setDeletingId(null)
    if (!res.ok) { showToast('err', data.error || 'Erro ao remover.'); return }
    setUsers(prev => prev.filter(x => x.id !== u.id))
    // devolve à lista de elegíveis se tinha candidate_id
    if (u.candidate_id) {
      showToast('ok', 'Usuário removido.')
    } else showToast('ok', 'Usuário removido.')
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-6">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-[#333]" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cadastrar Usuários</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button onClick={openModal} className="gap-1.5 shrink-0">
          <UserPlus className="w-4 h-4" />Adicionar usuário
        </Button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Nome do usuário</th>
              <th className="px-4 py-3 text-left font-medium">Código</th>
              <th className="px-4 py-3 text-left font-medium">Empresa</th>
              <th className="px-4 py-3 text-left font-medium">Perfil</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{u.name || '—'}</p>
                  <p className="text-[11px] text-muted-foreground">{u.email}</p>
                </td>
                <td className="px-4 py-3"><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{u.code}</span></td>
                <td className="px-4 py-3 text-gray-700">{u.empresa || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    u.perfil === 'administrador' ? 'bg-amber-100 text-amber-700' :
                    u.perfil === 'gestor' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>{PERFIL_LABEL[u.perfil] || u.perfil}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(u)} disabled={deletingId === u.id}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Remover">
                    {deletingId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum usuário cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Adicionar */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-gray-900">Adicionar usuário</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Nome completo (dropdown de colaboradores) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Nome completo *</label>
                <select value={selectedId} onChange={e => handleSelect(e.target.value)}
                  className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                  <option value="">Selecionar colaborador...</option>
                  {available.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
                {available.length === 0 && <p className="text-[11px] text-muted-foreground">Todos os colaboradores elegíveis já têm usuário.</p>}
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">E-mail *</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Buscado do colaborador" />
              </div>

              {/* Senha */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Senha *</label>
                <div className="relative">
                  <Input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="pr-9" />
                  <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">Senha padrão: 123456</p>
              </div>

              {/* Código */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Código</label>
                <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Ex: MS1076" className="font-mono" />
                <p className="text-[11px] text-muted-foreground">Iniciais (nome + sobrenome) + 4 primeiros dígitos do CPF.</p>
              </div>

              {/* Empresa */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Empresa</label>
                <Input value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Empresa do colaborador" />
              </div>

              {/* Perfil */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Perfil de acesso *</label>
                <select value={perfil} onChange={e => setPerfil(e.target.value)}
                  className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                  {PERFIS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !selectedId} className="gap-1.5">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Cadastrando...</> : <><UserPlus className="w-3.5 h-3.5" />Cadastrar</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
