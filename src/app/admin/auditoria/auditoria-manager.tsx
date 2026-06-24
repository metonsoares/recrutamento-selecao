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

/**
 * Descrição detalhada da atividade, re-derivada de method+path.
 * Funciona também para logs antigos (não depende do texto já gravado).
 * Para navegação (páginas) mantém o rótulo amigável já salvo.
 */
function describeAction(l: AuditLog): string {
  const path = l.path || ''
  const method = (l.method || '').toUpperCase()
  if (!path.startsWith('/api')) return l.action || 'Atividade'

  const verb = method === 'POST' ? 'Criou' : method === 'DELETE' ? 'Removeu' : 'Atualizou'

  const rules: [RegExp, string][] = [
    [/\/applications\/[^/]+\/status/, 'Alterou o status da candidatura'],
    [/\/contratos\/[^/]+\/d4sign\/resend/, 'Reenviou o contrato para assinatura (D4Sign)'],
    [/\/contratos\/[^/]+\/d4sign\/download/, 'Baixou o contrato assinado'],
    [/\/contratos\/[^/]+\/upload-signed/, 'Anexou o contrato assinado manualmente'],
    [/\/contratos\/[^/]+\/d4sign/, 'Enviou o contrato para assinatura (D4Sign)'],
    [/\/contratos\/[^/]+\/prepare/, 'Preparou um contrato'],
    [/\/contratos\/[^/]+/, method === 'DELETE' ? 'Removeu um contrato' : 'Editou um contrato'],
    [/\/contratos\b/, 'Criou um contrato'],
    [/\/candidatos\/[^/]+\/status/, 'Alterou o status do candidato'],
    [/\/candidatos\/[^/]+\/background-check/, 'Executou Check de Processos (judicial)'],
    [/\/candidatos\/[^/]+\/auxilios-check/, 'Executou Check de Auxílios (Portal da Transparência)'],
    [/\/candidatos\/[^/]+\/desligar/, 'Desligou o colaborador'],
    [/\/candidatos\/[^/]+\/admission-docs/, 'Anexou/atualizou documento da ficha de admissão'],
    [/\/candidatos\/[^/]+\/(company-docs|company-files)/, 'Anexou/atualizou documento da empresa'],
    [/\/candidatos\/[^/]+\/notify-recruiter/, 'Notificou o recrutador via WhatsApp'],
    [/\/candidatos\/[^/]+\/warnings/, method === 'DELETE' ? 'Removeu uma advertência' : 'Registrou uma advertência'],
    [/\/candidatos\/[^/]+\/vacations/, method === 'DELETE' ? 'Removeu um registro de férias' : 'Registrou férias'],
    [/\/candidatos\/[^/]+\/(medical-certificates|atestados)/, method === 'DELETE' ? 'Removeu um atestado' : 'Registrou um atestado'],
    [/\/candidatos\/[^/]+\/(employee-files|recibos|payroll)/, 'Gerenciou arquivos do colaborador (recibos/contracheques)'],
    [/\/candidatos\/[^/]+\/(bank|dados-bancarios)/, 'Atualizou os dados bancários'],
    [/\/candidatos\/[^/]+\/climate-assignments/, 'Enviou/atualizou pesquisa de clima do colaborador'],
    [/\/candidatos\/[^/]+\/records/, 'Atualizou registros do colaborador'],
    [/\/candidatos\/[^/]+$/, method === 'DELETE' ? 'Excluiu o candidato' : 'Editou os dados do candidato (contato/CPF)'],
    [/\/doc-requests|\/solicitar/, 'Solicitou documento via WhatsApp'],
    [/\/ai\/analyze-candidate/, 'Rodou a análise de IA do candidato'],
    [/\/ai\/search-curriculos/, 'Buscou currículos com IA'],
    [/\/ai\/improve-text/, 'Ajustou um texto com IA'],
    [/\/ai\//, 'Alterou configuração de IA'],
    [/\/climate-surveys\/[^/]+\/responses\//, 'Removeu uma resposta de pesquisa de clima'],
    [/\/climate-surveys\/[^/]+/, method === 'DELETE' ? 'Removeu uma pesquisa de clima' : 'Editou uma pesquisa de clima'],
    [/\/climate-surveys/, 'Criou uma pesquisa de clima'],
    [/\/(interview-invite|invite-interview)/, 'Enviou convite de entrevista'],
    [/\/interviews\/locations/, 'Configurou locais de entrevista'],
    [/\/interviews\/interviewers/, 'Configurou entrevistadores'],
    [/\/interviews/, 'Atualizou agendamento de entrevista'],
    [/\/system-users\/[^/]+/, method === 'DELETE' ? 'Removeu um usuário' : method === 'PATCH' ? 'Redefiniu a senha de um usuário' : 'Editou um usuário'],
    [/\/system-users/, 'Cadastrou um usuário'],
    [/\/(jobs|vagas)/, verb === 'Criou' ? 'Criou uma vaga' : verb === 'Removeu' ? 'Removeu uma vaga' : 'Editou uma vaga'],
    [/\/integrations/, 'Configurou uma integração'],
    [/\/(templates|documentos-empresa)/, 'Gerenciou modelos/documentos da empresa'],
    [/\/zapi/, 'Alterou configuração de WhatsApp (Z-API)'],
    [/\/(companies|empresa)/, 'Atualizou dados/cultura da empresa'],
    [/\/kanban/, 'Configurou colunas do Kanban'],
    [/\/(form-questions|sections|secoes|formulario)/, 'Editou o formulário / seções'],
  ]
  for (const [re, label] of rules) if (re.test(path)) return label

  // Fallback: verbo + recurso (sem o prefixo e sem UUIDs)
  const resource = path.replace(/^\/api\/admin\//, '').replace(/\/[0-9a-f-]{36}/gi, '').replace(/\/+$/, '')
  return `${verb}: ${resource || path}`
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
      return [describeAction(l), l.user_email, l.ip, l.path].filter(Boolean).join(' ').toLowerCase().includes(q)
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
                  <td className="px-4 py-2 text-gray-800">{describeAction(l)}</td>
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
