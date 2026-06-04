'use client'
import { useState, useMemo } from 'react'
import { ShieldCheck, Users, Activity, CalendarDays, Search, Clock, Globe } from 'lucide-react'
import { Input } from '@/components/ui/input'

export interface AuditLog {
  id: string
  user_id: string | null
  user_email: string | null
  action: string
  method: string | null
  path: string | null
  ip: string | null
  created_at: string
}

interface Props { logs: AuditLog[] }

function fmt(dt: string) {
  return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

export function AuditoriaManager({ logs }: Props) {
  const [userFilter, setUserFilter] = useState('all')
  const [search, setSearch] = useState('')

  const todayStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  const stats = useMemo(() => {
    const users = new Set<string>()
    let today = 0
    const perUser = new Map<string, { email: string; count: number; last: string }>()
    for (const l of logs) {
      const email = l.user_email || 'desconhecido'
      users.add(email)
      if (new Date(l.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) === todayStr) today++
      const cur = perUser.get(email)
      if (!cur) perUser.set(email, { email, count: 1, last: l.created_at })
      else { cur.count++; if (l.created_at > cur.last) cur.last = l.created_at }
    }
    const perUserArr = Array.from(perUser.values()).sort((a, b) => b.count - a.count)
    return { total: logs.length, users: users.size, today, perUserArr, max: perUserArr[0]?.count || 1 }
  }, [logs, todayStr])

  const userOptions = useMemo(() => Array.from(new Set(logs.map(l => l.user_email || 'desconhecido'))).sort(), [logs])

  const filtered = useMemo(() => logs.filter(l => {
    if (userFilter !== 'all' && (l.user_email || 'desconhecido') !== userFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return [l.action, l.user_email, l.ip, l.path].filter(Boolean).join(' ').toLowerCase().includes(q)
    }
    return true
  }).slice(0, 500), [logs, userFilter, search])

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-[#333]" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Auditoria</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Atividades executadas pelos usuários da plataforma</p>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4">
          <Activity className="w-4 h-4 text-muted-foreground mb-1" />
          <p className="text-[11px] uppercase text-muted-foreground">Eventos registrados</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <CalendarDays className="w-4 h-4 text-muted-foreground mb-1" />
          <p className="text-[11px] uppercase text-muted-foreground">Eventos hoje</p>
          <p className="text-2xl font-bold">{stats.today}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <Users className="w-4 h-4 text-muted-foreground mb-1" />
          <p className="text-[11px] uppercase text-muted-foreground">Usuários ativos</p>
          <p className="text-2xl font-bold">{stats.users}</p>
        </div>
      </div>

      {/* Utilização por usuário */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Utilização por usuário</h2>
        <div className="space-y-2.5">
          {stats.perUserArr.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>}
          {stats.perUserArr.map(u => (
            <div key={u.email}>
              <div className="flex items-center justify-between gap-2 mb-1 text-sm">
                <span className="text-gray-700 truncate">{u.email}</span>
                <span className="text-muted-foreground shrink-0">{u.count} ações · último: {fmt(u.last)}</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((u.count / stats.max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por ação, IP, tela..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
          className="h-9 border border-gray-300 rounded-md px-3 text-sm bg-white min-w-[200px]">
          <option value="all">Todos os usuários</option>
          {userOptions.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Tabela de atividades */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h2 className="text-sm font-bold text-gray-900">Atividades recentes ({filtered.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted-foreground uppercase border-b">
                <th className="text-left px-4 py-2 font-medium">Data / Hora</th>
                <th className="text-left px-4 py-2 font-medium">Usuário</th>
                <th className="text-left px-4 py-2 font-medium">Ação</th>
                <th className="text-left px-4 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-600"><span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-gray-400" />{fmt(l.created_at)}</span></td>
                  <td className="px-4 py-2 text-gray-800">{l.user_email || '—'}</td>
                  <td className="px-4 py-2 text-gray-800">{l.action}</td>
                  <td className="px-4 py-2 text-gray-500"><span className="inline-flex items-center gap-1"><Globe className="w-3 h-3 text-gray-400" />{l.ip || '—'}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhuma atividade encontrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
