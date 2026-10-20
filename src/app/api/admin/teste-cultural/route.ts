import { criarRotasConfig } from '@/lib/crud-config'

export const dynamic = 'force-dynamic'

/**
 * Perguntas do teste cultural — substitui a escrita direta do navegador em
 * `/admin/teste-cultural`. São elas que definem a nota de aderência cultural
 * de todo candidato, então a escrita segue a permissão da tela.
 */
export const { POST, PATCH, DELETE } = criarRotasConfig({
  tabela: 'culture_questions',
  perms: ['curriculos.teste_cultural'],
  colunas: [
    'question_text', 'options', 'ideal_answer', 'scores',
    'culture_value', 'weight', 'is_active', 'sort_order',
  ],
})
