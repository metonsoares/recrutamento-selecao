'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, Search } from 'lucide-react'
import { formatDate } from '@/lib/helpers'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ContratadoRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  city: string | null
  created_at: string
  appId: string | null
  appStatus: string | null
  finalScore: number | null
  jobTitle: string
  companyName: string | null
  photoUrl: string | null
}

interface Props {
  rows: ContratadoRow[]
  companyOptions: string[]
}

function scoreColor(v: number | null) {
  if (v == null) return 'text-gray-400'
  if (v >= 70) return 'text-emerald-600'
  if (v >= 50) return 'text-amber-600'
  return 'text-red-500'
}

export function ContratadosTable({ rows, companyOptions }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')

  const filtered = useMemo(() => {
    return rows
      .filter(r => {
        if (!search.trim()) return true
        return r.full_name.toLowerCase().includes(search.toLowerCase())
      })
      .filter(r => {
        if (companyFilter === 'all') return true
        return r.companyName === companyFilter
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
  }, [rows, search, companyFilter])

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={companyFilter} onValueChange={v => v && setCompanyFilter(v)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {companyOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Contador */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} contratado{filtered.length !== 1 ? 's' : ''}
        {(search || companyFilter !== 'all') ? ' encontrado' + (filtered.length !== 1 ? 's' : '') : ''}
      </p>

      {/* Tabela */}
      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Nome</th>
              <th className="px-4 py-3 text-left font-medium">Empresa</th>
              <th className="px-4 py-3 text-left font-medium">Cargo</th>
              <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Contato</th>
              <th className="px-4 py-3 text-center font-medium hidden sm:table-cell">Nota</th>
              <th className="px-4 py-3 text-center font-medium">Ações</th>
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
                      <img src={c.photoUrl} alt={c.full_name}
                        className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-emerald-700">{c.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                      </div>
                    )}
                    <p className="font-medium text-gray-900 group-hover:text-emerald-700 transition-colors">{c.full_name}</p>
                  </div>
                </td>

                {/* Empresa */}
                <td className="px-4 py-3">
                  {c.companyName ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                      {c.companyName}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>

                {/* Cargo (vaga) */}
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {c.jobTitle}
                  </span>
                </td>

                {/* Contato */}
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                  <p>{c.phone || '—'}</p>
                  {c.email && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{c.email}</p>}
                </td>

                {/* Nota */}
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  {c.finalScore != null
                    ? <span className={`text-base font-bold ${scoreColor(c.finalScore)}`}>{Math.round(c.finalScore)}%</span>
                    : <span className="text-xs text-gray-300">—</span>}
                </td>

                {/* Ações */}
                <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                  <Link
                    href={`/admin/candidatos/${c.id}/ficha-admissao`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors whitespace-nowrap"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Ficha Admissão
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhum contratado encontrado com os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
