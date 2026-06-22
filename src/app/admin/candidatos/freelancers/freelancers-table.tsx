'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { formatDate } from '@/lib/helpers'

interface FreelancerRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  city: string | null
  created_at: string
  appId: string | null
  finalScore: number | null
  jobTitle: string
  photoUrl: string | null
}

interface Props {
  rows: FreelancerRow[]
}

function scoreColor(v: number | null) {
  if (v == null) return 'text-gray-400'
  if (v >= 70) return 'text-emerald-600'
  if (v >= 50) return 'text-amber-600'
  return 'text-red-500'
}

/** Remove acentos e normaliza para busca tolerante (Márcia → marcia). */
const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

export function FreelancersTable({ rows }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return rows
    return rows.filter(c => normalize(c.full_name || '').includes(q))
  }, [rows, query])

  return (
    <div className="space-y-3">
      {/* Busca por nome */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por nome..."
          className="w-full h-10 pl-9 pr-9 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Limpar busca"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
            <th className="px-4 py-3 text-left font-medium">Candidato</th>
            <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Vaga</th>
            <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Contato</th>
            <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Cidade</th>
            <th className="px-4 py-3 text-center font-medium">Nota Final</th>
            <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Cadastro</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.map(c => (
            <tr
              key={c.id}
              className="hover:bg-gray-50 transition-colors cursor-pointer group"
              onClick={() => router.push(`/admin/candidatos/${c.id}`)}
            >
              {/* Nome + foto */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.photoUrl}
                      alt={c.full_name}
                      className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-sky-700">
                        {c.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate group-hover:text-sky-700 transition-colors">
                      {c.full_name}
                    </p>
                    <p className="text-xs text-muted-foreground sm:hidden">
                      {c.jobTitle}
                    </p>
                  </div>
                </div>
              </td>

              {/* Vaga */}
              <td className="px-4 py-3 hidden sm:table-cell">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
                  {c.jobTitle}
                </span>
              </td>

              {/* Contato */}
              <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                <div>
                  <p>{c.phone || '—'}</p>
                  {c.email && (
                    <p className="text-xs text-muted-foreground truncate max-w-[160px]">{c.email}</p>
                  )}
                </div>
              </td>

              {/* Cidade */}
              <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                {c.city || '—'}
              </td>

              {/* Nota final */}
              <td className="px-4 py-3 text-center">
                {c.finalScore != null ? (
                  <span className={`text-base font-bold ${scoreColor(c.finalScore)}`}>
                    {Math.round(c.finalScore)}%
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </td>

              {/* Cadastro */}
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell text-xs">
                {formatDate(c.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filtered.length === 0 && (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhum freelancer encontrado para &ldquo;{query}&rdquo;.
        </div>
      )}
      </div>
    </div>
  )
}
