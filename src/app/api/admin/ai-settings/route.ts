import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireAnyPermissionApi } from '@/lib/auth-guard'
import { Permission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/admin/ai-settings
 *
 * Grava campos da linha única de `ai_settings`. Substitui as escritas que cinco
 * telas faziam direto do navegador — o que dependia da policy
 * `ALL/authenticated/USING(true)` e, na prática, deixava QUALQUER conta logada
 * reescrever o prompt da análise e os dados da empresa.
 *
 * A autorização é POR CAMPO: cada campo declara quais permissões bastam para
 * gravá-lo, e campo fora desta lista é recusado. O mesmo campo pode ter duas
 * permissões porque é editado em duas telas diferentes — `analysis_prompt`, por
 * exemplo, aparece em Configurações → Empresa e em Configurações → IA. A lista
 * reproduz exatamente quem já conseguia gravar cada coisa antes, para ninguém
 * perder acesso nesta troca.
 */
const CAMPO_PERMISSOES: Record<string, Permission[]> = {
  // Ordem das colunas do quadro: salva tanto pelo arrastar no próprio quadro de
  // candidatos quanto pela tela de configuração das colunas.
  kanban_column_order: ['candidatos.ver', 'config.kanban'],

  // Cadastro jurídico da empresa.
  apelido:              ['config.empresa_cadastro'],
  cnpj:                 ['config.empresa_cadastro'],
  razao_social:         ['config.empresa_cadastro'],
  endereco_logradouro:  ['config.empresa_cadastro'],
  endereco_numero:      ['config.empresa_cadastro'],
  endereco_complemento: ['config.empresa_cadastro'],
  endereco_bairro:      ['config.empresa_cadastro'],
  endereco_cidade:      ['config.empresa_cadastro'],
  endereco_estado:      ['config.empresa_cadastro'],
  endereco_cep:         ['config.empresa_cadastro'],

  // Identidade e cultura.
  company_name:            ['config.empresa_cultura'],
  logo_url:                ['config.empresa_cultura'],
  company_culture:         ['config.empresa_cultura'],
  ideal_candidate_profile: ['config.empresa_cultura'],
  desired_behaviors:       ['config.empresa_cultura'],
  alert_behaviors:         ['config.empresa_cultura'],

  // Missão e visão aparecem nas duas telas.
  mission: ['config.empresa_cultura', 'config.ia'],
  vision:  ['config.empresa_cultura', 'config.ia'],

  // Comportamento da IA: tela de Empresa e tela de IA.
  analysis_prompt:     ['config.ia', 'config.empresa_cultura'],
  culture_weight:      ['config.ia', 'config.empresa_cultura'],
  experience_weight:   ['config.ia', 'config.empresa_cultura'],
  availability_weight: ['config.ia', 'config.empresa_cultura'],
}

/** Pesos vão de 0 a 1; o resto passa como veio. `0` é um peso válido. */
function pesoValido(v: unknown): boolean {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 1
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const campos = Object.keys(body)
    if (campos.length === 0) {
      return NextResponse.json({ error: 'Nada para salvar.' }, { status: 400 })
    }

    const desconhecidos = campos.filter(c => !(c in CAMPO_PERMISSOES))
    if (desconhecidos.length > 0) {
      return NextResponse.json(
        { error: `Campo não permitido: ${desconhecidos.join(', ')}` },
        { status: 400 },
      )
    }

    // Precisa de permissão para CADA campo enviado, não só para um deles.
    for (const campo of campos) {
      const denied = await requireAnyPermissionApi(CAMPO_PERMISSOES[campo])
      if (denied) return denied
    }

    for (const peso of ['culture_weight', 'experience_weight', 'availability_weight']) {
      if (peso in body && !pesoValido(body[peso])) {
        return NextResponse.json({ error: 'Peso deve ficar entre 0 e 1.' }, { status: 400 })
      }
    }

    const supabase = await createSupabaseServiceClient()
    const payload = { ...body, updated_at: new Date().toISOString() }

    // `ai_settings` é uma linha só: atualiza a existente ou cria a primeira.
    const { data: atual } = await supabase.from('ai_settings').select('id').limit(1).maybeSingle()
    const { error } = atual?.id
      ? await supabase.from('ai_settings').update(payload).eq('id', atual.id)
      : await supabase.from('ai_settings').insert(payload)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[ai-settings PATCH]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
