import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { situacaoFerias, FeriasRegistro, hoje, paraData, formatarData, somarDias, diasEntre } from '@/lib/ferias'
import { nascimentosPorApp } from '@/lib/nascimento'

type Servico = Awaited<ReturnType<typeof createSupabaseServiceClient>>

/**
 * Avisos do sino.
 *
 * Os de PRAZO são recalculados a cada abertura do sino e gravados por `chave`
 * única: recalcular não duplica, e o que já foi lido continua lido. O aviso de
 * documento recebido pelo link externo nasce na hora do envio (rota pública),
 * porque nada nos dados diria depois que ele chegou "agora".
 *
 * Prazos combinados com o dono: férias 40 dias antes do limite para agendar,
 * documento da empresa 7 dias antes de vencer, aniversário no dia e contrato de
 * experiência 7 dias antes de cada etapa.
 */

export const DIAS_FERIAS = 40
export const DIAS_DOC_EMPRESA = 7
export const DIAS_EXPERIENCIA = 7

export interface NotificacaoNova {
  tipo: 'documento_enviado' | 'ferias' | 'doc_empresa' | 'aniversario' | 'experiencia'
  chave: string
  titulo: string
  descricao?: string
  url?: string
  candidate_id?: string | null
}

/** "45 + 45 dias" → [45, 90]: cada etapa do contrato tem seu próprio fim. */
function etapasExperiencia(contrato: string | null): number[] {
  const partes = (contrato?.match(/\d+/g) ?? []).map(Number).filter(n => n > 0)
  const etapas: number[] = []
  let soma = 0
  for (const p of partes) { soma += p; etapas.push(soma) }
  return etapas
}

function primeiroNome(nome: string): string {
  return String(nome ?? '').trim().split(' ')[0] ?? ''
}

/** Monta a lista de avisos de prazo que valem hoje. */
export async function calcularAvisosDePrazo(service: Servico): Promise<NotificacaoNova[]> {
  const hj = hoje()
  const hojeIso = `${hj.getFullYear()}-${String(hj.getMonth() + 1).padStart(2, '0')}-${String(hj.getDate()).padStart(2, '0')}`
  const avisos: NotificacaoNova[] = []

  // ── Colaboradores ativos e a ficha de cada um ──
  const { data: apps } = await service
    .from('applications')
    .select('id, candidate_id, status, admissao:admission_form->>admission_date, experiencia:admission_form->>trial_contract')
    .eq('is_latest', true)
    .in('status', ['contratado', 'em_contrato', 'aprovado'])

  const lista = (apps ?? []).map(a => ({
    appId: a.id as string,
    candidateId: a.candidate_id as string,
    status: a.status as string,
    admissao: (a.admissao as string | null) || null,
    experiencia: (a.experiencia as string | null) || null,
  }))

  const ids = [...new Set(lista.map(l => l.candidateId))]
  const { data: cands } = ids.length
    ? await service.from('candidates').select('id, full_name, deleted_at').in('id', ids)
    : { data: [] as { id: string; full_name: string; deleted_at: string | null }[] }
  const nomePorId = new Map((cands ?? []).filter(c => !c.deleted_at).map(c => [c.id as string, c.full_name as string]))
  const ativos = lista.filter(l => nomePorId.has(l.candidateId))

  // ── Férias: 40 dias antes do prazo para agendar ──
  // Intermitente fica de fora: sem jornada contínua não corre período aquisitivo.
  const baseFerias = ativos.filter(l => l.status === 'contratado' || l.status === 'em_contrato')
  const { data: vacs } = baseFerias.length
    ? await service.from('vacations').select('candidate_id, start_date, end_date, kind')
        .in('candidate_id', baseFerias.map(l => l.candidateId))
    : { data: [] as { candidate_id: string; start_date: string; end_date: string; kind: string }[] }

  const feriasPorCand = new Map<string, FeriasRegistro[]>()
  for (const v of vacs ?? []) {
    const id = v.candidate_id as string
    const arr = feriasPorCand.get(id) ?? []
    arr.push({
      candidate_id: id,
      inicio: v.start_date as string,
      fim: v.end_date as string,
      tipo: (v.kind as string) === 'solicitacao' ? 'solicitacao' : 'historico',
    })
    feriasPorCand.set(id, arr)
  }

  for (const l of baseFerias) {
    const s = situacaoFerias(l.admissao, feriasPorCand.get(l.candidateId) ?? [])
    if (!s.limite) continue
    const dias = diasEntre(hj, paraData(s.limite))
    if (dias > DIAS_FERIAS) continue
    const nome = nomePorId.get(l.candidateId) ?? 'Colaborador'
    avisos.push({
      tipo: 'ferias',
      // O limite entra na chave: passou para o próximo período, é outro aviso.
      chave: `ferias:${l.candidateId}:${s.limite}`,
      titulo: dias < 0 ? `Férias vencidas: ${nome}` : `Férias a vencer: ${nome}`,
      descricao: dias < 0
        ? `O prazo para agendar venceu em ${formatarData(s.limite)}.`
        : `Agendar até ${formatarData(s.limite)} — faltam ${dias} dia${dias === 1 ? '' : 's'}.`,
      url: `/admin/candidatos/${l.candidateId}?tab=ferias`,
      candidate_id: l.candidateId,
    })
  }

  // ── Contrato de experiência: 7 dias antes de cada etapa ──
  for (const l of ativos) {
    if (!l.admissao || !/^\d{4}-\d{2}-\d{2}$/.test(l.admissao)) continue
    for (const dias of etapasExperiencia(l.experiencia)) {
      const fim = somarDias(l.admissao, dias)
      const faltam = diasEntre(hj, paraData(fim))
      if (faltam < 0 || faltam > DIAS_EXPERIENCIA) continue
      const nome = nomePorId.get(l.candidateId) ?? 'Colaborador'
      avisos.push({
        tipo: 'experiencia',
        chave: `experiencia:${l.candidateId}:${fim}`,
        titulo: `Contrato de experiência vencendo: ${nome}`,
        descricao: `Termina em ${formatarData(fim)} — ${faltam === 0 ? 'é hoje' : `faltam ${faltam} dia${faltam === 1 ? '' : 's'}`}.`,
        url: `/admin/candidatos/${l.candidateId}?tab=ficha`,
        candidate_id: l.candidateId,
      })
    }
  }

  // ── Aniversariantes do dia (contratados e intermitentes) ──
  const baseAniversario = ativos.filter(l => l.status === 'contratado' || l.status === 'aprovado')
  const nascimentos = await nascimentosPorApp(service, baseAniversario.map(l => l.appId))
  for (const l of baseAniversario) {
    const nasc = nascimentos.get(l.appId)
    if (!nasc || nasc.slice(5) !== hojeIso.slice(5)) continue
    const nome = nomePorId.get(l.candidateId) ?? 'Colaborador'
    const idade = Number(hojeIso.slice(0, 4)) - Number(nasc.slice(0, 4))
    avisos.push({
      tipo: 'aniversario',
      chave: `aniversario:${l.candidateId}:${hojeIso.slice(0, 4)}`,
      titulo: `Aniversário hoje: ${nome}`,
      descricao: `${primeiroNome(nome)} completa ${idade} anos.`,
      url: `/admin/candidatos/${l.candidateId}`,
      candidate_id: l.candidateId,
    })
  }

  // ── Documentos da empresa: 7 dias antes de vencer ──
  const limiteDoc = somarDias(hojeIso, DIAS_DOC_EMPRESA)
  // Inclui os JÁ VENCIDOS: só avisar 7 dias antes deixaria de fora justamente
  // os que passaram do prazo, que são os mais urgentes.
  const { data: arquivos } = await service
    .from('company_files').select('id, name, empresa, expires_at, no_expiry')
    .eq('no_expiry', false).not('expires_at', 'is', null)
    .lte('expires_at', limiteDoc)

  for (const f of arquivos ?? []) {
    const venc = f.expires_at as string
    const faltam = diasEntre(hj, paraData(venc))
    const empresa = f.empresa ? `${f.empresa} — ` : ''
    avisos.push({
      tipo: 'doc_empresa',
      chave: `doc_empresa:${f.id}:${venc}`,
      titulo: faltam < 0
        ? `Documento da empresa vencido: ${f.name}`
        : `Documento da empresa vencendo: ${f.name}`,
      descricao: faltam < 0
        ? `${empresa}venceu em ${formatarData(venc)}.`
        : `${empresa}vence em ${formatarData(venc)}${faltam === 0 ? ' (hoje)' : ` — faltam ${faltam} dia${faltam === 1 ? '' : 's'}`}.`,
      url: '/admin/documentos-empresa',
    })
  }

  return avisos
}

/**
 * Grava avisos novos sem duplicar os que já existem.
 * `ignoreDuplicates` faz o banco descartar as chaves repetidas, preservando o
 * que já foi lido.
 */
export async function gravarNotificacoes(service: Servico, avisos: NotificacaoNova[]): Promise<void> {
  if (!avisos.length) return
  await service.from('notificacoes')
    .upsert(avisos.map(a => ({ ...a, candidate_id: a.candidate_id ?? null })), {
      onConflict: 'chave',
      ignoreDuplicates: true,
    })
}
