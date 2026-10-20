import { criarRotasConfig } from '@/lib/crud-config'

export const dynamic = 'force-dynamic'

/**
 * Perguntas do formulário de currículo — substitui a escrita direta do
 * navegador na tela de seções (`/admin/secoes`).
 */
export const { POST, PATCH, DELETE } = criarRotasConfig({
  tabela: 'form_questions',
  perms: ['curriculos.secoes'],
  colunas: [
    'form_type', 'question_text', 'description', 'field_type', 'options',
    'category', 'weight', 'is_required', 'is_active', 'sort_order',
  ],
})
