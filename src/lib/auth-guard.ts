import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { Role, Permission } from '@/lib/permissions'
import { getGrantedPerms } from '@/lib/permissions-server'
import { getEffectiveRole } from '@/lib/portal-perfil'

/**
 * Guard para rotas de API: retorna uma NextResponse de erro se o usuário não for
 * master (401 sem sessão, 403 sem perfil master), ou `null` se estiver autorizado.
 * Uso: `const denied = await requireMasterApi(); if (denied) return denied`
 */
export async function requireMasterApi(): Promise<NextResponse | null> {
  const { user, role } = await getEffectiveRole()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  if (role !== 'master') {
    return NextResponse.json({ error: 'Acesso restrito ao administrador master.' }, { status: 403 })
  }
  return null
}

/**
 * Guard para rotas de API por PERMISSÃO (não só master).
 * Retorna NextResponse de erro (401/403) ou `null` se autorizado.
 */
export async function requirePermissionApi(perm: Permission): Promise<NextResponse | null> {
  const { user, role } = await getEffectiveRole()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const granted = await getGrantedPerms(role)
  if (!granted.has(perm)) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }
  return null
}

/** Retorna o perfil do usuário logado (ou redireciona para login). */
export async function getUserRole(): Promise<Role> {
  const { user, role } = await getEffectiveRole()
  if (!user) redirect('/login')
  return role
}

/** Garante que o usuário tenha a permissão (conforme banco); senão redireciona. */
export async function requirePermission(perm: Permission): Promise<Role> {
  const role = await getUserRole()
  const granted = await getGrantedPerms(role)
  if (!granted.has(perm)) redirect('/admin')
  return role
}

/**
 * Guard de PÁGINA por lista de perfis. Usado onde o acesso não é de uma
 * permissão só: a Folha de pagamento é do Master, mas o Gestor RH entra em
 * parte dela (Vale transporte, Faltas e Mensalidade sindical).
 */
export async function requireAnyRole(roles: Role[]): Promise<Role> {
  const role = await getUserRole()
  if (!roles.includes(role)) redirect('/admin')
  return role
}

/** Mesma regra acima, para rotas de API (401/403 em vez de redirect). */
export async function requireAnyRoleApi(roles: Role[]): Promise<NextResponse | null> {
  const { user, role } = await getEffectiveRole()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  if (!roles.includes(role)) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }
  return null
}

/** Garante que o usuário é master; senão redireciona. */
export async function requireMaster(): Promise<Role> {
  const role = await getUserRole()
  if (role !== 'master') redirect('/admin')
  return role
}
