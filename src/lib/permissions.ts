// ─── Controle de acesso por perfil (RBAC) ──────────────────────────────────────
// Fonte da verdade das permissões, conforme a Matriz de Acessos.

export type Role = 'master' | 'recrutador' | 'rh' | 'gestor' | 'operador'

export const ROLE_LABELS: Record<Role, string> = {
  master: 'Master',
  recrutador: 'Recrutador',
  rh: 'RH',
  gestor: 'Gestor',
  operador: 'Operador',
}

export const ALL_ROLES: Role[] = ['master', 'recrutador', 'rh', 'gestor', 'operador']

export type Permission =
  | 'dashboard.ver'
  | 'candidatos.ver' | 'candidatos.status' | 'candidatos.editar_vaga'
  | 'ficha.admissao' | 'ficha.contrato' | 'ficha.documentos' | 'ficha.bancarios'
  | 'ficha.ferias' | 'ficha.advertencias' | 'ficha.atestados' | 'ficha.contracheques'
  | 'ficha.folhas' | 'ficha.asos' | 'ficha.clima' | 'ficha.clima_remover' | 'ficha.registros'
  | 'acao.analise_ia' | 'acao.teste_cultural' | 'acao.check_processos' | 'acao.convidar'
  | 'acao.exportar_pdf' | 'acao.desligar' | 'acao.excluir_candidato'
  | 'agenda.ver' | 'agenda.config_locais' | 'agenda.config_entrevistadores' | 'agenda.remover_agendamento'
  | 'curriculos.secoes' | 'curriculos.vagas' | 'curriculos.teste_cultural'
  | 'colaboradores.ver'
  | 'pesquisas.cadastrar' | 'pesquisas.resultados' | 'pesquisas.remover_resposta'
  | 'documentos_empresa'
  | 'whatsapp.ver' | 'whatsapp.excluir'
  | 'relatorios.ver'
  | 'config.whatsapp' | 'config.ia' | 'config.empresa_cadastro' | 'config.empresa_cultura'
  | 'config.usuarios_perfil' | 'config.usuarios_cadastro' | 'config.kanban'
  | 'auditoria.ver'

// Permissões por perfil (Master tem tudo, tratado em can()).
const RECRUTADOR: Permission[] = [
  'dashboard.ver', 'candidatos.ver', 'candidatos.status',
  'acao.analise_ia', 'acao.teste_cultural', 'acao.convidar', 'acao.exportar_pdf',
  'agenda.ver', 'agenda.config_entrevistadores', 'agenda.remover_agendamento',
  'pesquisas.resultados', 'whatsapp.ver',
]

const RH: Permission[] = [
  'dashboard.ver', 'candidatos.ver', 'candidatos.status', 'candidatos.editar_vaga',
  'ficha.admissao', 'ficha.contrato', 'ficha.documentos', 'ficha.bancarios', 'ficha.ferias',
  'ficha.advertencias', 'ficha.atestados', 'ficha.contracheques', 'ficha.folhas', 'ficha.asos', 'ficha.clima',
  'acao.analise_ia', 'acao.teste_cultural', 'acao.convidar', 'acao.exportar_pdf', 'acao.desligar',
  'agenda.ver', 'agenda.config_entrevistadores', 'agenda.remover_agendamento',
  'curriculos.vagas', 'colaboradores.ver', 'pesquisas.resultados', 'documentos_empresa', 'whatsapp.ver',
]

const GESTOR: Permission[] = [
  'dashboard.ver', 'candidatos.ver', 'candidatos.status',
  'acao.analise_ia', 'acao.teste_cultural', 'acao.convidar', 'acao.exportar_pdf',
  'agenda.ver', 'agenda.remover_agendamento', 'pesquisas.resultados', 'whatsapp.ver',
]

const ROLE_PERMISSIONS: Record<Exclude<Role, 'master'>, Set<Permission>> = {
  recrutador: new Set(RECRUTADOR),
  rh: new Set(RH),
  gestor: new Set(GESTOR),
  operador: new Set(),
}

/** Normaliza o valor de role vindo do user_metadata. */
export function normalizeRole(raw: string | null | undefined): Role {
  if (raw && (ALL_ROLES as string[]).includes(raw)) return raw as Role
  // Usuários antigos sem role definido são considerados Master.
  return 'master'
}

/** Verifica se um perfil tem determinada permissão. */
export function can(role: Role, perm: Permission): boolean {
  if (role === 'master') return true
  return ROLE_PERMISSIONS[role]?.has(perm) ?? false
}

/** True se o perfil tem QUALQUER uma das permissões. */
export function canAny(role: Role, perms: Permission[]): boolean {
  return perms.some(p => can(role, p))
}
