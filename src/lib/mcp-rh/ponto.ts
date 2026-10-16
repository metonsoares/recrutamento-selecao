import 'server-only'
import { abrirSessaoRhid, cpfNormalizado, rhidLeitura, type SessaoRhid } from '@/lib/rhid'

/**
 * Ponto (RHiD) para a ponte do ChatGPT — leitura, consolidação e evidências.
 *
 * Fontes, sempre separadas na resposta:
 *  (1) escala prevista ........ person_day_shift (horário do dia) e
 *                               horasUteis da apuração (minutos previstos)
 *  (2) marcações originais .... espelho.afdt (batidas do relógio/app)
 *  (3) marcações tratadas ..... espelho.acjef.horariosEspelho e afdtNaoOriginal
 *                               (incluídas manualmente)
 *  (4) horas apuradas ......... apuracao_ponto_salva_tabela (cálculo do RHiD)
 *
 * Unidade dos campos de horas do RHiD: MINUTOS (os sufixos _MultiplicadoNot/
 * _MultiplicadoEx são os mesmos minutos já multiplicados pelo fator de hora
 * noturna reduzida / percentual configurado no RHiD).
 *
 * Os "indícios" calculados aqui são EVIDÊNCIA para análise, nunca conclusão
 * de infração: acordo de compensação, escala 12x36, convenção coletiva e
 * cargo de confiança podem mudar a regra.
 */

type Json = Record<string, unknown>

const JANELA_MAX = 31
export const MAX_DIAS = 93

export class ContextoRhid {
  private sessao: Promise<SessaoRhid> | null = null
  private pessoas: Promise<Json[]> | null = null

  async s(): Promise<SessaoRhid> {
    this.sessao ??= abrirSessaoRhid()
    return this.sessao
  }

  /** id do RHiD a partir do CPF (lista carregada uma vez por chamada). */
  async idPorCpf(cpf: string): Promise<{ id: number; matricula: string | null; status: number } | null> {
    this.pessoas ??= this.s().then(async s => {
      const r = await rhidLeitura(s, 'GET', 'customerdb/person.svc/a_resumido') as { data?: Json[] } | Json[] | null
      return (Array.isArray(r) ? r : Array.isArray(r?.data) ? r!.data! : []) as Json[]
    })
    const p = (await this.pessoas).find(x => cpfNormalizado(x.cpf) === cpf)
    return p ? { id: Number(p.id), matricula: p.register == null ? null : String(p.register), status: Number(p.status ?? 0) } : null
  }
}

/** Janelas alinhadas ao mês (o espelho do RHiD identifica o dia só pelo dia do mês). */
export function janelasMensais(ini: string, fim: string): { ini: string; fim: string; ano: number; mes: number }[] {
  const d0 = new Date(`${ini}T12:00:00Z`)
  const d1 = new Date(`${fim}T12:00:00Z`)
  const dias = Math.round((d1.getTime() - d0.getTime()) / 864e5)
  if (dias < 0) throw new Error('A data final é anterior à inicial.')
  if (dias > MAX_DIAS) throw new Error(`Período máximo de ${MAX_DIAS} dias por consulta.`)
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '') // data de calendário
  const out: { ini: string; fim: string; ano: number; mes: number }[] = []
  let a = d0
  while (a <= d1) {
    const fimMes = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0, 12))
    const b = new Date(Math.min(fimMes.getTime(), d1.getTime(), a.getTime() + (JANELA_MAX - 1) * 864e5))
    out.push({ ini: fmt(a), fim: fmt(b), ano: a.getUTCFullYear(), mes: a.getUTCMonth() + 1 })
    a = new Date(b.getTime() + 864e5)
  }
  return out
}

export function hhmm(min: number | null | undefined): string | null {
  if (min == null || !Number.isFinite(min)) return null
  const s = min < 0 ? '-' : ''
  const m = Math.round(Math.abs(min))
  return `${s}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** "08:02", "0802", 482 (minutos) → minutos do dia. */
function minutosDaHora(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v ?? '').trim()
  let m = s.match(/(\d{1,2}):(\d{2})/)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  m = s.match(/^(\d{2})(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function dataDe(v: unknown): string | null {
  const s = String(v ?? '')
  const m = s.match(/(\d{4})-?(\d{2})-?(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// ---------------------------------------------------------------------------
// Leituras cruas
// ---------------------------------------------------------------------------
export async function lerApuracao(ctx: ContextoRhid, idRhid: number, ini: string, fim: string): Promise<Json[]> {
  const s = await ctx.s()
  const dias: Json[] = []
  for (const j of janelasMensais(ini, fim)) {
    const r = await rhidLeitura(s, 'POST', 'report.svc/apuracao_ponto_salva_tabela', {
      body: { idPerson: [idRhid], ini: j.ini, fim: j.fim, afdChanges: [] },
      timeoutMs: 90000,
    })
    if (Array.isArray(r)) dias.push(...(r as Json[]))
  }
  return dias
}

export async function lerEspelhos(ctx: ContextoRhid, idRhid: number, ini: string, fim: string) {
  const s = await ctx.s()
  const out: { janela: { ini: string; fim: string; ano: number; mes: number }; espelho: Json }[] = []
  for (const j of janelasMensais(ini, fim)) {
    const r = await rhidLeitura(s, 'POST', 'report.svc/espelhoponto/', {
      params: { idPerson: String(idRhid), ini: j.ini, fim: j.fim },
      body: {},
      timeoutMs: 90000,
    })
    out.push({ janela: j, espelho: (r ?? {}) as Json })
  }
  return out
}

export async function lerEscalaDiaria(ctx: ContextoRhid, idRhid: number, ini: string, fim: string): Promise<unknown[]> {
  const s = await ctx.s()
  const out: unknown[] = []
  for (const j of janelasMensais(ini, fim)) {
    const r = await rhidLeitura(s, 'GET', 'customerdb/person.svc/person_day_shift', {
      params: { ini: j.ini, fim: j.fim, people: `-1,${idRhid}` },
    })
    out.push({ janela: { ini: j.ini, fim: j.fim }, escala: r })
  }
  return out
}

export async function lerSaldoBanco(ctx: ContextoRhid, idRhid: number, dataAAAAMMDD: string): Promise<number | null> {
  const s = await ctx.s()
  const r = await rhidLeitura(s, 'GET', `customerdb/person.svc/person_banco_horas`, {
    params: { date: dataAAAAMMDD, people: String(idRhid) },
  }).catch(() => null)
  const lista = (Array.isArray(r) ? r : Array.isArray((r as Json)?.data) ? (r as Json).data : []) as Json[]
  const p = lista.find(x => Number(x.idPerson ?? x.id) === idRhid) ?? lista[0]
  if (!p || p.saldoBancoHoras == null) return null
  return n(p.saldoBancoHoras)
}

// ---------------------------------------------------------------------------
// Consolidação por dia
// ---------------------------------------------------------------------------
export interface DiaPonto {
  data: string
  dia_semana: string
  folga: boolean
  feriado: boolean
  previsto_min: number
  trabalhado_min: number
  extra_diurna_min: number
  extra_noturna_min: number
  extra_interjornada_min: number
  extra_intervalo_min: number
  extras_total_min: number
  extras_por_percentual: { percentual: number | string; minutos: number }[]
  noturno_total_min: number
  noturno_total_reduzido_min: number
  atraso_min: number
  saida_antecipada_min: number
  falta_dia_inteiro: boolean
  ausente_min: number
  pulou_intervalo: boolean
  saldo_banco_fim_dia_min: number | null
  pendencias_rhid: boolean
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function consolidarApuracao(linhas: Json[]): DiaPonto[] {
  return linhas.map(l => {
    const data = dataDe(l.dateTimeStr ?? l.date) ?? '?'
    const pcts = (Array.isArray(l.percentuaisExtra) ? l.percentuaisExtra : []) as unknown[]
    const valores = (Array.isArray(l.horaExtraDeCadaPercentual) ? l.horaExtraDeCadaPercentual : []) as unknown[]
    const holiday = l.holiday as Json | null | undefined
    return {
      data,
      dia_semana: data === '?' ? '?' : SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()],
      folga: l.folga === true,
      feriado: n(l.isHoliday) > 0 || (holiday != null && holiday.excluded !== true && holiday.folga !== true && l.folga !== true),
      previsto_min: n(l.horasUteis),
      trabalhado_min: n(l.totalHorasTrabalhadas),
      extra_diurna_min: n(l.extraDiurna),
      extra_noturna_min: n(l.extraNoturna),
      extra_interjornada_min: n(l.extraInterjornada),
      extra_intervalo_min: n(l.horasExtraIntervalo),
      extras_total_min: n(l.horasExtrasCalculadas),
      extras_por_percentual: valores.map((v, i) => ({ percentual: (pcts[i] as number | string) ?? `faixa ${i + 1}`, minutos: n(v) })).filter(x => x.minutos),
      noturno_total_min: n(l.horasTotalNoturno),
      noturno_total_reduzido_min: n(l.horasTotalNoturno_MultiplicadoNot),
      atraso_min: n(l.atrasoEntrada ?? l.apenasAtraso),
      saida_antecipada_min: n(l.saidaAntecipada),
      falta_dia_inteiro: l.faltaDiaInteiro === true,
      ausente_min: n(l.horasAusentes ?? l.horasFaltaAtraso),
      pulou_intervalo: n(l.pulouAlmoco) > 0,
      saldo_banco_fim_dia_min: l.saldoBancoFinalDia == null ? null : n(l.saldoBancoFinalDia),
      pendencias_rhid: l.possuiPendencias === true,
    }
  })
}

export function somar(dias: DiaPonto[]) {
  const soma = (k: keyof DiaPonto) => dias.reduce((s, d) => s + (typeof d[k] === 'number' ? (d[k] as number) : 0), 0)
  const porPct = new Map<string, number>()
  for (const d of dias) for (const p of d.extras_por_percentual) porPct.set(String(p.percentual), (porPct.get(String(p.percentual)) ?? 0) + p.minutos)
  const t = {
    dias_no_periodo: dias.length,
    dias_trabalhados: dias.filter(d => d.trabalhado_min > 0).length,
    folgas: dias.filter(d => d.folga).length,
    faltas_dia_inteiro: dias.filter(d => d.falta_dia_inteiro).length,
    domingos_trabalhados: dias.filter(d => d.dia_semana === 'domingo' && d.trabalhado_min > 0).length,
    feriados_trabalhados: dias.filter(d => d.feriado && d.trabalhado_min > 0).length,
    previsto_min: soma('previsto_min'),
    trabalhado_min: soma('trabalhado_min'),
    extras_total_min: soma('extras_total_min'),
    extra_diurna_min: soma('extra_diurna_min'),
    extra_noturna_min: soma('extra_noturna_min'),
    extra_interjornada_min: soma('extra_interjornada_min'),
    extra_intervalo_min: soma('extra_intervalo_min'),
    noturno_total_min: soma('noturno_total_min'),
    noturno_total_reduzido_min: soma('noturno_total_reduzido_min'),
    atraso_min: soma('atraso_min'),
    saida_antecipada_min: soma('saida_antecipada_min'),
    ausente_min: soma('ausente_min'),
    extras_por_percentual: [...porPct].map(([percentual, minutos]) => ({ percentual, minutos, hhmm: hhmm(minutos) })),
  }
  return {
    ...t,
    em_horas: Object.fromEntries(Object.entries(t).filter(([k]) => k.endsWith('_min')).map(([k, v]) => [k.replace(/_min$/, ''), hhmm(v as number)])),
  }
}

/** Soma por semana (segunda a domingo). */
export function porSemana(dias: DiaPonto[]) {
  const grupos = new Map<string, DiaPonto[]>()
  for (const d of dias) {
    if (d.data === '?') continue
    const dt = new Date(`${d.data}T12:00:00Z`)
    const seg = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10)
    if (!grupos.has(seg)) grupos.set(seg, [])
    grupos.get(seg)!.push(d)
  }
  return [...grupos].map(([inicio, ds]) => {
    const s = somar(ds)
    return {
      semana_inicio: inicio,
      dias_trabalhados: s.dias_trabalhados,
      trabalhado: s.em_horas.trabalhado,
      previsto: s.em_horas.previsto,
      extras: s.em_horas.extras_total,
      trabalhado_min: s.trabalhado_min,
      extras_total_min: s.extras_total_min,
    }
  })
}

// ---------------------------------------------------------------------------
// Marcações por dia (espelho) e evidências
// ---------------------------------------------------------------------------
export interface MarcacoesDia {
  data: string
  originais: string[]
  tratadas: string[]
  incluidas_manualmente: string[]
}

function hora(v: unknown): string | null {
  const m = minutosDaHora(v)
  return m == null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function marcacoesPorDia(espelhos: Awaited<ReturnType<typeof lerEspelhos>>): MarcacoesDia[] {
  const mapa = new Map<string, MarcacoesDia>()
  for (const { janela, espelho } of espelhos) {
    const dataDoDia = (dia: unknown) => `${janela.ano}-${String(janela.mes).padStart(2, '0')}-${String(n(dia)).padStart(2, '0')}`
    const pega = (data: string) => {
      if (!mapa.has(data)) mapa.set(data, { data, originais: [], tratadas: [], incluidas_manualmente: [] })
      return mapa.get(data)!
    }
    for (const a of (Array.isArray(espelho.afdt) ? espelho.afdt : []) as Json[]) {
      const h = hora(a.hora)
      if (h && n(a.dia)) pega(dataDoDia(a.dia)).originais.push(h)
    }
    for (const a of (Array.isArray(espelho.acjef) ? espelho.acjef : []) as Json[]) {
      if (!n(a.dia)) continue
      const d = pega(dataDoDia(a.dia))
      for (const h of (Array.isArray(a.horariosEspelho) ? a.horariosEspelho : []) as unknown[]) {
        const hh = hora(h)
        if (hh) d.tratadas.push(hh)
      }
      for (const x of (Array.isArray(a.afdtNaoOriginal) ? a.afdtNaoOriginal : []) as Json[]) {
        const hh = hora(x.hora ?? x)
        if (hh) d.incluidas_manualmente.push(hh)
      }
    }
  }
  const ord = (a: string, b: string) => a.localeCompare(b)
  return [...mapa.values()]
    .map(d => ({ ...d, originais: d.originais.sort(ord), tratadas: d.tratadas.sort(ord), incluidas_manualmente: d.incluidas_manualmente.sort(ord) }))
    .sort((a, b) => a.data.localeCompare(b.data))
}

const REGRAS = {
  intervalo: 'CLT art. 71: jornada acima de 6h exige intervalo mínimo de 1h (redução só por convenção/acordo coletivo — art. 611-A, III, mín. 30 min).',
  interjornada: 'CLT art. 66: mínimo de 11h consecutivas entre duas jornadas.',
  descanso_semanal: 'CLT art. 67 e Lei 605/49: descanso semanal de 24h consecutivas, preferencialmente aos domingos; trabalho no 7º dia seguido merece verificação.',
  domingo: 'Lei 10.101/2000 art. 6º (comércio): repouso deve coincidir com domingo ao menos uma vez a cada 3 semanas — verificar CCT do setor.',
  jornada: 'CF art. 7º XIII e CLT art. 58/59: 8h diárias e 44h semanais; extras limitadas a 2h/dia, salvo regime de compensação válido.',
  noturno: 'CLT art. 73: trabalho entre 22h e 5h, hora noturna de 52min30s e adicional mínimo de 20% (urbano); percentual maior pode vir da CCT.',
}

export function evidencias(dias: DiaPonto[], marcas: MarcacoesDia[]) {
  const porData = new Map(marcas.map(m => [m.data, m]))
  const indicios: { data: string; tipo: string; detalhe: string; regra: string }[] = []
  let consecutivos = 0
  let anteriorFim: { data: string; min: number } | null = null
  const domingosPorSemana: string[] = []

  for (const d of [...dias].sort((a, b) => a.data.localeCompare(b.data))) {
    const m = porData.get(d.data)
    const batidas = (m?.originais.length ? m.originais : m?.tratadas ?? []).map(h => minutosDaHora(h)!).filter(x => x != null)
    const trabalhou = d.trabalhado_min > 0 || batidas.length >= 2

    if (trabalhou) consecutivos++
    else consecutivos = 0
    if (consecutivos === 7) {
      indicios.push({ data: d.data, tipo: 'setimo_dia_consecutivo', detalhe: '7º dia seguido com trabalho registrado.', regra: REGRAS.descanso_semanal })
    }
    if (d.dia_semana === 'domingo') domingosPorSemana.push(trabalhou ? 'T' : 'F')

    if (batidas.length >= 2) {
      // Intervalo = maior pausa entre pares (saída → próxima entrada).
      let maiorPausa = 0
      for (let i = 1; i + 1 < batidas.length; i += 2) maiorPausa = Math.max(maiorPausa, batidas[i + 1] - batidas[i])
      const jornadaBruta = batidas[batidas.length - 1] - batidas[0]
      if (d.trabalhado_min > 360 && (batidas.length < 4 || maiorPausa < 60)) {
        indicios.push({
          data: d.data,
          tipo: 'intervalo_intrajornada',
          detalhe: batidas.length < 4
            ? `Trabalhou ${hhmm(d.trabalhado_min)} com ${batidas.length} marcação(ões): intervalo não registrado.`
            : `Trabalhou ${hhmm(d.trabalhado_min)} com maior pausa de ${hhmm(maiorPausa)}.`,
          regra: REGRAS.intervalo,
        })
      }
      if (d.trabalhado_min > 600) {
        indicios.push({ data: d.data, tipo: 'jornada_acima_10h', detalhe: `Trabalhado ${hhmm(d.trabalhado_min)} no dia.`, regra: REGRAS.jornada })
      }
      if (anteriorFim) {
        const gap = (new Date(`${d.data}T12:00:00Z`).getTime() - new Date(`${anteriorFim.data}T12:00:00Z`).getTime()) / 6e4 - anteriorFim.min + batidas[0]
        if (gap > 0 && gap < 660) {
          indicios.push({ data: d.data, tipo: 'interjornada_menor_11h', detalhe: `Descanso de ${hhmm(gap)} desde a última saída de ${anteriorFim.data}.`, regra: REGRAS.interjornada })
        }
      }
      anteriorFim = { data: d.data, min: batidas[0] + jornadaBruta }
    }
  }
  // Domingos: 3 seguidos trabalhados.
  for (let i = 2; i < domingosPorSemana.length; i++) {
    if (domingosPorSemana[i] === 'T' && domingosPorSemana[i - 1] === 'T' && domingosPorSemana[i - 2] === 'T') {
      indicios.push({ data: '-', tipo: 'domingos_seguidos', detalhe: '3 domingos seguidos com trabalho no período.', regra: REGRAS.domingo })
      break
    }
  }
  return { indicios, regras_de_referencia: REGRAS }
}
