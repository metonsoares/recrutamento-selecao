'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { formatDate, formatName, contemBusca } from '@/lib/helpers'
import { FotoColaborador } from '@/components/admin/foto-colaborador'

interface Row {
  id: string
  full_name: string
  photoUrl: string | null
  empresa: string
  terminatedAt: string | null
}

interface Props { rows: Row[]; companyOptions: string[] }

export function DesligadosTable({ rows, companyOptions }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [empresa, setEmpresa] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = useMemo(() => {
    return rows
      .filter(r => !search.trim() || contemBusca(r.full_name, search))
      .filter(r => empresa === 'all' || r.empresa === empresa)
      .filter(r => {
        if (!from && !to) return true
        if (!r.terminatedAt) return false
        const d = r.terminatedAt.slice(0, 10)  // YYYY-MM-DD
        if (from && d < from) return false
        if (to && d > to) return false
        return true
      })
      .sort((a, b) => (b.terminatedAt || '').localeCompare(a.terminatedAt || ''))
  }, [rows, search, empresa, from, to])

  return (
    <div className="space-y-3">
      {/* Filtros */}
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
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">De</span>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-[150px]" />
          <span className="text-[11px] text-muted-foreground">até</span>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-[150px]" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} desligado{filtered.length !== 1 ? 's' : ''}
        {(search || empresa !== 'all' || from || to) ? ' encontrado' + (filtered.length !== 1 ? 's' : '') : ''}
      </p>

      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Nome</th>
              <th className="px-4 py-3 text-left font-medium">Empresa</th>
              <th className="px-4 py-3 text-left font-medium">Data de desligamento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer group"
                onClick={() => router.push(`/admin/candidatos/${c.id}`)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FotoColaborador url={c.photoUrl} nome={c.full_name} corFallback="bg-rose-100" corTexto="text-rose-700" />
                    <p className="font-medium text-gray-900 group-hover:text-rose-700 transition-colors">{formatName(c.full_name)}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {c.empresa ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">{c.empresa}</span>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-700">{c.terminatedAt ? formatDate(c.terminatedAt) : '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum desligado encontrado com os filtros aplicados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
