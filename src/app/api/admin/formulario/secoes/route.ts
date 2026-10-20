import { criarRotasConfig } from '@/lib/crud-config'

export const dynamic = 'force-dynamic'

/**
 * Seções do formulário de currículo — substitui a escrita direta do navegador
 * na tela `/admin/secoes`.
 */
export const { POST, PATCH, DELETE } = criarRotasConfig({
  tabela: 'form_sections',
  perms: ['curriculos.secoes'],
  colunas: ['name', 'description', 'category', 'sort_order', 'is_active'],
})
