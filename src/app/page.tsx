import { permanentRedirect } from 'next/navigation'

/**
 * A raiz do app não tem página própria: a única superfície pública é o
 * formulário de currículo.
 *
 * `permanentRedirect` (308) e não `redirect` (307), que era o que estava aqui.
 * O 307 é TEMPORÁRIO, e para o buscador isso significa "a raiz é a página de
 * verdade, /curriculo é só onde ela está por ora" — então ele mantinha a raiz
 * como canônica e deixava /curriculo fora do índice. Confirmado na Inspeção de
 * URL do Search Console em 16/11/2026: canônica declarada /curriculo, canônica
 * escolhida pelo Google a raiz.
 *
 * Efeito colateral de um 308: navegador guarda redirecionamento permanente por
 * muito tempo. Se um dia a raiz precisar mostrar uma página própria, quem já
 * passou por aqui continuará sendo levado para /curriculo até limpar o cache —
 * nesse caso, voltar para `redirect` e esperar o cache expirar.
 */
export default function Home() {
  permanentRedirect('/curriculo')
}
