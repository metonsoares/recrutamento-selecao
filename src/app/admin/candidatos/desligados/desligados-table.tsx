'use client'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/helpers'

interface Row {
  id: string
  full_name: string
  photoUrl: string | null
  empresa: string
  terminatedAt: string | null
}

export function DesligadosTable({ rows }: { rows: Row[] }) {
  const router = useRouter()
  return (
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
          {rows.map(c => (
            <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer group"
              onClick={() => router.push(`/admin/candidatos/${c.id}`)}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photoUrl} alt={c.full_name} className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-rose-700">{c.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                    </div>
                  )}
                  <p className="font-medium text-gray-900 group-hover:text-rose-700 transition-colors">{c.full_name}</p>
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
        </tbody>
      </table>
    </div>
  )
}
