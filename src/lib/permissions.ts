// ─── Controle de acesso por perfil (RBAC) ──────────────────────────────────────
// Fonte da verdade das permissões, conforme a Matriz de Acessos.

// Perfis do Portal BDT (mesmo nome de perfil em todos os apps) + Master (super-admin).
export type Role = 'master' | 'admin' | 'gestor' | 'operador' | 'externo' | 'visualizador'

export const ROLE_LABELS: Record<Role, string> = {
  master: 'Master',
  admin: 'Administrador',
  gestor: 'Gestor',
  operador: 'Operador',
  externo: 'Usuário Externo',
  visualizador: 'Visualizador',
}

export const ALL_ROLES: Role[] = ['master', 'admin', 'gestor', 'operador', 'externo', 'visualizador']

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

// Permissões padrão por perfil. Master e Administrador têm tudo (tratado em can()/defaultLevel);
// Visualizador = somente leitura e Externo = sem painel (tratados em defaultLevel).
const GESTOR: Permission[] = [
  'dashboard.ver', 'candidatos.ver', 'candidatos.status',
  'acao.analise_ia', 'acao.teste_cultural', 'acao.convidar', 'acao.exportar_pdf',
  'agenda.ver', 'agenda.remover_agendamento', 'pesquisas.resultados', 'whatsapp.ver',
]

const ROLE_PERMISSIONS: Record<Exclude<Role, 'master' | 'admin'>, Set<Permission>> = {
  gestor: new Set(GESTOR),
  operador: new Set(),
  externo: new Set(),
  visualizador: new Set(),
}

/** Normaliza o valor de role vindo do user_metadata. */
export function normalizeRole(raw: string | null | undefined): Role {
  if (raw && (ALL_ROLES as string[]).includes(raw)) return raw as Role
  // Usuários antigos sem role definido são considerados Master.
  return 'master'
}

/**
 * Lê o perfil de acesso do user_metadata priorizando `perfil` (provisionado pelo
 * Portal BDT via SSO) sobre `role` (contas locais antigas). Mesmo nome de perfil.
 */
export function roleFromMetadata(meta: Record<string, unknown> | null | undefined): Role {
  const raw = (meta?.perfil ?? meta?.role) as string | null | undefined
  return normalizeRole(raw)
}

/**
 * Converte o "perfil" da tela Cadastrar Usuários (administrador/gestor/operador)
 * no role de acesso (RBAC). Mantém o acesso coerente com o que foi cadastrado —
 * um operador NÃO deve herdar acesso Master.
 */
export function perfilToRole(perfil: string | null | undefined): Role {
  switch (perfil) {
    case 'administrador':
    case 'admin': return 'admin'
    case 'gestor': return 'gestor'
    case 'operador': return 'operador'
    case 'externo': return 'externo'
    case 'visualizador': return 'visualizador'
    default: return 'operador'
  }
}

/** Verifica se um perfil tem determinada permissão. */
export function can(role: Role, perm: Permission): boolean {
  if (role === 'master' || role === 'admin') return true
  return ROLE_PERMISSIONS[role]?.has(perm) ?? false
}

/** True se o perfil tem QUALQUER uma das permissões. */
export function canAny(role: Role, perms: Permission[]): boolean {
  return perms.some(p => can(role, p))
}

// ─── Níveis de acesso (CRUD) ────────────────────────────────────────────────────
export type Level = 'none' | 'view' | 'edit_view' | 'add_edit_view' | 'edit_remove_view' | 'full'
export const LEVELS: Level[] = ['full', 'edit_remove_view', 'add_edit_view', 'edit_view', 'view', 'none']

export const LEVEL_LABEL: Record<Level, string> = {
  none: 'Sem acesso',
  view: 'Visualizar',
  edit_view: 'Editar/Visualizar',
  add_edit_view: 'Adicionar/Editar/Visualizar',
  edit_remove_view: 'Editar/Remover/Visualizar',
  full: 'Adicionar/Editar/Remover/Visualizar',
}
export const LEVEL_SHORT: Record<Level, string> = {
  none: '—',
  view: 'Visualizar',
  edit_view: 'Editar/Ver',
  add_edit_view: 'Adic./Editar/Ver',
  edit_remove_view: 'Editar/Rem./Ver',
  full: 'Total (A/E/R/V)',
}

export function levelGrants(level: Level): boolean { return level !== 'none' }

/** Nível "natural" a partir da descrição da ação (quando concedida). */
export function naturalLevel(action: string): Level {
  const a = action.toLowerCase()
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

// ─── Matriz para exibição (módulos × ações) ─────────────────────────────────────
export interface MatrixRow { module: string; action: string; perm: Permission }

export const PERMISSION_MATRIX: MatrixRow[] = [
  { module: 'Dashboard', action: 'Ver indicadores gerais', perm: 'dashboard.ver' },

  { module: 'Currículos', action: 'Candidatos — ver lista/quadro, buscar', perm: 'candidatos.ver' },
  { module: 'Currículos', action: 'Candidatos — mudar status', perm: 'candidatos.status' },
  { module: 'Currículos', action: 'Candidatos — editar vaga', perm: 'candidatos.editar_vaga' },
  { module: 'Currículos', action: 'Ficha — Ficha de Admissão', perm: 'ficha.admissao' },
  { module: 'Currículos', action: 'Ficha — Dados para contrato', perm: 'ficha.contrato' },
  { module: 'Currículos', action: 'Ficha — Documentos', perm: 'ficha.documentos' },
  { module: 'Currículos', action: 'Ficha — Dados Bancários', perm: 'ficha.bancarios' },
  { module: 'Currículos', action: 'Ficha — Férias', perm: 'ficha.ferias' },
  { module: 'Currículos', action: 'Ficha — Advertências', perm: 'ficha.advertencias' },
  { module: 'Currículos', action: 'Ficha — Atestados', perm: 'ficha.atestados' },
  { module: 'Currículos', action: 'Ficha — Contracheques', perm: 'ficha.contracheques' },
  { module: 'Currículos', action: 'Ficha — Folhas de ponto', perm: 'ficha.folhas' },
  { module: 'Currículos', action: 'Ficha — ASOs', perm: 'ficha.asos' },
  { module: 'Currículos', action: 'Ficha — Pesquisas de clima (adicionar)', perm: 'ficha.clima' },
  { module: 'Currículos', action: 'Ficha — Pesquisas de clima (remover)', perm: 'ficha.clima_remover' },
  { module: 'Currículos', action: 'Ficha — Registros', perm: 'ficha.registros' },
  { module: 'Currículos', action: 'Ação — Analisar IA', perm: 'acao.analise_ia' },
  { module: 'Currículos', action: 'Ação — Visualizar Teste Cultural', perm: 'acao.teste_cultural' },
  { module: 'Currículos', action: 'Ação — Check Processos', perm: 'acao.check_processos' },
  { module: 'Currículos', action: 'Ação — Convidar para entrevista', perm: 'acao.convidar' },
  { module: 'Currículos', action: 'Ação — Exportar PDF', perm: 'acao.exportar_pdf' },
  { module: 'Currículos', action: 'Ação — Desligar funcionário', perm: 'acao.desligar' },
  { module: 'Currículos', action: 'Ação — Excluir candidato', perm: 'acao.excluir_candidato' },
  { module: 'Currículos', action: 'Agenda — ver', perm: 'agenda.ver' },
  { module: 'Currículos', action: 'Agenda — configurar locais', perm: 'agenda.config_locais' },
  { module: 'Currículos', action: 'Agenda — configurar entrevistadores', perm: 'agenda.config_entrevistadores' },
  { module: 'Currículos', action: 'Agenda — remover agendamento', perm: 'agenda.remover_agendamento' },
  { module: 'Currículos', action: 'Config — Seções e perguntas', perm: 'curriculos.secoes' },
  { module: 'Currículos', action: 'Config — Vagas', perm: 'curriculos.vagas' },
  { module: 'Currículos', action: 'Config — Teste cultural', perm: 'curriculos.teste_cultural' },

  { module: 'Colaboradores', action: 'Ver listas (todos os status)', perm: 'colaboradores.ver' },

  { module: 'Pesquisas de clima', action: 'Cadastrar pesquisas', perm: 'pesquisas.cadastrar' },
  { module: 'Pesquisas de clima', action: 'Ver resultados', perm: 'pesquisas.resultados' },
  { module: 'Pesquisas de clima', action: 'Remover resposta', perm: 'pesquisas.remover_resposta' },

  { module: 'Documentos da empresa', action: 'Ver / Adicionar / Editar / Excluir', perm: 'documentos_empresa' },

  { module: 'Mensagens WhatsApp', action: 'Ver conversas e histórico', perm: 'whatsapp.ver' },
  { module: 'Mensagens WhatsApp', action: 'Excluir conversa', perm: 'whatsapp.excluir' },

  { module: 'Relatórios', action: 'Ver relatórios', perm: 'relatorios.ver' },

  { module: 'Auditoria', action: 'Ver auditoria', perm: 'auditoria.ver' },

  { module: 'Configurações', action: 'WhatsApp / Z-API', perm: 'config.whatsapp' },
  { module: 'Configurações', action: 'Configuração IA', perm: 'config.ia' },
  { module: 'Configurações', action: 'Empresa — Cadastro de empresa', perm: 'config.empresa_cadastro' },
  { module: 'Configurações', action: 'Empresa — Cultura da empresa', perm: 'config.empresa_cultura' },
  { module: 'Configurações', action: 'Usuários — Perfil de usuário', perm: 'config.usuarios_perfil' },
  { module: 'Configurações', action: 'Usuários — Cadastro de usuários', perm: 'config.usuarios_cadastro' },
  { module: 'Configurações', action: 'Kanban — Colunas', perm: 'config.kanban' },
]

// perm → ação (para derivar o nível natural)
const ACTION_OF: Record<string, string> = Object.fromEntries(PERMISSION_MATRIX.map(r => [r.perm, r.action]))

// Permissão sempre exclusiva do master (módulo de Perfil de usuário / editor de acessos)
export const MASTER_ONLY_PERMS: Permission[] = ['config.usuarios_perfil', 'auditoria.ver']

/** Nível PADRÃO (código) para um perfil/permissão — usado quando não há valor salvo no banco. */
export function defaultLevel(role: Role, perm: Permission): Level {
  if (MASTER_ONLY_PERMS.includes(perm)) return role === 'master' ? 'full' : 'none'
  if (role === 'master' || role === 'admin') return 'full'   // acesso total (admin ajustável na matriz)
  if (role === 'visualizador') return 'view'                 // somente leitura
  if (role === 'externo') return 'none'                      // sem acesso ao painel
  if (!can(role, perm)) return 'none'
  return naturalLevel(ACTION_OF[perm] || '')
}
