// Cálculo de pendências de documentos (Ficha de Admissão e Documentos da Empresa)

interface DocState { not_applicable?: boolean; files?: unknown[] }

/** Documentos da Ficha de Admissão (mesmas chaves do ficha-admissao-form). */
export const FICHA_DOCS: { key: string; label: string; perChild?: boolean; pensao?: boolean }[] = [
  { key: 'carteira_profissional', label: 'Carteira Profissional (folhas de identificação e qualificação)' },
  { key: 'foto_3x4', label: '01 Foto 3 × 4' },
  { key: 'atestado_admissional', label: 'Atestado Admissional (Médico do Trabalho)' },
  { key: 'cartao_pis', label: 'Cartão de Inscrição no PIS' },
  { key: 'cpf', label: 'CPF' },
  { key: 'identidade', label: 'Carteira de Identidade (RG)' },
  { key: 'titulo_eleitor', label: 'Título de Eleitor' },
  { key: 'certificado_reservista', label: 'Certificado de Reservista' },
  { key: 'comprovante_escolaridade', label: 'Comprovante de Escolaridade' },
  { key: 'certidao_civil', label: 'Certidão de Nascimento / Casamento / outros' },
  { key: 'comprovante_residencia', label: 'Comprovante de Residência' },
  { key: 'certidao_nascimento_filhos', label: 'Certidão de Nascimento dos filhos', perChild: true },
  { key: 'cpf_dependentes', label: 'CPF dos dependentes', perChild: true },
  { key: 'carteira_vacinacao', label: 'Carteira de Vacinação (filhos)', perChild: true },
  { key: 'declaracao_escolar', label: 'Declaração Escolar dos filhos', perChild: true },
  { key: 'pensao_alimenticia', label: 'Decisão Judicial – Pensão Alimentícia', pensao: true },
]

// Documentos da Empresa (mesmas chaves do documentos-tab)
const COMPANY_DOCS = [
  'ficha_registro', 'contrato_tempo_determinado', 'contrato_experiencia', 'contrato_trabalho',
  'regulamento_interno', 'banco_horas', 'cessao_imagem', 'vale_transporte',
  'uniformes_epis', 'acrm_geral', 'acrm_escala',
]

export interface FichaComDocs {
  docs?: Record<string, unknown>
  children_count?: string
  alimony?: boolean | null
}

/** Um documento que ainda falta, com quantos arquivos faltam nele. */
export interface DocPendente {
  key: string
  label: string
  /** 1 para a maioria; nos documentos por filho, um por filho ainda sem arquivo. */
  faltam: number
}

/**
 * O que ainda falta na ficha.
 *
 * É a mesma regra da tela do RH: "não aplicável" resolve, documento por filho
 * precisa de um arquivo por filho, e os de filhos/pensão só existem quando a
 * ficha diz que há filhos ou pensão. O link externo do colaborador lê daqui,
 * então as duas pontas nunca discordam sobre o que está pendente.
 */
export function docsPendentesFicha(af: FichaComDocs | null | undefined): DocPendente[] {
  const docs = (af?.docs || {}) as Record<string, DocState>
  const children = parseInt(af?.children_count || '0') || 0
  const alimony = af?.alimony === true

  const pendentes: DocPendente[] = []
  for (const d of FICHA_DOCS) {
    if (d.perChild && children === 0) continue
    if (d.pensao && !alimony) continue
    const s = docs[d.key]
    if (s?.not_applicable === true) continue
    const needed = d.perChild ? Math.max(1, children) : 1
    const enviados = s?.files?.filter(Boolean).length ?? 0
    if (enviados >= needed) continue
    pendentes.push({ key: d.key, label: d.label, faltam: needed - enviados })
  }
  return pendentes
}

export function countFichaPending(af: FichaComDocs | null): number {
  return docsPendentesFicha(af).length
}

export function countCompanyPending(companyDocs: Record<string, unknown> | null): number {
  const docs = (companyDocs || {}) as Record<string, DocState>
  let pending = 0
  for (const key of COMPANY_DOCS) {
    const s = docs[key]
    const resolved = s?.not_applicable === true || (s?.files?.length ?? 0) > 0
    if (!resolved) pending++
  }
  return pending
}
