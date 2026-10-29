/**
 * Definição dos documentos da ficha — FONTE ÚNICA.
 *
 * Estava duplicada entre a tela da Ficha de Admissão e a aba Documentos; saiu
 * daqui para o dossiê em ZIP (29/10/2026) poder nomear cada arquivo com o mesmo
 * rótulo que a pessoa vê na tela, sem ninguém manter duas listas iguais.
 */

export interface DocDef {
  key: string
  label: string
  /** Um documento por filho (a ficha repete o campo por dependente). */
  perChild?: boolean
  maxArquivos?: number
}

/** Documentos da Ficha de Admissão (o que o colaborador entrega). */
export const DOCS_FICHA: DocDef[] = [
  { key: 'carteira_profissional',      label: 'Carteira de Trabalho Digital' },
  { key: 'foto_3x4',                   label: '01 Foto 3 × 4' },
  { key: 'atestado_admissional',       label: 'Atestado Admissional (Médico do Trabalho)' },
  { key: 'cartao_pis',                 label: 'Cartão de Inscrição no PIS' },
  { key: 'cpf',                        label: 'CPF' },
  { key: 'identidade',                 label: 'Carteira de Identidade (RG)' },
  { key: 'titulo_eleitor',             label: 'Título de Eleitor' },
  { key: 'certificado_reservista',     label: 'Certificado de Reservista' },
  { key: 'comprovante_escolaridade',   label: 'Comprovante de Escolaridade' },
  { key: 'certidao_civil',             label: 'Certidão de Nascimento / Casamento / outros' },
  { key: 'comprovante_residencia',     label: 'Comprovante de Residência' },
  { key: 'certidao_nascimento_filhos', label: 'Certidão de Nascimento dos filhos', perChild: true },
  { key: 'cpf_dependentes',            label: 'CPF dos dependentes', perChild: true },
  { key: 'carteira_vacinacao',         label: 'Carteira de Vacinação (filhos)', perChild: true, maxArquivos: 4 },
  { key: 'declaracao_escolar',         label: 'Declaração Escolar dos filhos', perChild: true },
  { key: 'pensao_alimenticia',         label: 'Decisão Judicial – Pensão Alimentícia', maxArquivos: 10 },
]

export interface DocEmpresaDef {
  key: string
  label: string
  multiple: boolean
  na: boolean
  max?: number
  soIntermitente?: boolean
  semFreelancer?: boolean
}

/** Documentos que a EMPRESA entrega/assina (aba Documentos). */
export const DOCS_EMPRESA: DocEmpresaDef[] = [
  { key: 'ficha_registro',      label: 'Ficha de registro',                              multiple: true,  na: false, max: 2, semFreelancer: true },
  { key: 'contrato_tempo_determinado', label: 'Contrato de prestação de serviço',        multiple: true,  na: true  },
  { key: 'contrato_experiencia',label: 'Contrato de experiência',                        multiple: false, na: true, semFreelancer: true },
  { key: 'contrato_trabalho',   label: 'Contrato de trabalho corporativo',               multiple: false, na: false, semFreelancer: true },
  { key: 'contrato_intermitente', label: 'Contrato de trabalho intermitente',             multiple: false, na: false, soIntermitente: true },
  { key: 'regulamento_interno', label: 'Regulamento interno',                            multiple: false, na: false, semFreelancer: true },
  { key: 'banco_horas',         label: 'Acordo individual de banco de horas',            multiple: true,  na: true, semFreelancer: true },
  { key: 'cessao_imagem',       label: 'Termo de cessão de imagem',                      multiple: true,  na: false },
  { key: 'vale_transporte',     label: 'Termo declaração vale transporte',               multiple: true,  na: true, semFreelancer: true },
  { key: 'uniformes_epis',      label: 'Termo entrega de uniformes/EPIs',                multiple: true,  na: false, max: 10, semFreelancer: true },
  { key: 'acrm_geral',          label: 'Termo entrega geral',                           multiple: true,  na: true,  max: 10 },
  { key: 'acrm_escala',         label: 'Acordo individual de escala 12×36',             multiple: false, na: true, semFreelancer: true },
  { key: 'premio_caju',         label: 'Prêmio Caju',                                    multiple: true,  na: true, max: 10, semFreelancer: true },
]

const ROTULOS: Record<string, string> = Object.fromEntries(
  [...DOCS_FICHA, ...DOCS_EMPRESA].map(d => [d.key, d.label]),
)

/** Rótulo de um documento pela chave; sem rótulo conhecido, devolve a chave. */
export function rotuloDoDocumento(key: string): string {
  return ROTULOS[key] ?? key
}
