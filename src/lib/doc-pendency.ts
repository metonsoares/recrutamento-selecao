// Cálculo de pendências de documentos (Ficha de Admissão e Documentos da Empresa)

interface DocState { not_applicable?: boolean; files?: unknown[] }

// Documentos da Ficha de Admissão (mesmas chaves do ficha-admissao-form)
const FICHA_DOCS: { key: string; perChild?: boolean; pensao?: boolean }[] = [
  { key: 'carteira_profissional' },
  { key: 'foto_3x4' },
  { key: 'atestado_admissional' },
  { key: 'cartao_pis' },
  { key: 'cpf' },
  { key: 'identidade' },
  { key: 'titulo_eleitor' },
  { key: 'certificado_reservista' },
  { key: 'comprovante_escolaridade' },
  { key: 'certidao_civil' },
  { key: 'comprovante_residencia' },
  { key: 'certidao_nascimento_filhos', perChild: true },
  { key: 'cpf_dependentes', perChild: true },
  { key: 'carteira_vacinacao', perChild: true },
  { key: 'declaracao_escolar', perChild: true },
  { key: 'pensao_alimenticia', pensao: true },
]

// Documentos da Empresa (mesmas chaves do documentos-tab)
const COMPANY_DOCS = [
  'ficha_registro', 'contrato_tempo_determinado', 'contrato_experiencia', 'contrato_trabalho',
  'regulamento_interno', 'banco_horas', 'cessao_imagem', 'vale_transporte',
  'uniformes_epis', 'acrm_geral', 'acrm_escala',
]

interface AdmissionForm {
  docs?: Record<string, DocState>
  children_count?: string
  alimony?: boolean | null
}

export function countFichaPending(af: AdmissionForm | null): number {
  const docs = af?.docs || {}
  const children = parseInt(af?.children_count || '0') || 0
  const alimony = af?.alimony === true
  let pending = 0
  for (const d of FICHA_DOCS) {
    if (d.perChild && children === 0) continue
    if (d.pensao && !alimony) continue
    const s = docs[d.key]
    const needed = d.perChild ? Math.max(1, children) : 1
    const resolved = s?.not_applicable === true || (s?.files?.length ?? 0) >= needed
    if (!resolved) pending++
  }
  return pending
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
