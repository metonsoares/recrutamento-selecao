'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STATUS_LABELS, STATUS_COLORS, CandidateStatus } from '@/types'
import { formatDate } from '@/lib/helpers'
import { Search, Eye, History } from 'lucide-react'

interface Props {
  candidates: Array<{
    id: string
    full_name: string
    phone: string | null
    email: string | null
    city: string | null
    created_at: string
    applications?: {
      id: string
      status: string
      final_score: number | null
      culture_score: number | null
      created_at: string
      jobs?: { title: string } | null
    } | null
  }>
  jobs: Array<{ id: string; title: string }>
}

const ALL_STATUSES = Object.keys(STATUS_LABELS) as CandidateStatus[]

export function CandidatesList({ candidates, jobs }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered = candidates.filter(c => {
    const app = c.applications
    const currentStatus = app?.status || ''
    const matchSearch = [c.full_name, c.phone, c.email, c.city]
      .join(' ').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || currentStatus === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Candidatos</h1>
          <p className="text-muted-foreground text-sm mt-1">{filtered.length} candidatos encontrados</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, telefone, e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {ALL_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Candidato</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Vaga</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Nota Final</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Cadastro</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const app = c.applications
              const status = (app?.status || 'novo') as CandidateStatus
              return (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{c.full_name}</p>
                      <p className="text-muted-foreground text-xs">{c.phone || c.email || '-'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    {(app?.jobs as { title?: string } | null)?.title || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`text-xs ${STATUS_COLORS[status]}`}>
                      {STATUS_LABELS[status] || status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {app?.final_score != null
                      ? <span className="font-medium">{app.final_score.toFixed(0)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                    {formatDate(c.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/candidatos/${c.id}`}>
                      <Button size="sm" variant="ghost" className="gap-1">
                        <Eye className="w-3 h-3" />
                        Ver
                      </Button>
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="text-center py-12 text-muted-foreground">
            <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Nenhum candidato encontrado</p>
          </div>
        )}
      </div>
    </div>
  )
}
