export interface ParsedAddress {
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  cep: string
}

/**
 * Interpreta a resposta de endereço do formulário em diferentes formatos:
 * - array JSON: [street, number, neighborhood, city, cep]
 * - objeto JSON: { street/logradouro, number/numero, ... }
 * - string formatada: "Rua X - 59 - Bairro - Cidade - 00000-000"
 */
export function parseAddressAnswer(answerText: string | null | undefined): ParsedAddress | null {
  if (!answerText) return null
  let raw: unknown = answerText
  try { raw = JSON.parse(answerText) } catch { /* string simples */ }

  if (Array.isArray(raw)) {
    return {
      street: raw[0] || '', number: raw[1] || '', complement: '',
      neighborhood: raw[2] || '', city: raw[3] || '', cep: raw[4] || '',
    }
  }
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, string>
    return {
      street: r.street || r.logradouro || '',
      number: r.number || r.numero || '',
      complement: r.complement || r.complemento || '',
      neighborhood: r.neighborhood || r.bairro || '',
      city: r.city || r.cidade || '',
      cep: r.cep || r.zipCode || '',
    }
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parts = raw.split(/\s+-\s+|,\s*/).map(p => p.trim()).filter(Boolean)
    const cepMatch = raw.match(/\d{5}-?\d{3}/)
    return {
      street: parts[0] || '', number: parts[1] || '', complement: '',
      neighborhood: parts[2] || '', city: parts[3] || '',
      cep: cepMatch ? cepMatch[0] : (parts[4] || ''),
    }
  }
  return null
}

/** Formata um endereço como string única. */
export function formatAddress(a: ParsedAddress | null): string {
  if (!a) return ''
  return [a.street, a.number, a.complement, a.neighborhood, a.city].filter(Boolean).join(', ')
}
