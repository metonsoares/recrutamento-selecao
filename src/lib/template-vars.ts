// Utilitários para variáveis de templates de contrato (.docx).
// Agrupa grafias diferentes do mesmo campo (aspas, prefixo CONTRATADO/CONTRATANTE,
// aspas curvas do Word) num único campo lógico.

export function stripQuotes(s: string): string {
  return s.replace(/["“”'']/g, '').trim()
}

/** Chave normalizada: sem aspas, acentos, espaços e pontuação. */
export function normKey(s: string): string {
  return stripQuotes(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

const ROLE_PREFIXES = ['contratante', 'contratada', 'contratado']

/** Chave sem o prefixo de papel (CONTRATADO:/CONTRATANTE:) quando houver. */
export function baseKey(s: string): string {
  const k = normKey(s)
  for (const p of ROLE_PREFIXES) {
    if (k.startsWith(p) && k.length > p.length + 2) return k.slice(p.length)
  }
  return k
}

/** Rótulo de exibição amigável (sem prefixo CONTRATANTE/CONTRATADO). */
export function displayLabel(raw: string): string {
  const parts = stripQuotes(raw).split(':').map(p => p.trim()).filter(Boolean)
  // descarta o 1º segmento quando é apenas o papel (CONTRATANTE/CONTRATADO)
  if (parts.length > 1 && ROLE_PREFIXES.includes(normKey(parts[0]))) parts.shift()
  return parts.join(' — ').trim()
}

export interface VarGroup {
  /** chave estável do grupo (normKey do 1º tag) */
  key: string
  label: string
  /** todas as grafias originais no documento */
  tags: string[]
}

/** Agrupa tags que representam o mesmo campo lógico. */
export function groupVariables(tags: string[]): VarGroup[] {
  const groups: { nk: string; bk: string; label: string; labelIsClean: boolean; tags: string[] }[] = []
  for (const tag of tags) {
    const nk = normKey(tag)
    const bk = baseKey(tag)
    if (!nk) continue
    const hit = groups.find(g => nk === g.nk || nk === g.bk || bk === g.nk || bk === g.bk)
    if (hit) {
      hit.tags.push(tag)
      // prefere o rótulo sem prefixo de papel (mais limpo)
      const clean = nk === bk
      if (clean && !hit.labelIsClean) { hit.label = displayLabel(tag); hit.labelIsClean = true }
    } else {
      groups.push({ nk, bk, label: displayLabel(tag), labelIsClean: nk === bk, tags: [tag] })
    }
  }
  return groups.map(g => ({ key: g.nk, label: g.label, tags: g.tags }))
}

/** Sugere a associação (source) pelo conteúdo do nome do campo. */
export function guessSource(name: string): { source: string; type: string } {
  const k = normKey(name)
  const has = (s: string) => k.includes(s)
  if (has('cpf')) return { source: 'cpf', type: 'text' }
  if (has('cnpj')) return { source: 'empresa_cnpj', type: 'text' }
  if (has('cep')) {
    if (has('empresa') || has('contratante')) return { source: 'empresa_cep', type: 'text' }
    return { source: 'cep', type: 'text' }
  }
  // número do contrato → gerado automaticamente (AAAAMMDDHHMM)
  if (has('numero') && has('contrato')) return { source: 'numero_contrato', type: 'text' }
  // campos do evento são sempre preenchidos na hora
  if (has('evento')) return { source: 'manual', type: has('data') ? 'date' : (has('valor') || has('preco')) ? 'currency' : 'text' }
  if (has('endereco') || has('residencia')) {
    if (has('empresa') || has('contratante')) return { source: 'empresa_endereco', type: 'text' }
    return { source: 'endereco', type: 'text' }
  }
  if (has('telefone') || has('celular') || has('fone')) return { source: 'telefone', type: 'text' }
  if (has('email')) return { source: 'email', type: 'text' }
  if (has('cidade')) return { source: 'cidade', type: 'text' }
  if (has('bairro')) return { source: 'bairro', type: 'text' }
  if (has('salario')) return { source: 'salario', type: 'text' }
  if (has('cargo') || has('funcao')) return { source: 'cargo', type: 'text' }
  if (has('contratante') || has('empresa')) return { source: 'empresa', type: 'text' }
  if (has('nome') || k === 'contratado' || k === 'contratada' || has('candidato') || has('funcionario')) return { source: 'nome', type: 'text' }
  if (has('data')) {
    if (has('assinatura') || k === 'data' || k === 'datahoje' || k === 'dataatual' || k === 'hoje') return { source: 'data', type: 'text' }
    return { source: 'manual', type: 'date' }
  }
  if (has('valor') || has('preco')) return { source: 'manual', type: 'currency' }
  return { source: 'manual', type: 'text' }
}
