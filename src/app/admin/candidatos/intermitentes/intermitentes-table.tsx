'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CheckCircle2, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface Row {
  id: string
  full_name: string
  photoUrl: string | null
  cargo: string
  phone: string | null
  email: string | null
  empresa: string
  pendencia: 'ok' | 'pendente'
}

interface Props { rows: Row[]; companyOptions: string[] }

export function IntermitentesTable({ rows, companyOptions }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [empresa, setEmpresa] = useState('all')

  const filtered = useMemo(() => rows
    .filter(r => !search.trim() || r.full_name.toLowerCase().includes(search.toLowerCase()))
    .filter(r => empresa === 'all' || r.empresa === empresa)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR')),
    [rows, search, empresa])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={empresa} onChange={e => setEmpresa(e.target.value)}
          className="h-9 border border-gray-300 rounded-md px-3 text-sm bg-white min-w-[180px]">
          <option value="all">Todas as empresas</option>
          {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Nome</th>
              <th className="px-4 py-3 text-left font-medium">Cargo</th>
              <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Contato</th>
              <th className="px-4 py-3 text-left font-medium">Empresa</th>
              <th className="px-4 py-3 text-center font-medium">Pendências</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer group"
                onClick={() => router.push(`/admin/candidatos/${c.id}`)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {c.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.photoUrl} alt={c.full_name} className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-emerald-700">{c.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                      </div>
                    )}
                    <p className="font-medium text-gray-900 group-hover:text-emerald-700 transition-colors">{c.full_name}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{c.cargo}</span>
                </td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                  <p>{c.phone || '—'}</p>
                  {c.email && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{c.email}</p>}
                </td>
                <td className="px-4 py-3">
                  {c.empresa ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">{c.empresa}</span>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {c.pendencia === 'ok' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3" />Ok</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><AlertCircle className="w-3 h-3" />Pendente</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum intermitente encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
