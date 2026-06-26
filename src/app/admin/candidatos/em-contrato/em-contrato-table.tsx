'use client'
import { useRouter } from 'next/navigation'
import { formatDate, formatName } from '@/lib/helpers'

interface Row {
  id: string
  full_name: string
  photoUrl: string | null
  empresa: string
  startDate: string | null
  endDate: string | null
  diasRestantes: number | null  // null se sem término
}

interface Props { rows: Row[] }

function prazoLabel(dias: number | null): { text: string; tone: string } {
  if (dias === null) return { text: '—', tone: 'text-gray-400' }
  if (dias < 0) return { text: `Encerrado há ${Math.abs(dias)} dia${Math.abs(dias) !== 1 ? 's' : ''}`, tone: 'text-red-600' }
  if (dias === 0) return { text: 'Termina hoje', tone: 'text-amber-600 font-semibold' }
  if (dias <= 5) return { text: `Faltam ${dias} dia${dias !== 1 ? 's' : ''}`, tone: 'text-amber-600 font-semibold' }
  return { text: `Faltam ${dias} dias`, tone: 'text-emerald-700' }
}

export function EmContratoTable({ rows }: Props) {
  const router = useRouter()

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
            <th className="px-4 py-3 text-left font-medium">Nome</th>
            <th className="px-4 py-3 text-left font-medium">Empresa</th>
            <th className="px-4 py-3 text-left font-medium">Início do contrato</th>
            <th className="px-4 py-3 text-left font-medium">Término do contrato</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(c => {
            const prazo = prazoLabel(c.diasRestantes)
            return (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer group"
                onClick={() => router.push(`/admin/candidatos/${c.id}?tab=contrato`)}>
                {/* Nome + foto */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {c.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.photoUrl} alt={c.full_name} className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-teal-700">{c.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                      </div>
                    )}
                    <p className="font-medium text-gray-900 group-hover:text-teal-700 transition-colors">{formatName(c.full_name)}</p>
                  </div>
                </td>
                {/* Empresa */}
                <td className="px-4 py-3">
                  {c.empresa ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">{c.empresa}</span>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </td>
                {/* Início */}
                <td className="px-4 py-3 text-gray-700">{c.startDate ? formatDate(c.startDate) : '—'}</td>
                {/* Término + prazo */}
                <td className="px-4 py-3">
                  <p className="text-gray-700">{c.endDate ? formatDate(c.endDate) : '—'}</p>
                  <p className={`text-xs ${prazo.tone}`}>{prazo.text}</p>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
