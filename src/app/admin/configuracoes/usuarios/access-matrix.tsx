import { PERMISSION_MATRIX, ALL_ROLES, ROLE_LABELS, can } from '@/lib/permissions'
import { ShieldCheck } from 'lucide-react'

export function AccessMatrix() {
  let prevModule = ''
  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-[#333]" />
        <div>
          <h2 className="text-base font-bold text-gray-900">Acessos por perfil</h2>
          <p className="text-[12px] text-muted-foreground">Módulos e permissões de cada perfil de usuário</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-2 text-[11px] uppercase font-medium text-muted-foreground sticky left-0 bg-gray-50">Módulo</th>
              <th className="text-left px-4 py-2 text-[11px] uppercase font-medium text-muted-foreground">Ação</th>
              {ALL_ROLES.map(r => (
                <th key={r} className="px-3 py-2 text-[11px] uppercase font-medium text-muted-foreground text-center whitespace-nowrap">{ROLE_LABELS[r]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {PERMISSION_MATRIX.map((row, i) => {
              const showModule = row.module !== prevModule
              prevModule = row.module
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className={`px-4 py-2 sticky left-0 bg-white ${showModule ? 'font-semibold text-gray-800' : 'text-transparent'}`}>{showModule ? row.module : '·'}</td>
                  <td className="px-4 py-2 text-gray-700">{row.action}</td>
                  {ALL_ROLES.map(r => {
                    const ok = can(r, row.perm)
                    return (
                      <td key={r} className="px-3 py-2 text-center">
                        <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full text-[11px] font-bold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-300'}`}>
                          {ok ? '✓' : '–'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t bg-gray-50 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 mr-4"><span className="inline-flex w-4 h-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">✓</span> Tem acesso</span>
        <span className="inline-flex items-center gap-1"><span className="inline-flex w-4 h-4 items-center justify-center rounded-full bg-gray-100 text-gray-300 text-[10px] font-bold">–</span> Sem acesso</span>
      </div>
    </div>
  )
}
