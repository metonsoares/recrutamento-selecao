import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireAnyRoleApi } from '@/lib/auth-guard'

/**
 * PATCH — corrige a data de nascimento do colaborador. Master e Gestor RH.
 *
 * A data mora na resposta do formulário (pergunta de field_type 'date'), que é
 * de onde a ficha e o Kanban leem a idade — por isso a correção é feita ali, e
 * não numa coluna nova que ninguém leria.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireAnyRoleApi(['master', 'gestor_rh'])
    if (denied) return denied

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const data = String(body.birth_date ?? '').trim()

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json({ error: 'Informe a data no formato dia/mês/ano.' }, { status: 400 })
    }
    // Comparação por texto: a data é pura (sem fuso), e 'YYYY-MM-DD' ordena
    // lexicograficamente igual à ordem cronológica.
    const hoje = new Date().toISOString().slice(0, 10)
    if (data > hoje) {
      return NextResponse.json({ error: 'A data de nascimento não pode ser no futuro.' }, { status: 400 })
    }
    if (data < '1900-01-01') {
      return NextResponse.json({ error: 'Data de nascimento fora do intervalo esperado.' }, { status: 400 })
    }

    const service = await createSupabaseServiceClient()

    // A ficha lê as respostas da candidatura atual — é essa que precisa mudar.
    const { data: app } = await service
      .from('applications').select('id')
      .eq('candidate_id', id).eq('is_latest', true).maybeSingle()
    if (!app?.id) {
      return NextResponse.json({ error: 'Candidatura atual não encontrada.' }, { status: 404 })
    }

    // Consultas simples e cruzamento em memória: embeds !inner do PostgREST já
    // falharam silenciosamente neste projeto.
    // Há mais de uma pergunta de data no banco (formulários antigos). A que
    // vale é a ativa do formulário de currículo — a mesma que a ficha lê.
    const { data: perguntasData } = await service
      .from('form_questions').select('id, is_active, sort_order')
      .eq('field_type', 'date').eq('form_type', 'curriculo')
      .order('is_active', { ascending: false }).order('sort_order')
    const perguntas = perguntasData ?? []
    if (perguntas.length === 0) {
      return NextResponse.json({ error: 'O formulário não tem campo de data de nascimento.' }, { status: 400 })
    }
    const idsPergunta = perguntas.map(q => q.id as string)

    const { data: existente } = await service
      .from('form_answers').select('id')
      .eq('application_id', app.id).in('question_id', idsPergunta)
      .limit(1).maybeSingle()

    const valor = JSON.stringify(data)   // guardado como texto JSON, igual às demais respostas

    if (existente?.id) {
      const { error } = await service.from('form_answers')
        .update({ answer_text: valor }).eq('id', existente.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      // Sem resposta ainda: cria na primeira pergunta ativa de data.
      const { error } = await service.from('form_answers')
        .insert({ application_id: app.id, question_id: perguntas[0].id, answer_text: valor })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await service.from('candidates').update({ updated_at: new Date().toISOString() }).eq('id', id)

    return NextResponse.json({ ok: true, birth_date: data })
  } catch (err) {
    console.error('[candidato nascimento PATCH]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
