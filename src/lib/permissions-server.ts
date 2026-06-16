import { cache } from 'react'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import {
  ALL_ROLES, PERMISSION_MATRIX, MASTER_ONLY_PERMS, defaultLevel, levelGrants,
  type Role, type Permission, type Level,
} from '@/lib/permissions'

const ALL_PERMS = PERMISSION_MATRIX.map(r => r.perm)

function applyHardRules(role: Role, perm: Permission, level: Level): Level {
  if (MASTER_ONLY_PERMS.includes(perm)) return role === 'master' ? 'full' : 'none'
  return level
}

/**
 * Mapa nível por permissão para um perfil (DB sobre padrão).
 * Memoizado por request (React cache): layout + requirePermission + a página
 * pedem a mesma coisa — assim consulta role_permissions uma única vez.
 */
export const getLevelsForRole = cache(async (role: Role): Promise<Record<Permission, Level>> => {
  const supabase = await createSupabaseServiceClient()
  const { data } = await supabase.from('role_permissions').select('perm, level').eq('role', role)
  const db = new Map<string, Level>((data || []).map(r => [r.perm as string, r.level as Level]))
  const out = {} as Record<Permission, Level>
  for (const perm of ALL_PERMS) {
    const lvl = (db.get(perm) ?? defaultLevel(role, perm)) as Level
    out[perm] = applyHardRules(role, perm, lvl)
  }
  return out
})

/** Conjunto de permissões concedidas (nível != none) para um perfil. */
export async function getGrantedPerms(role: Role): Promise<Set<Permission>> {
  const levels = await getLevelsForRole(role)
  return new Set(ALL_PERMS.filter(p => levelGrants(levels[p])))
}

/** Mapa completo (todos os perfis) — para o editor. */
export async function getAllLevels(): Promise<Record<Role, Record<Permission, Level>>> {
  const supabase = await createSupabaseServiceClient()
  const { data } = await supabase.from('role_permissions').select('role, perm, level')
  const db = new Map<string, Level>((data || []).map(r => [`${r.role}::${r.perm}`, r.level as Level]))
  const out = {} as Record<Role, Record<Permission, Level>>
  for (const role of ALL_ROLES) {
    out[role] = {} as Record<Permission, Level>
    for (const perm of ALL_PERMS) {
      const lvl = (db.get(`${role}::${perm}`) ?? defaultLevel(role, perm)) as Level
      out[role][perm] = applyHardRules(role, perm, lvl)
    }
  }
  return out
}
