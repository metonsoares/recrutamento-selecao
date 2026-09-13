/**
 * Regras de férias (CLT) e datas puras usadas por Relatórios e pelo Dashboard.
 *
 * Viviam dentro de relatorios-rh.tsx. Com o quadro do mês no Dashboard contando
 * "férias vencendo", a regra passou a ter dois leitores — e duas cópias da
 * mesma conta divergem (já aconteceu com os helpers de competência). Aqui a
 * regra é única: o número do Dashboard é o mesmo da aba Férias.
 *
 * Datas puras (`yyyy-mm-dd`) são manipuladas como componentes locais; nunca
 * via toISOString, que desloca o dia pelo fuso.
 */

/** Uma linha de `vacations`: férias já gozadas ou agendadas. */
export interface FeriasRegistro {
  candidate_id: string
  inicio: string   // yyyy-mm-dd
  fim: string      // yyyy-mm-dd
  tipo: 'historico' | 'solicitacao'
}

// ─── Datas puras ──────────────────────────────────────────────────────────────

/** Hoje no fuso de São Paulo, zerado (evita erro de um dia por fuso). */
export function hoje(): Date {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
}

export function paraData(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export function somarDias(iso: string, dias: number): string {
  const d = paraData(iso)
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** Meses inteiros entre duas datas puras. */
function mesesEntre(deIso: string, ate: Date): number {
  const de = paraData(deIso)
  let m = (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth())
  if (ate.getDate() < de.getDate()) m--
  return m
}

/** Data pura somando N anos (mantém dia e mês). */
function somarAnos(iso: string, anos: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${a + anos}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function emMeses(dias: number): string {
  if (dias <= 31) return `${dias} dia${dias !== 1 ? 's' : ''}`
  const meses = Math.floor(dias / 30)
  return `${meses} ${meses !== 1 ? 'meses' : 'mês'}`
}

// ─── Férias ───────────────────────────────────────────────────────────────────
// Cada 12 meses de casa fecham um PERÍODO AQUISITIVO; a partir daí a empresa
// tem mais 12 meses (período concessivo) para conceder as férias. A CLT exige
// avisar o colaborador com pelo menos 30 dias de antecedência, então o prazo
// real para AGENDAR é o fim do concessivo menos 30 dias — passou disso, vencidas.

/** Aviso prévio mínimo de férias (CLT art. 135). */
const DIAS_ANTECEDENCIA = 30

export type StatusFerias = 'agendada' | 'agendar' | 'aguardando' | 'vencida' | 'sem_admissao'

export interface SituacaoFerias {
  status: StatusFerias
  /** Coluna "Quanto tempo para tirar férias". */
  prazo: string
  /** Para ordenar: quanto menor, mais urgente. */
  ordem: number
  /** Último dia para agendar (`yyyy-mm-dd`), quando há período em aberto. */
  limite?: string
}

/**
 * Em que situação de férias o colaborador está.
 * `registros` são as férias DELE, já filtradas.
 */
export function situacaoFerias(admissao: string | null, registros: FeriasRegistro[]): SituacaoFerias {
  if (!admissao || !/^\d{4}-\d{2}-\d{2}$/.test(admissao)) {
    return { status: 'sem_admissao', prazo: 'sem data de admissão na ficha', ordem: 9e9 }
  }
  const hj = hoje()

  // Já tem férias marcadas para frente? É o que o RH quer ver primeiro.
  const agendada = registros
    .filter(f => f.tipo === 'solicitacao' && paraData(f.inicio) >= hj)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))[0]
  if (agendada) {
    const dias = diasEntre(hj, paraData(agendada.inicio))
    return {
      status: 'agendada',
      prazo: `sai em ${formatarData(agendada.inicio)} · ${emMeses(dias)}`,
      ordem: 100000 + dias,
    }
  }

  // Cada férias conta para o período aquisitivo em que ela COMEÇA.
  const cobertos = new Set(
    registros
      .map(f => Math.floor(mesesEntre(admissao, paraData(f.inicio)) / 12))
      .filter(n => n >= 1),
  )
  const ciclosCompletos = Math.floor(mesesEntre(admissao, hj) / 12)

  // Primeiro período aquisitivo fechado que ainda não teve férias.
  let pendente = 0
  for (let n = 1; n <= ciclosCompletos; n++) {
    if (!cobertos.has(n)) { pendente = n; break }
  }

  if (pendente === 0) {
    // Nada em aberto: mostra quando abre o próximo direito.
    const abre = somarAnos(admissao, ciclosCompletos + 1)
    const dias = diasEntre(hj, paraData(abre))
    return {
      status: 'aguardando',
      prazo: `só a partir de ${formatarData(abre)} · faltam ${emMeses(dias)}`,
      ordem: 200000 + dias,
    }
  }

  const fimConcessivo = somarAnos(admissao, pendente + 1)
  const limiteAgendar = somarDias(fimConcessivo, -DIAS_ANTECEDENCIA)
  const dias = diasEntre(hj, paraData(limiteAgendar))

  if (dias < 0) {
    return {
      status: 'vencida',
      prazo: `prazo venceu em ${formatarData(limiteAgendar)} · há ${emMeses(-dias)}`,
      ordem: dias,
      limite: limiteAgendar,
    }
  }
  return {
    status: 'agendar',
    prazo: `agendar até ${formatarData(limiteAgendar)} · ${emMeses(dias)}`,
    ordem: dias,
    limite: limiteAgendar,
  }
}
