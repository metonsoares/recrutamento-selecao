import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { requireAnyRoleApi } from '@/lib/auth-guard'

export const maxDuration = 60

/**
 * Passagens carregadas no cartão, importadas do relatório da WE Benefícios.
 *
 * A WE não tem API pública (o login dela é protegido por reCAPTCHA), então o
 * caminho é o arquivo: Relatórios → Relatório de Compras Unificado → Gerar CSV,
 * ou Cadastro → Prévia da Compra → Baixar CSV.
 *
 * A recarga é feita no mês ANTERIOR ao de uso — a compra de julho é a passagem
 * de agosto. Por isso a competência gravada é a que está aberta na tela (o mês
 * de USO), não a data da compra no arquivo.
 */

interface LinhaEntrada {
  cpf?: string | null
  nome?: string | null
  quantidade?: unknown
  valor?: unknown
  pedido?: string | null
}

/** Só os dígitos, com zero à esquerda — a WE às vezes corta o zero inicial. */
function cpfNormalizado(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '').padStart(11, '0').slice(-11)
}

/** "1.234,56" e "1234.56" viram 1234.56. */
function numeroBr(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').trim().replace(/[^\d,.-]/g, '')
  if (!s) return 0
  // Se tem vírgula, ela é o separador decimal e o ponto é milhar.
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(normal)
  return Number.isFinite(n) ? n : 0
}

function inteiro(v: unknown): number {
  const n = Math.trunc(numeroBr(v))
  return n > 0 ? n : 0
}

/**
 * POST — grava as passagens de uma competência.
 * Body: { competencia, linhas: [{cpf, nome, quantidade, valor, pedido}] }
 * Substitui o que já existia naquele mês para os CPFs enviados.
 */
export async function POST(req: NextRequest) {
  try {
    const denied = await requireAnyRoleApi(['master', 'gestor_rh'])
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const competencia = String(body.competencia ?? '')
    if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Competência inválida.' }, { status: 400 })
    }

    const entrada = (Array.isArray(body.linhas) ? body.linhas : []) as LinhaEntrada[]
    if (entrada.length === 0) {
      return NextResponse.json({ error: 'O arquivo não trouxe nenhuma linha.' }, { status: 400 })
    }

    // O relatório da WE traz uma linha por benefício/linha de ônibus: o mesmo
    // CPF aparece várias vezes e as quantidades SOMAM.
    const somado = new Map<string, { cpf: string; nome: string | null; quantidade: number; valor: number; pedido: string | null }>()
    for (const l of entrada) {
      const cpf = cpfNormalizado(l.cpf)
      if (cpf.length !== 11 || Number(cpf) === 0) continue
      const atual = somado.get(cpf) ?? { cpf, nome: null, quantidade: 0, valor: 0, pedido: null }
      atual.quantidade += inteiro(l.quantidade)
      atual.valor = Math.round((atual.valor + numeroBr(l.valor)) * 100) / 100
      atual.nome = atual.nome ?? (String(l.nome ?? '').trim() || null)
      atual.pedido = atual.pedido ?? (String(l.pedido ?? '').trim() || null)
      somado.set(cpf, atual)
    }

    if (somado.size === 0) {
      return NextResponse.json(
        { error: 'Nenhuma linha do arquivo tinha CPF válido — confira se a coluna de CPF foi reconhecida.' },
        { status: 400 },
      )
    }

    const supabase = await createSupabaseServiceClient()
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()

    // Casa com os nossos colaboradores pelo CPF (a WE não conhece o nosso id).
    const { data: cands } = await supabase
      .from('candidates').select('id, full_name, cpf').is('deleted_at', null)

    const idPorCpf = new Map<string, { id: string; nome: string }>()
    for (const c of cands ?? []) {
      const cpf = cpfNormalizado(c.cpf)
      if (cpf.length === 11 && !idPorCpf.has(cpf)) {
        idPorCpf.set(cpf, { id: c.id as string, nome: c.full_name as string })
      }
    }

    const linhas = Array.from(somado.values()).map(p => {
      const casado = idPorCpf.get(p.cpf)
      return {
        competencia,
        candidate_id: casado?.id ?? null,
        cpf: p.cpf,
        nome: casado?.nome ?? p.nome,
        quantidade: p.quantidade,
        valor: p.valor,
        pedido: p.pedido,
        importado_por: user?.email ?? null,
        importado_em: new Date().toISOString(),
      }
    })

    const { error } = await supabase
      .from('vt_passagens')
      .upsert(linhas, { onConflict: 'competencia,cpf' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const semCasar = linhas.filter(l => !l.candidate_id)
    return NextResponse.json({
      ok: true,
      gravados: linhas.length,
      casados: linhas.length - semCasar.length,
      // Quem está na WE mas não na nossa base — normalmente já foi desligado.
      nao_encontrados: semCasar.map(l => l.nome || l.cpf).slice(0, 50),
      total_passagens: linhas.reduce((s, l) => s + l.quantidade, 0),
    })
  } catch (err) {
    console.error('[vt passagens POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE — limpa as passagens da competência (para reimportar do zero). */
export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireAnyRoleApi(['master', 'gestor_rh'])
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const competencia = String(body.competencia ?? '')
    if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Competência inválida.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('vt_passagens').delete().eq('competencia', competencia)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[vt passagens DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
