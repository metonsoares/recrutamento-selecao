import { createHmac, timingSafeEqual } from 'node:crypto'

// Identidade assinada vinda do Portal BDT.
//
// O colaborador faz login NO PORTAL; o Portal assina quem ele é com o segredo
// compartilhado (IMPORT_TOKEN, o mesmo dos demais fluxos cross-project) e
// manda para a pesquisa. O app de Recrutamento só confere a assinatura —
// nenhuma sessão do app é criada, então o colaborador não ganha acesso ao
// painel: ele só consegue abrir o formulário da pesquisa.

export interface IdentidadePortal {
  cpf?: string | null
  email?: string | null
  nome?: string | null
  /** epoch em segundos — a assinatura vale por poucos minutos */
  exp: number
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deBase64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function assinar(payloadB64: string, segredo: string): string {
  return base64url(createHmac('sha256', segredo).update(payloadB64).digest())
}

/** Gera o parâmetro `u` (usado em testes e por quem emite o link). */
export function assinarIdentidade(dados: IdentidadePortal, segredo: string): string {
  const payload = base64url(Buffer.from(JSON.stringify(dados), 'utf8'))
  return `${payload}.${assinar(payload, segredo)}`
}

/**
 * Confere a assinatura e a validade. Retorna a identidade ou um motivo de
 * recusa — nunca lança, para a página conseguir mostrar uma mensagem amigável.
 */
export function verificarIdentidade(
  u: string | undefined,
  segredo: string | undefined,
): { ok: true; identidade: IdentidadePortal } | { ok: false; motivo: 'ausente' | 'sem_segredo' | 'invalida' | 'expirada' } {
  if (!u) return { ok: false, motivo: 'ausente' }
  if (!segredo) return { ok: false, motivo: 'sem_segredo' }

  const [payloadB64, assinaturaRecebida] = u.split('.')
  if (!payloadB64 || !assinaturaRecebida) return { ok: false, motivo: 'invalida' }

  const esperada = assinar(payloadB64, segredo)
  const a = Buffer.from(esperada)
  const b = Buffer.from(assinaturaRecebida)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, motivo: 'invalida' }

  let identidade: IdentidadePortal
  try {
    identidade = JSON.parse(deBase64url(payloadB64).toString('utf8'))
  } catch {
    return { ok: false, motivo: 'invalida' }
  }

  if (!identidade?.exp || identidade.exp * 1000 < Date.now()) return { ok: false, motivo: 'expirada' }
  return { ok: true, identidade }
}

/** Só dígitos, para casar CPF entre as bases. */
export function apenasDigitos(v: string | null | undefined): string {
  return String(v ?? '').replace(/\D/g, '')
}
