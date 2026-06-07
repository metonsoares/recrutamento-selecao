'use client'
import { useState } from 'react'
import { Loader2, ShieldCheck, Save, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PERMISSION_MATRIX, ALL_ROLES, ROLE_LABELS, LEVELS, LEVEL_LABEL, LEVEL_SHORT, MASTER_ONLY_PERMS,
  type Role, type Permission, type Level,
} from '@/lib/permissions'

const LEVEL_CLASS: Record<Level, string> = {
  none: 'bg-gray-100 text-gray-400 border-gray-200',
  view: 'bg-slate-100 text-slate-600 border-slate-200',
  edit_view: 'bg-blue-100 text-blue-700 border-blue-200',
  add_edit_view: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  edit_remove_view: 'bg-amber-100 text-amber-700 border-amber-200',
  full: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

type LevelsMap = Record<Role, Record<Permission, Level>>

export function AccessMatrix({ initialLevels }: { initialLevels: LevelsMap }) {
  const [levels, setLevels] = useState<LevelsMap>(initialLevels)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  let prevModule = ''

  function setCell(role: Role, perm: Permission, level: Level) {
    setLevels(prev => ({ ...prev, [role]: { ...prev[role], [perm]: level } }))
  }

  async function save() {
    setSaving(true); setToast(null)
    try {
      const res = await fetch('/api/admin/role-permissions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ levels }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { setToast({ ok: false, msg: d.error || 'Erro ao salvar.' }); return }
      setToast({ ok: true, msg: 'Permissões salvas! As alterações valem no próximo carregamento das telas.' })
    } finally { setSaving(false); setTimeout(() => setToast(null), 6000) }
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{toast.msg}
        </div>
      )}
      <div className="px-5 py-4 border-b flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-[#333]" />
        <div className="flex-1">
          <h2 className="text-base font-bold text-gray-900">Acessos por perfil</h2>
          <p className="text-[12px] text-muted-foreground">Defina o nível de acesso de cada perfil em cada módulo</p>
        </div>
        <Button onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />Salvar</>}
        </Button>
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
              const locked = (MASTER_ONLY_PERMS as string[]).includes(row.perm)
              return (
                <tr key={i} className="hover:bg-gray-50/60">
                  <td className={`px-4 py-1.5 sticky left-0 bg-white whitespace-nowrap ${showModule ? 'font-semibold text-gray-800' : 'text-transparent'}`}>{showModule ? row.module : '·'}</td>
                  <td className="px-4 py-1.5 text-gray-700">{row.action}{locked && <span className="ml-1 text-[10px] text-amber-600">(só Master)</span>}</td>
                  {ALL_ROLES.map(r => {
                    const lvl = levels[r][row.perm]
                    return (
                      <td key={r} className="px-2 py-1.5 text-center">
                        <select
                          value={lvl}
                          disabled={locked}
                          onChange={e => setCell(r, row.perm, e.target.value as Level)}
                          title={LEVEL_LABEL[lvl]}
                          className={`text-[11px] rounded-md border px-1.5 py-1 disabled:opacity-60 disabled:cursor-not-allowed ${LEVEL_CLASS[lvl]}`}
                        >
                          {LEVELS.map(l => <option key={l} value={l}>{LEVEL_SHORT[l]}</option>)}
                        </select>
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
        {LEVELS.map(l => (
          <span key={l} className="inline-flex items-center gap-1">
            <span className={`inline-block px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${LEVEL_CLASS[l]}`}>{LEVEL_SHORT[l]}</span>
            <span>{l === 'none' ? 'Sem acesso' : LEVEL_LABEL[l]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
