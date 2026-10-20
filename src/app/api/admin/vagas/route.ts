import { criarRotasConfig } from '@/lib/crud-config'

export const dynamic = 'force-dynamic'

/**
 * Cadastro de vagas — substitui a escrita que a tela `/admin/vagas` fazia
 * direto do navegador. Mesma permissão que a tela já exige para abrir.
 */
export const { POST, PATCH, DELETE } = criarRotasConfig({
  tabela: 'jobs',
  perms: ['curriculos.vagas'],
  colunas: [
    'title', 'description', 'unit', 'requirements', 'desired_profile',
    'schedule_requirements', 'salary_range', 'benefits', 'is_active',
    'cbo_code', 'cbo_description', 'cbo_title',
  ],
})
