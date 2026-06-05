import { PERMISSION_MATRIX, ALL_ROLES, ROLE_LABELS, can, type MatrixRow, type Role } from '@/lib/permissions'
import { ShieldCheck } from 'lucide-react'

type Level = 'none' | 'view' | 'edit_view' | 'add_edit_view' | 'edit_remove_view' | 'full'

const LEVEL_LABEL: Record<Level, string> = {
  none: '—',
  view: 'Visualizar',
  edit_view: 'Editar/Visualizar',
  add_edit_view: 'Adicionar/Editar/Visualizar',
  edit_remove_view: 'Editar/Remover/Visualizar',
  full: 'Adicionar/Editar/Remover/Visualizar',
}

const LEVEL_SHORT: Record<Level, string> = {
  none: '—',
  view: 'Visualizar',
  edit_view: 'Editar/Ver',
  add_edit_view: 'Adic./Editar/Ver',
  edit_remove_view: 'Editar/Rem./Ver',
  full: 'Total (A/E/R/V)',
}

const LEVEL_CLASS: Record<Level, string> = {
  none: 'bg-gray-100 text-gray-300',
  view: 'bg-slate-100 text-slate-600',
  edit_view: 'bg-blue-100 text-blue-700',
  add_edit_view: 'bg-indigo-100 text-indigo-700',
  edit_remove_view: 'bg-amber-100 text-amber-700',
  full: 'bg-emerald-100 text-emerald-700',
}

/** Deriva o nível de acesso a partir da ação descrita + se o perfil tem a permissão. */
function levelFor(row: MatrixRow, role: Role): Level {
  if (!can(role, row.perm)) return 'none'
  const a = row.action.toLowerCase()
  const add = /adicion|anexar|criar|lan[çc]ar|cadastr/.test(a)
  const remove = /excluir|remover/.test(a)
  const edit = /editar/.test(a)
  if (add && remove) return 'full'
  if (add && edit) return 'add_edit_view'
  if (edit && remove) return 'edit_remove_view'
  if (add) return 'add_edit_view'
  if (remove) return 'edit_remove_view'
  if (edit) return 'edit_view'
  return 'view'
}

export function AccessMatrix() {
  let prevModule = ''
  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-[#333]" />
        <div>
          <h2 className="text-base font-bold text-gray-900">Acessos por perfil</h2>
          <p className="text-[12px] text-muted-foreground">Nível de acesso de cada perfil em cada módulo</p>
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
                  <td className={`px-4 py-2 sticky left-0 bg-white whitespace-nowrap ${showModule ? 'font-semibold text-gray-800' : 'text-transparent'}`}>{showModule ? row.module : '·'}</td>
                  <td className="px-4 py-2 text-gray-700">{row.action}</td>
                  {ALL_ROLES.map(r => {
                    const lvl = levelFor(row, r)
                    return (
                      <td key={r} className="px-3 py-2 text-center">
                        <span title={LEVEL_LABEL[lvl]} className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${LEVEL_CLASS[lvl]}`}>
                          {LEVEL_SHORT[lvl]}
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
      <div className="px-5 py-3 border-t bg-gray-50 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-gray-600">Níveis:</span>
        {(['full', 'edit_remove_view', 'add_edit_view', 'edit_view', 'view', 'none'] as Level[]).map(l => (
          <span key={l} className="inline-flex items-center gap-1">
            <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${LEVEL_CLASS[l]}`}>{LEVEL_SHORT[l]}</span>
            <span>{l === 'none' ? 'Sem acesso' : LEVEL_LABEL[l]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
