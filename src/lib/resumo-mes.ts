import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { mesCorrente, fimDoMes } from '@/lib/competencia'
import { situacaoFerias, FeriasRegistro } from '@/lib/ferias'
import { nascimentosPorApp } from '@/lib/nascimento'

/**
 * Números do mês corrente para o quadro do Dashboard.
 *
 * Cada número segue a MESMA regra da tela onde ele é detalhado, para o quadro
 * nunca contradizer a aba que a pessoa abre em seguida:
 *   - férias vencendo → situacaoFerias (Relatórios → Férias)
 *   - aniversariantes → nascimentosPorApp (Relatórios → Aniversariantes)
 *
 * Datas do mês em São Paulo: o servidor da Vercel roda em UTC, e um cadastro
 * feito às 22h do dia 30 cairia no mês seguinte sem o deslocamento.
 */

export interface ResumoMes {
  competencia: string
  novosCandidatos: number
  contratados: { admitidos: number; ativos: number }
  intermitentes: { admitidos: number; ativos: number }
  /** Freelancer não tem data de entrada: só dá para contar quantos existem hoje. */
  freelancers: number
  faltas: { registros: number; dias: number; pessoas: number }
  feriasVencendo: { noMes: number; jaVencidas: number }
  aniversariantes: number
}

/** Brasil sem horário de verão desde 2019: São Paulo é UTC-3 o ano todo. */
const FUSO_SP = '-03:00'

export async function resumoDoMes(): Promise<ResumoMes> {
  const service = await createSupabaseServiceClient()
  const competencia = mesCorrente()
  const inicio = competencia
  const fim = fimDoMes(competencia)
  const noMes = (d: string | null | undefined) => !!d && d.slice(0, 10) >= inicio && d.slice(0, 10) <= fim

  const [{ count: novos }, { data: apps }, { data: faltas }] = await Promise.all([
    service.from('candidates')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .gte('created_at', `${inicio}T00:00:00${FUSO_SP}`)
      .lte('created_at', `${fim}T23:59:59.999${FUSO_SP}`),
    service.from('applications')
      .select('id, candidate_id, status, admissao:admission_form->>admission_date')
      .eq('is_latest', true)
      .in('status', ['contratado', 'em_contrato', 'aprovado', 'freelancer']),
    service.from('absences')
      .select('candidate_id, days')
      .gte('absence_date', inicio)
      .lte('absence_date', fim),
  ])

  // Candidato excluído não conta, igual aos cards de status.
  const candIds = [...new Set((apps ?? []).map(a => a.candidate_id as string))]
  const { data: excluidos } = candIds.length
    ? await service.from('candidates').select('id').in('id', candIds).not('deleted_at', 'is', null)
    : { data: [] as { id: string }[] }
  const fora = new Set((excluidos ?? []).map(c => c.id as string))

  const lista = (apps ?? [])
    .filter(a => !fora.has(a.candidate_id as string))
    .map(a => ({
      id: a.id as string,
      candidate_id: a.candidate_id as string,
      status: a.status as string,
      admissao: (a.admissao as string | null) || null,
    }))

  const doStatus = (s: string) => lista.filter(a => a.status === s)
  const contratados = doStatus('contratado')
  const intermitentes = doStatus('aprovado')

  // ── Férias: mesma base da aba Férias (intermitente não tem período aquisitivo) ──
  const baseFerias = lista.filter(a => a.status === 'contratado' || a.status === 'em_contrato')
  const { data: feriasData } = baseFerias.length
    ? await service.from('vacations')
        .select('candidate_id, start_date, end_date, kind')
        .in('candidate_id', baseFerias.map(a => a.candidate_id))
    : { data: [] as { candidate_id: string; start_date: string; end_date: string; kind: string }[] }

  const feriasPorCand = new Map<string, FeriasRegistro[]>()
  for (const f of feriasData ?? []) {
    const id = f.candidate_id as string
    const arr = feriasPorCand.get(id) ?? []
    arr.push({
      candidate_id: id,
      inicio: f.start_date as string,
      fim: f.end_date as string,
      tipo: (f.kind as string) === 'solicitacao' ? 'solicitacao' : 'historico',
    })
    feriasPorCand.set(id, arr)
  }

  let feriasNoMes = 0
  let feriasJaVencidas = 0
  for (const a of baseFerias) {
    const s = situacaoFerias(a.admissao, feriasPorCand.get(a.candidate_id) ?? [])
    if (!s.limite || (s.status !== 'agendar' && s.status !== 'vencida')) continue
    if (noMes(s.limite)) feriasNoMes++
    else if (s.limite < inicio) feriasJaVencidas++
  }

  // ── Aniversariantes: contratados e intermitentes ──
  const baseAniversario = [...contratados, ...intermitentes]
  const nascimentos = await nascimentosPorApp(service, baseAniversario.map(a => a.id))
  const mesAtual = inicio.slice(5, 7)
  const aniversariantes = baseAniversario
    .filter(a => nascimentos.get(a.id)?.slice(5, 7) === mesAtual).length

  const listaFaltas = faltas ?? []

  return {
    competencia,
    novosCandidatos: novos ?? 0,
    contratados: { admitidos: contratados.filter(a => noMes(a.admissao)).length, ativos: contratados.length },
    intermitentes: { admitidos: intermitentes.filter(a => noMes(a.admissao)).length, ativos: intermitentes.length },
    freelancers: doStatus('freelancer').length,
    faltas: {
      registros: listaFaltas.length,
      dias: listaFaltas.reduce((s, f) => s + (Number(f.days) || 1), 0),
      pessoas: new Set(listaFaltas.map(f => f.candidate_id as string)).size,
    },
    feriasVencendo: { noMes: feriasNoMes, jaVencidas: feriasJaVencidas },
    aniversariantes,
  }
}
