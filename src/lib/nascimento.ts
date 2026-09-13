import { createSupabaseServiceClient } from '@/lib/supabase-server'

type Servico = Awaited<ReturnType<typeof createSupabaseServiceClient>>

/** Respostas do formulário são gravadas como JSON.stringify(valor). */
function parseTexto(v: string | null): string | null {
  if (!v) return null
  try {
    const p = JSON.parse(v)
    return typeof p === 'string' ? p : null
  } catch { return v }
}

/**
 * Data de nascimento de cada candidatura (`application_id → yyyy-mm-dd`).
 *
 * Não há coluna de nascimento: ela é a resposta de uma pergunta do tipo data
 * do formulário. Vale a primeira resposta válida. Relatórios (aba
 * Aniversariantes) e o quadro do mês no Dashboard leem daqui, para contarem
 * as mesmas pessoas.
 *
 * Consultas simples e cruzamento em memória: embeds !inner do PostgREST já
 * falharam silenciosamente neste projeto.
 */
export async function nascimentosPorApp(service: Servico, appIds: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (!appIds.length) return mapa

  const { data: perguntas } = await service.from('form_questions').select('id').eq('field_type', 'date')
  const idsPergunta = (perguntas ?? []).map(q => q.id as string)
  if (!idsPergunta.length) return mapa

  const { data: respostas } = await service.from('form_answers')
    .select('application_id, answer_text')
    .in('question_id', idsPergunta)
    .in('application_id', appIds)

  for (const r of respostas ?? []) {
    const d = parseTexto(r.answer_text as string | null)
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !mapa.has(r.application_id as string)) {
      mapa.set(r.application_id as string, d)
    }
  }
  return mapa
}
