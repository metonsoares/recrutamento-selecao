'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  UserPlus, Pencil, Trash2, Loader2, CheckCircle2,
  AlertCircle, X, Eye, EyeOff, ShieldCheck, User, Crown, UserCog,
} from 'lucide-react'
import { formatDate } from '@/lib/helpers'
import { ALL_ROLES, ROLE_LABELS, type Role } from '@/lib/permissions'

type UserRole = Role

const ROLE_DESC: Record<Role, string> = {
  master: 'Acesso total ao sistema',
  recrutador: 'Candidatos, agenda e resultados',
  rh: 'Recrutamento + fichas e colaboradores',
  gestor: 'Candidatos, agenda e resultados (gestão)',
  operador: 'Sem acesso ao painel',
}

interface AdminUser {
  id: string
  email: string
  name: string
  role: UserRole
  created_at: string
  last_sign_in: string | null
}

interface Props {
  users: AdminUser[]
  currentUserId: string
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ type, msg, onClose }: { type: 'ok' | 'err'; msg: string; onClose: () => void }) {
  return (
    <div className={[
      'fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg',
      'text-sm font-medium max-w-sm animate-in slide-in-from-bottom-2',
      type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
    ].join(' ')}>
      {type === 'ok'
        ? <CheckCircle2 className="w-4 h-4 shrink-0" />
        : <AlertCircle className="w-4 h-4 shrink-0" />}
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── PasswordInput ────────────────────────────────────────────────────────────
function PasswordInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-9"
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function UsuariosManager({ users: initial, currentUserId }: Props) {
  const [users, setUsers] = useState<AdminUser[]>(initial)
  const [modal, setModal] = useState<'create' | 'edit' | 'delete' | null>(null)
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  // form fields
  const [fName, setFName] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fPassword, setFPassword] = useState('')
  const [fRole, setFRole] = useState<UserRole>('recrutador')
  const [fError, setFError] = useState('')

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 5000)
  }

  function openCreate() {
    setFName(''); setFEmail(''); setFPassword(''); setFRole('recrutador'); setFError('')
    setSelected(null)
    setModal('create')
  }

  function openEdit(u: AdminUser) {
    setFName(u.name); setFEmail(u.email); setFPassword(''); setFRole(u.role); setFError('')
    setSelected(u)
    setModal('edit')
  }

  function openDelete(u: AdminUser) {
    setSelected(u)
    setModal('delete')
  }

  function closeModal() {
    setModal(null)
    setSelected(null)
    setSaving(false)
  }

  // ── Criar ──────────────────────────────────────────────────────────────────
  async function handleCreate() {
    setFError('')
    if (!fEmail.trim()) { setFError('E-mail é obrigatório.'); return }
    if (!fPassword.trim() || fPassword.length < 6) { setFError('Senha precisa ter ao menos 6 caracteres.'); return }
    setSaving(true)
    const res = await fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fName, email: fEmail, password: fPassword, role: fRole }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setFError(data.error || 'Erro ao criar usuário.'); return }
    setUsers(prev => [...prev, {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.full_name || '',
      role: (data.user.user_metadata?.role as UserRole) || 'recrutador',
      created_at: data.user.created_at,
      last_sign_in: data.user.last_sign_in_at || null,
    }])
    closeModal()
    showToast('ok', `Usuário ${data.user.email} criado com sucesso.`)
  }

  // ── Editar ─────────────────────────────────────────────────────────────────
  async function handleEdit() {
    if (!selected) return
    setFError('')
    if (!fEmail.trim()) { setFError('E-mail é obrigatório.'); return }
    if (fPassword && fPassword.length < 6) { setFError('Senha precisa ter ao menos 6 caracteres.'); return }
    setSaving(true)
    const res = await fetch(`/api/admin/usuarios/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fName, email: fEmail, password: fPassword || undefined, role: fRole }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setFError(data.error || 'Erro ao atualizar usuário.'); return }
    setUsers(prev => prev.map(u => u.id === selected.id ? {
      ...u,
      name: data.user.user_metadata?.full_name || fName,
      email: data.user.email || fEmail,
      role: (data.user.user_metadata?.role as UserRole) || fRole,
    } : u))
    closeModal()
    showToast('ok', 'Usuário atualizado com sucesso.')
  }

  // ── Excluir ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!selected) return
    setSaving(true)
    const res = await fetch(`/api/admin/usuarios/${selected.id}`, { method: 'DELETE' })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      showToast('err', data.error || 'Erro ao remover usuário.')
      closeModal(); return
    }
    setUsers(prev => prev.filter(u => u.id !== selected.id))
    closeModal()
    showToast('ok', `Usuário ${selected.email} removido.`)
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-6">

      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuários Admin</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {users.length} usuário{users.length !== 1 ? 's' : ''} com acesso ao painel
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5 shrink-0">
          <UserPlus className="w-4 h-4" />
          Novo usuário
        </Button>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        {users.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">Nenhum usuário encontrado.</p>
        )}
        {users.map((u, i) => {
          const isMe = u.id === currentUserId
          return (
            <div
              key={u.id}
              className={[
                'flex items-center gap-3 px-4 py-3.5',
                i < users.length - 1 ? 'border-b' : '',
              ].join(' ')}
            >
              {/* Avatar */}
              <div className={[
                'w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold',
                isMe ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-500',
              ].join(' ')}>
                {u.name ? u.name[0].toUpperCase() : u.email[0].toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-medium text-gray-900 truncate">
                    {u.name || '—'}
                  </p>
                  {u.role === 'master' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                      <Crown className="w-3 h-3" />
                      Master
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      <UserCog className="w-3 h-3" />
                      {ROLE_LABELS[u.role]}
                    </span>
                  )}
                  {isMe && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      <ShieldCheck className="w-3 h-3" />
                      Você
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-muted-foreground truncate">{u.email}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                  Criado em {formatDate(u.created_at)}
                  {u.last_sign_in && ` · Último acesso ${formatDate(u.last_sign_in)}`}
                </p>
              </div>

              {/* Ações */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEdit(u)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {!isMe && (
                  <button
                    onClick={() => openDelete(u)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Remover"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Modal: Criar ── */}
      {modal === 'create' && (
        <Modal title="Novo usuário" onClose={closeModal}>
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Nome</label>
              <Input value={fName} onChange={e => setFName(e.target.value)} placeholder="Nome completo" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">E-mail *</label>
              <Input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Senha *</label>
              <PasswordInput value={fPassword} onChange={setFPassword} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Perfil de acesso *</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_ROLES.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setFRole(r)}
                    className={[
                      'flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all',
                      fRole === r
                        ? r === 'master' ? 'border-amber-400 bg-amber-50' : 'border-emerald-400 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300',
                    ].join(' ')}
                  >
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                      {r === 'master'
                        ? <Crown className="w-3.5 h-3.5 text-amber-600" />
                        : <UserCog className="w-3.5 h-3.5 text-blue-600" />}
                      {ROLE_LABELS[r]}
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-tight">{ROLE_DESC[r]}</span>
                  </button>
                ))}
              </div>
            </div>
            {fError && (
              <p className="text-xs text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {fError}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
            <Button variant="outline" onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving} className="gap-1.5">
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Criando...</> : <><UserPlus className="w-3.5 h-3.5" />Criar usuário</>}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Editar ── */}
      {modal === 'edit' && selected && (
        <Modal title="Editar usuário" onClose={closeModal}>
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Nome</label>
              <Input value={fName} onChange={e => setFName(e.target.value)} placeholder="Nome completo" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">E-mail *</label>
              <Input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Nova senha <span className="text-muted-foreground font-normal">(deixe em branco para não alterar)</span>
              </label>
              <PasswordInput value={fPassword} onChange={setFPassword} placeholder="Nova senha (opcional)" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Perfil de acesso *</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_ROLES.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setFRole(r)}
                    className={[
                      'flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all',
                      fRole === r
                        ? r === 'master' ? 'border-amber-400 bg-amber-50' : 'border-emerald-400 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300',
                    ].join(' ')}
                  >
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                      {r === 'master'
                        ? <Crown className="w-3.5 h-3.5 text-amber-600" />
                        : <UserCog className="w-3.5 h-3.5 text-blue-600" />}
                      {ROLE_LABELS[r]}
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-tight">{ROLE_DESC[r]}</span>
                  </button>
                ))}
              </div>
            </div>
            {fError && (
              <p className="text-xs text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {fError}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
            <Button variant="outline" onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={saving} className="gap-1.5">
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : <><Pencil className="w-3.5 h-3.5" />Salvar alterações</>}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Excluir ── */}
      {modal === 'delete' && selected && (
        <Modal title="Remover usuário" onClose={closeModal}>
          <div className="px-5 py-5 space-y-3">
            <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-200">
              <User className="w-9 h-9 text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">{selected.name || selected.email}</p>
                <p className="text-xs text-muted-foreground">{selected.email}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Tem certeza que deseja remover este usuário? Esta ação é <strong>irreversível</strong> — o acesso será revogado imediatamente.
            </p>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
            <Button variant="outline" onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
              className="gap-1.5"
            >
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Removendo...</> : <><Trash2 className="w-3.5 h-3.5" />Remover usuário</>}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
