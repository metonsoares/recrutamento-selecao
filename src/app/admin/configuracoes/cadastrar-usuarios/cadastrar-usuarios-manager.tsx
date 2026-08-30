'use client'
import { useState } from 'react'
import {
  UserPlus, Trash2, Loader2, X, CheckCircle2, AlertCircle, Users, KeyRound, Check,
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
  companyOptions: string[]
}

// O `value` precisa ser um Role de src/lib/permissions.ts. Era 'administrador',
// que NÃO está em ALL_ROLES: o usuário criado assim caía no fallback do
// normalizeRole e virava Master sem ninguém pedir.
const PERFIS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'gestor_rh', label: 'Gestor RH' },
  { value: 'operador', label: 'Operador' },
]
const PERFIL_LABEL: Record<string, string> = {
  admin: 'Administrador', gestor: 'Gestor', gestor_rh: 'Gestor RH', operador: 'Operador',
  // valor legado, para uma conta antiga não aparecer sem rótulo na lista
  administrador: 'Administrador',
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

export function CadastrarUsuariosManager({ systemUsers: initial, eligible, companyOptions }: Props) {
  const [users, setUsers] = useState<SystemUser[]>(initial)
  const [available, setAvailable] = useState<Eligible[]>(eligible)
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Redefinição de senha (modal)
  const [resetId, setResetId] = useState<string | null>(null)   // usuário sendo redefinido
  const [resetPwd, setResetPwd] = useState('')
  const [resetSaving, setResetSaving] = useState(false)
  const [resetDone, setResetDone] = useState<string | null>(null)  // nova senha revelada após sucesso

  // form
  const [empresa, setEmpresa] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [perfil, setPerfil] = useState('operador')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Colaboradores da empresa selecionada
  const funcionarios = available.filter(a => empresa ? a.empresa === empresa : false)

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

  function openModal() {
    setEmpresa(''); setSelectedId(''); setEmail(''); setCode(''); setPerfil('operador'); setError('')
    setModalOpen(true)
  }

  function handleCompany(name: string) {
    setEmpresa(name)
    setSelectedId(''); setEmail(''); setCode('')
  }

  function handleSelect(id: string) {
    setSelectedId(id)
    const e = available.find(a => a.id === id)
    if (e) {
      setEmail(e.email)
      setCode(genCode(e.full_name, e.cpf))
    }
  }

  async function handleSave() {
    setError('')
    if (!selectedId) { setError('Selecione um colaborador.'); return }
    if (!email.trim()) { setError('E-mail obrigatório (preencha no cadastro do colaborador).'); return }
    const sel = available.find(a => a.id === selectedId)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/system-users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: selectedId, full_name: sel?.full_name, email, password: '123456', code, empresa, perfil,
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

  function openReset(id: string) { setResetId(id); setResetPwd('123456'); setResetDone(null) }
  function closeReset() { setResetId(null); setResetPwd(''); setResetDone(null) }

  async function saveReset(u: SystemUser) {
    if (!resetPwd || resetPwd.length < 6) { showToast('err', 'Senha precisa ter ao menos 6 caracteres.'); return }
    setResetSaving(true)
    try {
      const res = await fetch(`/api/admin/system-users/${u.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPwd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResetDone(resetPwd)   // mostra a nova senha no modal
      showToast('ok', 'Senha redefinida.')
    } catch (e) {
      showToast('err', (e as Error).message || 'Erro ao redefinir senha.')
    } finally { setResetSaving(false) }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl space-y-6">
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
              <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Nome do usuário</th>
              <th className="px-4 py-3 text-left font-medium">E-mail</th>
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
                  <p className="font-medium text-gray-900 whitespace-nowrap">{u.name || '—'}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.email || '—'}</td>
                <td className="px-4 py-3"><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{u.code}</span></td>
                <td className="px-4 py-3 text-gray-700">{u.empresa || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    (u.perfil === 'admin' || u.perfil === 'administrador') ? 'bg-amber-100 text-amber-700' :
                    u.perfil === 'gestor' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>{PERFIL_LABEL[u.perfil] || u.perfil}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button onClick={() => openReset(u.id)} title="Redefinir senha"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors">
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(u)} disabled={deletingId === u.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Remover">
                      {deletingId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum usuário cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Redefinir senha */}
      {resetId && (() => {
        const u = users.find(x => x.id === resetId)
        if (!u) return null
        return (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><KeyRound className="w-4 h-4" />Redefinir senha</h2>
                <button onClick={closeReset} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <p className="text-sm text-gray-700 font-medium">{u.name || u.email}</p>
                {resetDone ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Nova senha (anote e repasse ao colaborador):</p>
                    <span className="font-mono text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded inline-block">{resetDone}</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Nova senha</label>
                    <Input value={resetPwd} onChange={e => setResetPwd(e.target.value)} autoFocus />
                    <p className="text-[11px] text-muted-foreground">Mínimo 6 caracteres. Padrão: 123456</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
                {resetDone ? (
                  <Button onClick={closeReset}>Fechar</Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={closeReset} disabled={resetSaving}>Cancelar</Button>
                    <Button onClick={() => saveReset(u)} disabled={resetSaving} className="gap-1.5">
                      {resetSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Check className="w-4 h-4" />Salvar</>}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal Adicionar */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-gray-900">Adicionar usuário</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Empresa (dropdown) — primeiro */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Empresa *</label>
                <select value={empresa} onChange={e => handleCompany(e.target.value)}
                  className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                  <option value="">Selecionar empresa...</option>
                  {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Nome completo (dropdown de colaboradores da empresa) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Nome completo *</label>
                <select value={selectedId} onChange={e => handleSelect(e.target.value)} disabled={!empresa}
                  className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white disabled:opacity-50">
                  <option value="">{empresa ? 'Selecionar colaborador...' : 'Selecione a empresa primeiro'}</option>
                  {funcionarios.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
                {empresa && funcionarios.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">Nenhum colaborador disponível nesta empresa.</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">E-mail *</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Buscado do colaborador" />
              </div>


              {/* Código */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Código</label>
                <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Ex: MS1076" className="font-mono" />
                <p className="text-[11px] text-muted-foreground">Iniciais (nome + sobrenome) + 4 primeiros dígitos do CPF.</p>
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
