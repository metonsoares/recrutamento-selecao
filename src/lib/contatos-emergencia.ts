/**
 * Contatos de emergência da Ficha de Admissão.
 *
 * Nasceu com UM contato, em dois campos soltos (`emergency_contact_name` e
 * `emergency_contact_phone`). Desde 10/11/2026 a ficha aceita vários: a lista
 * `emergency_contacts` passa a ser a verdade, e o par antigo continua sendo
 * gravado com o PRIMEIRO contato — assim nada que ainda leia de lá quebra.
 *
 * Mora fora do formulário de propósito: a ficha é componente de cliente, e a
 * impressão e o resumo (que rodam no servidor) precisam da mesma leitura.
 */

export interface ContatoEmergencia {
  name: string
  phone: string
}

type FichaComEmergencia = {
  emergency_contacts?: ContatoEmergencia[] | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
} | null | undefined

/**
 * Os contatos preenchidos da ficha, sem linhas em branco.
 * Lista vazia = ficha sem contato de emergência.
 */
export function contatosDeEmergencia(ficha: FichaComEmergencia): ContatoEmergencia[] {
  const lista = Array.isArray(ficha?.emergency_contacts) ? ficha.emergency_contacts : []
  const preenchidos = lista
    .map(c => ({ name: (c?.name ?? '').trim(), phone: (c?.phone ?? '').trim() }))
    .filter(c => c.name || c.phone)
  if (preenchidos.length > 0) return preenchidos

  // Ficha antiga: só o par de campos soltos.
  const legado = {
    name: (ficha?.emergency_contact_name ?? '').trim(),
    phone: (ficha?.emergency_contact_phone ?? '').trim(),
  }
  return legado.name || legado.phone ? [legado] : []
}
