import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'
import { getAnthropicKey } from '@/lib/ai-key'
import { Mind7CheckResult, Mind7Vinculo } from '@/types'

export const maxDuration = 60

/**
 * Check Mind7 — linha do tempo de vínculos de emprego do candidato.
 *
 * O Mind7 não publica API e o painel fica atrás do desafio da Cloudflare: um
 * login feito daqui responde 403 (medido ao conectar a integração, em
 * Configurações → Integrações). Por isso a consulta acontece onde ela consegue
 * acontecer — no navegador de quem já está logado — e esta rota trata o
 * RESULTADO: recebe o texto da consulta Big Data, estrutura a linha do tempo e
 * guarda no candidato.
 *
 * Se um dia o painel aceitar requisição de servidor (a integração passa a
 * marcar alcance='servidor'), é aqui que a consulta direta entra — o resto da
 * tela não muda.
 */

/** "1.234,56" ou "1234.56" -> 1234.56 */
function valorNumero(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v) && v > 0) return v
  if (typeof v !== 'string') return undefined
  const limpo = v.replace(/[^\d,.-]/g, '')
  // "1.234,56" (br) vs "1234.56" (en)
  const n = /,\d{1,2}$/.test(limpo)
    ? Number(limpo.replace(/\./g, '').replace(',', '.'))
    : Number(limpo.replace(/,/g, ''))
  return isFinite(n) && n > 0 ? n : undefined
}

function texto(v: unknown): string | undefined {
  const s = String(v ?? '').trim()
  return s && s !== '-' && s.toLowerCase() !== 'null' ? s : undefined
}

/**
 * Estrutura o texto da consulta com a IA.
 *
 * O layout do Mind7 muda entre consultas (e entre as bases que ele agrega),
 * então um parser de regex quebraria no primeiro relatório diferente. A IA lê o
 * texto e devolve JSON — com a instrução explícita de NÃO inventar: campo que
 * não estiver no texto sai vazio.
 */
async function estruturar(bruto: string, nome: string, cpf: string): Promise<Mind7CheckResult> {
  const chave = await getAnthropicKey()
  if (!chave) {
    throw new Error('Chave de IA não configurada — necessária para ler o relatório do Mind7. Configure em Configurações → Configuração da IA.')
  }

  const prompt = `Você recebe o texto bruto de uma consulta Big Data do Mind7 sobre uma pessoa.
Extraia APENAS a linha do tempo de VÍNCULOS DE EMPREGO (empregos com registro).

Pessoa consultada aqui: ${nome} — CPF ${cpf}

Texto da consulta:
"""
${bruto.slice(0, 60000)}
"""

Responda SOMENTE com JSON válido, sem markdown, neste formato:
{
  "encontrado": true|false,
  "nome_consultado": "nome como aparece no relatório, se aparecer",
  "cpf_consultado": "CPF como aparece no relatório, se aparecer",
  "resumo": "1 ou 2 frases em português: quantos vínculos, período coberto e se há vínculo ativo",
  "vinculos": [
    {
      "empresa": "razão social ou nome da empresa",
      "cnpj": "só dígitos, se houver",
      "cargo": "função/cargo, se houver",
      "admissao": "AAAA-MM-DD ou AAAA-MM (como der para saber)",
      "saida": "AAAA-MM-DD ou AAAA-MM; vazio se ainda está no emprego",
      "duracao": "ex.: 1 ano e 3 meses (calcule quando tiver as duas datas)",
      "salario": 1234.56,
      "vinculo_ativo": true|false,
      "observacao": "algo relevante do relatório sobre esse vínculo"
    }
  ],
  "observacao": "avisos: relatório parcial, pessoa diferente da consultada, etc."
}

Regras:
- NÃO invente nada. Campo que não estiver no texto deve ser omitido.
- Ordene os vínculos do mais recente para o mais antigo.
- Se o texto não for uma consulta do Mind7 ou não tiver vínculos de emprego, devolva encontrado=false, vinculos=[] e explique em "resumo".
- Se o nome/CPF do relatório for claramente de OUTRA pessoa, diga isso em "observacao".`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || 'A IA não conseguiu ler o relatório.')

  const saida = String(data?.content?.[0]?.text ?? '')
  const json = saida.slice(saida.indexOf('{'), saida.lastIndexOf('}') + 1)
  let cru: Record<string, unknown>
  try { cru = JSON.parse(json) } catch {
    throw new Error('Não consegui interpretar o relatório. Confira se o texto colado é o resultado da consulta Big Data.')
  }

  const vinculos: Mind7Vinculo[] = (Array.isArray(cru.vinculos) ? cru.vinculos : [])
    .map((v: Record<string, unknown>) => ({
      empresa: texto(v.empresa) ?? 'Empresa não identificada',
      cnpj: texto(v.cnpj)?.replace(/\D/g, '') || undefined,
      cargo: texto(v.cargo),
      admissao: texto(v.admissao),
      saida: texto(v.saida),
      duracao: texto(v.duracao),
      salario: valorNumero(v.salario),
      vinculo_ativo: v.vinculo_ativo === true,
      observacao: texto(v.observacao),
    }))

  return {
    encontrado: vinculos.length > 0,
    resumo: texto(cru.resumo) ?? (vinculos.length
      ? `${vinculos.length} vínculo(s) de emprego encontrado(s).`
      : 'Nenhum vínculo de emprego encontrado no relatório.'),
    vinculos,
    nome_consultado: texto(cru.nome_consultado),
    cpf_consultado: texto(cru.cpf_consultado)?.replace(/\D/g, '') || undefined,
    observacao: texto(cru.observacao),
    origem: 'colado',
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const bruto = String(body?.texto ?? '').trim()

    const supabase = await createSupabaseServiceClient()
    const { data: candidate } = await supabase
      .from('candidates').select('full_name, cpf').eq('id', id).single()
    if (!candidate) return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 })

    const cpf = (candidate.cpf as string | null)?.replace(/\D/g, '') || ''
    if (cpf.length !== 11) {
      return NextResponse.json({ error: 'Candidato sem CPF válido cadastrado — a consulta do Mind7 é por CPF.' }, { status: 400 })
    }

    if (bruto.length < 40) {
      return NextResponse.json({
        error: 'Cole o resultado da consulta Big Data do Mind7 (selecione a página inteira do relatório e copie).',
      }, { status: 400 })
    }

    const result = await estruturar(bruto, candidate.full_name as string, cpf)
    const agora = new Date().toISOString()

    // Guardamos só o resultado estruturado, não o texto bruto: o relatório traz
    // muito mais dado pessoal do que o RH precisa para avaliar experiência.
    const { error } = await supabase.from('candidates').update({
      mind7_check_result: result,
      mind7_check_at: agora,
      updated_at: agora,
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, result, checkedAt: agora })
  } catch (err) {
    console.error('[mind7-check]', err)
    return NextResponse.json({ error: (err as Error).message || 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE — apaga a consulta guardada (para refazer do zero). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('candidates')
      .update({ mind7_check_result: null, mind7_check_at: null, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[mind7-check DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
