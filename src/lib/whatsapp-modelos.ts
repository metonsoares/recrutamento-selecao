/**
 * Constantes do WhatsApp — sem nada de servidor dentro.
 *
 * Separado de `whatsapp.ts` de propósito: aquele arquivo fala com o
 * Supabase pelo service client e NÃO pode ser importado por componente de
 * tela. Nome do número e dos modelos, que a tela mostra, moram aqui.
 */

/** O número que aparece para o candidato. */
export const NUMERO_OFICIAL = '+55 24 3302-1335'

/**
 * Modelos aprovados na Meta que este app usa.
 * Criados em 10/11/2026 (UTILITY, pt_BR) — variável {{1}} = primeiro nome.
 */
export const TEMPLATE_CONVITE = 'convite_entrevista'
export const TEMPLATE_REINICIAR = 'reiniciar_contato_equipe'
/** Ainda não existe na Meta: quando for aprovado, o envio liga sozinho. */
export const TEMPLATE_TESTE_CULTURA = 'teste_cultura'

/** Primeiro nome, como os modelos esperam em {{1}}. */
export function primeiroNome(nomeCompleto: string | null | undefined): string {
  return (nomeCompleto ?? '').trim().split(/\s+/)[0] || 'tudo bem'
}
