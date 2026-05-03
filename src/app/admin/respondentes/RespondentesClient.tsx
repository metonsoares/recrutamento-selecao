'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

interface RespondentRow {
  id: string
  name: string
  role: string
  createdAt: string
  submittedAt: string | null
}

interface Props {
  respondents: RespondentRow[]
  roles: string[]
}

export default function RespondentesClient({ respondents, roles }: Props) {
  const [filterRole, setFilterRole] = useState('')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = respondents
    if (filterRole) list = list.filter((r) => r.role === filterRole)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.role.toLowerCase().includes(q)
      )
    }
    return list
  }, [respondents, filterRole, search])

  const submitted = filtered.filter((r) => r.submittedAt !== null).length

  return (
    <div className="space-y-4">
      {/* ─── Filtros ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-border p-4 shadow-sm flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou função..."
          className="flex-1 h-10 px-3 rounded-xl border border-border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="h-10 px-3 rounded-xl border border-border bg-white text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Todas as funções</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* ─── Contador ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground">
          {filtered.length} pessoa{filtered.length !== 1 ? 's' : ''}{' '}
          {filterRole || search ? 'encontrada' : 'registrada'}
          {filtered.length !== 1 ? 's' : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          {submitted} de {filtered.length} enviaram
        </p>
      </div>

      {/* ─── Lista ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        {filtered.length > 0 ? (
          <div className="divide-y divide-border">
            {filtered.map((r) => (
              <Link
                key={r.id}
                href={`/admin/respondentes/${r.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors group"
              >
                {/* Status */}
                <span
                  title={r.submittedAt ? 'Enviou a pesquisa' : 'Ainda não enviou'}
                  className={[
                    'flex-shrink-0 w-2 h-2 rounded-full',
                    r.submittedAt ? 'bg-green-500' : 'bg-muted-foreground/30',
                  ].join(' ')}
                />

                {/* Nome e função */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                    {r.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.role}</p>
                </div>

                {/* Data */}
                <div className="text-right flex-shrink-0 space-y-0.5">
                  {r.submittedAt ? (
                    <p className="text-xs text-green-600 font-medium">
                      Enviado{' '}
                      {new Date(r.submittedAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                      {' '}
                      {new Date(r.submittedAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Não enviou</p>
                  )}
                  <p className="text-xs text-muted-foreground/60">
                    Entrou{' '}
                    {new Date(r.createdAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <span className="text-muted-foreground/40 group-hover:text-primary/60 transition-colors text-sm">
                  →
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            {search || filterRole
              ? 'Nenhum resultado para este filtro.'
              : 'Nenhuma pessoa registrada ainda.'}
          </div>
        )}
      </div>
    </div>
  )
}
