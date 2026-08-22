import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { decryptToken } from '@/lib/helpers'

/**
 * Cliente do RHiD (Control iD nuvem) — SOMENTE LEITURA.
 *
 * O RHiD não emite chave de API: a autenticação é o mesmo login do app
 * (domínio + e-mail + senha) trocado por um JWT de curta duração.
 *   POST /v2/login.svc/            { domain, email, password, loginType:'operator' }
 *        -> { accessToken }        (credencial inválida responde HTTP 500!)
 * Todas as chamadas seguintes levam:
 *   Authorization: Bearer <accessToken>
 *   X-Cid-RHiD: <cidCustomerId>    (claim do próprio JWT)
 *
 * Endpoints usados aqui (ambos de leitura, os mesmos que a tela do RHiD chama):
 *   GET  /v2/customerdb/person.svc/a_resumido
 *        -> { data: [{ id, name, cpf, pis, register, status }] }
 *   POST /v2/report.svc/apuracao_ponto_salva_tabela
 *        { idPerson:[...], ini:'yyyyMMdd', fim:'yyyyMMdd', afdChanges: [] }
 *        -> uma linha por pessoa/dia, com `diasTrabalhados` (0 ou 1)
 *
 * Sobre o nome "salva_tabela": é a chamada que a tela "Apuração de Ponto" faz
 * para EXIBIR a tabela (o próprio paginador dela chama isso). `afdChanges: []`
 * significa "nenhuma alteração simulada" — nada é gravado no RHiD.
 */

const RHID_BASE = 'https://rhid.com.br/v2'

/** O endpoint de apuração devolve no máximo 50 pessoas por chamada. */
const LOTE_PESSOAS = 40

export interface SessaoRhid {
  token: string
  customerId: string | null
  domain: string | null
}

export interface PessoaRhid {
  id: number
  nome: string
  cpf: string
  status: number
}

/** Só os dígitos — o RHiD guarda CPF sem máscara, mas nem sempre com zero à esquerda. */
export function cpfNormalizado(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '').padStart(11, '0').slice(-11)
}

function claimsDoToken(jwt: string): Record<string, unknown> {
  try {
    const parte = jwt.split('.')[1]
    return JSON.parse(Buffer.from(parte.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch { return {} }
}

async function comTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally { clearTimeout(t) }
}

export class ErroRhid extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

/** Abre sessão no RHiD com a credencial guardada em `integrations`. */
export async function abrirSessaoRhid(): Promise<SessaoRhid> {
  const supabase = await createSupabaseServiceClient()
  const { data: integracao } = await supabase
    .from('integrations')
    .select('account_email, token_api_encrypted, status, meta')
    .eq('provider', 'controlid')
    .maybeSingle()

  if (!integracao || integracao.status !== 'connected' || !integracao.token_api_encrypted) {
    throw new ErroRhid('A integração Control iD não está conectada. Configure em Configurações → Integrações.')
  }

  const email = String(integracao.account_email ?? '')
  const password = decryptToken(integracao.token_api_encrypted as string)
  const meta = (integracao.meta ?? {}) as Record<string, unknown>
  const domain = (meta.domain as string) || null

  if (!email || !password) throw new ErroRhid('Credencial do Control iD incompleta. Reconecte a integração.')

  const res = await comTimeout(`${RHID_BASE}/login.svc/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ domain, email, password, loginType: 'operator' }),
  }, 20000)

  const texto = await res.text()
  let corpo: { accessToken?: string | null; error?: string | null } = {}
  try { corpo = JSON.parse(texto) } catch { throw new ErroRhid('Resposta inesperada do RHiD.') }

  // Credencial inválida volta HTTP 500 — o que vale é a presença do token.
  if (!corpo.accessToken) {
    throw new ErroRhid(corpo.error || 'Não foi possível entrar no RHiD. Confira as credenciais da integração.')
  }

  const claims = claimsDoToken(corpo.accessToken)
  return {
    token: corpo.accessToken,
    customerId: claims.cidCustomerId != null ? String(claims.cidCustomerId) : null,
    domain,
  }
}

function cabecalhos(s: SessaoRhid): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${s.token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (s.customerId) h['X-Cid-RHiD'] = s.customerId
  return h
}

/** Lista resumida de funcionários do RHiD (id + CPF), para casar com a nossa base. */
export async function listarPessoas(s: SessaoRhid): Promise<PessoaRhid[]> {
  const res = await comTimeout(`${RHID_BASE}/customerdb/person.svc/a_resumido`, {
    method: 'GET', headers: cabecalhos(s),
  }, 30000)
  if (!res.ok) throw new ErroRhid(`O RHiD recusou a consulta de funcionários (HTTP ${res.status}).`, 502)

  const corpo = await res.json().catch(() => null) as { data?: unknown[] } | unknown[] | null
  const lista = Array.isArray(corpo) ? corpo : Array.isArray(corpo?.data) ? corpo.data : []

  return (lista as Record<string, unknown>[])
    .map(p => ({
      id: Number(p.id),
      nome: String(p.name ?? ''),
      cpf: cpfNormalizado(p.cpf),
      status: Number(p.status ?? 0),
    }))
    .filter(p => Number.isFinite(p.id) && p.cpf.length === 11)
}

interface LinhaApuracao { idPerson?: number; diasTrabalhados?: number | string }

/**
 * Soma os dias trabalhados de cada pessoa no período, direto da apuração de ponto.
 * `ini`/`fim` no formato yyyyMMdd. Devolve um mapa idPerson -> dias.
 */
export async function diasTrabalhados(
  s: SessaoRhid, ids: number[], ini: string, fim: string,
): Promise<Map<number, number>> {
  const total = new Map<number, number>()
  ids.forEach(id => total.set(id, 0))

  for (let i = 0; i < ids.length; i += LOTE_PESSOAS) {
    const lote = ids.slice(i, i + LOTE_PESSOAS)
    const res = await comTimeout(`${RHID_BASE}/report.svc/apuracao_ponto_salva_tabela`, {
      method: 'POST',
      headers: cabecalhos(s),
      // afdChanges vazio = nenhuma simulação/alteração; é só leitura.
      body: JSON.stringify({ idPerson: lote, ini, fim, afdChanges: [] }),
    }, 60000)

    if (!res.ok) throw new ErroRhid(`O RHiD recusou a apuração de ponto (HTTP ${res.status}).`, 502)

    const linhas = await res.json().catch(() => null)
    if (!Array.isArray(linhas)) throw new ErroRhid('A apuração de ponto do RHiD veio em formato inesperado.', 502)

    for (const l of linhas as LinhaApuracao[]) {
      const id = Number(l.idPerson)
      if (!Number.isFinite(id)) continue
      total.set(id, (total.get(id) ?? 0) + (Number(l.diasTrabalhados) || 0))
    }
  }

  return total
}

/** Primeiro e último dia do mês (yyyyMMdd) a partir de uma competência yyyy-mm-01. */
export function periodoDaCompetencia(competencia: string): { ini: string; fim: string } {
  const [ano, mes] = competencia.split('-').map(Number)
  const ultimo = new Date(ano, mes, 0).getDate()
  const mm = String(mes).padStart(2, '0')
  return { ini: `${ano}${mm}01`, fim: `${ano}${mm}${String(ultimo).padStart(2, '0')}` }
}
