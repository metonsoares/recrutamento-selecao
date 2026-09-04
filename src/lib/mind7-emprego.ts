/**
 * Leitura do relatório de EMPREGOS do Mind7 (painel → consultas → emprego),
 * colado da tela pelo usuário.
 *
 * O relatório é texto de página, não dado estruturado, mas tem uma âncora
 * confiável: a linha do período — "22/03/2019 → 24/06/2021" (ou "→ sem data de
 * saída"). Cada vínculo é lido A PARTIR dela: para trás vêm o status e o nome da
 * empresa; para a frente, CNPJ, salário, cargo e o motivo da saída, até o
 * próximo período.
 *
 * Ler assim (em vez de mandar tudo para a IA) mantém o resultado previsível e
 * de graça — a IA fica só como plano B para um layout que este parser não
 * reconhecer.
 *
 * O bloco "Colegas de trabalho" é DESCARTADO de propósito: ele traz CPF e
 * telefone de terceiros, que não têm nada a ver com a avaliação do candidato.
 */
import { Mind7CheckResult, Mind7Vinculo } from '@/types'

const PERIODO = /^(\d{2}\/\d{2}\/\d{4})\s*(?:→|->|a)\s*(\d{2}\/\d{2}\/\d{4}|sem data de sa[íi]da)$/i
const STATUS = /^(desligado|ativo|afastado|em atividade)$/i
const CNPJ = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/
const SALARIO = /^R\$\s*([\d.]+,\d{2})$/
const CPF_LINHA = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/
const MOTIVO = /^(t[ée]rmino do contrato|dispensa sem justa causa|dispensa com justa causa|pedido de demiss[ãa]o|aposentadoria|transfer[êe]ncia|falecimento|rescis[ãa]o.*)$/i

/** Linhas que são enfeite do relatório e nunca são cargo. */
const RUIDO = [
  // O bloco "Detalhe por safra" repete o status em minúsculas — não é cargo.
  /^(desligado|ativo|afastado|em atividade)$/i,
  /^R\$/, /^\d+\s*fontes?$/i, /^remunera[çc][ãa]o/i, /^m[ée]dia\b/i,
  /^detalhe por safra/i, /^admitido\b/i, /^\d{4}$/, /^·/, /^\d+\s*(m|meses|ano|anos)\b/i,
  /^\d{2}\/\d{2}$/, /^linha do tempo/i, /^empresas?$/i, /^ativos?$/i, /^primeiro$/i,
  /^mais recente$/i, /^\d+ empresas?$/i, /^\d+ de \d+$/i, /^consultar$/i, /^copiar$/i,
  /^imprimir$/i, /^voltar$/i, /^\(\d{2}\)/, /^renda estimada/i, /^limite di[áa]rio/i,
]

/** "22/03/2019" → "2019-03-22" */
function iso(br: string): string {
  const [d, m, a] = br.split('/')
  return `${a}-${m}-${d}`
}

/** "1.234,56" → 1234.56 */
function reais(t: string): number {
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return isFinite(n) ? n : 0
}

/** Duração entre duas datas, quando o relatório não trouxe pronta. */
function duracaoEntre(ini: string, fim: string): string {
  const [d1, m1, a1] = ini.split('/').map(Number)
  const [d2, m2, a2] = fim.split('/').map(Number)
  let meses = (a2 - a1) * 12 + (m2 - m1)
  if (d2 < d1) meses -= 1
  if (meses < 0) return ''
  const anos = Math.floor(meses / 12), resto = meses % 12
  if (!anos) return `${resto} ${resto === 1 ? 'mês' : 'meses'}`
  const parteAno = `${anos} ${anos === 1 ? 'ano' : 'anos'}`
  return resto ? `${parteAno} e ${resto}m` : parteAno
}

export function lerVinculosMind7(bruto: string): Mind7CheckResult {
  const todas = bruto.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim())

  // Corta fora os colegas de trabalho — dado de terceiro, não entra.
  const corte = todas.findIndex(l => /^colegas de trabalho/i.test(l))
  const linhas = (corte >= 0 ? todas.slice(0, corte) : todas).filter(Boolean)

  // Cabeçalho: o CPF vem logo abaixo do nome, no topo do relatório.
  let nome: string | undefined, cpf: string | undefined
  for (let i = 0; i < linhas.length; i++) {
    if (CPF_LINHA.test(linhas[i])) {
      cpf = linhas[i].replace(/\D/g, '')
      const acima = linhas[i - 1] ?? ''
      if (/^[A-ZÀ-Ú][A-ZÀ-Ú .'-]{5,}$/.test(acima)) nome = acima
      break
    }
  }

  const marcos: number[] = []
  linhas.forEach((l, i) => { if (PERIODO.test(l)) marcos.push(i) })

  const vinculos: Mind7Vinculo[] = []
  for (let k = 0; k < marcos.length; k++) {
    const i = marcos[k]
    const m = linhas[i].match(PERIODO)!
    const admissaoBr = m[1]
    const semSaida = /sem data/i.test(m[2])
    const saidaBr = semSaida ? '' : m[2]

    // Para trás: status e nome da empresa.
    const temStatus = STATUS.test(linhas[i - 1] ?? '')
    const status = temStatus ? linhas[i - 1].toLowerCase() : ''
    const empresa = (temStatus ? linhas[i - 2] : linhas[i - 1]) ?? ''

    // Para a frente: até o próximo vínculo.
    const fim = k + 1 < marcos.length ? marcos[k + 1] - 2 : linhas.length
    const trecho = linhas.slice(i + 1, Math.max(i + 1, fim))

    let cnpj: string | undefined, salario: number | undefined, duracao: string | undefined
    const cargos: string[] = []
    const motivos: string[] = []

    for (const l of trecho) {
      if (!duracao && l.startsWith('·')) { duracao = l.replace(/^·\s*/, ''); continue }
      if (!cnpj && CNPJ.test(l)) { cnpj = l.replace(/\D/g, ''); continue }
      if (salario === undefined) {
        const s = l.match(SALARIO)
        if (s) { salario = reais(s[1]); continue }
      }
      if (MOTIVO.test(l)) { if (!motivos.includes(l.toLowerCase())) motivos.push(l.toLowerCase()); continue }
      if (RUIDO.some(r => r.test(l))) continue
      // Sobrou texto curto e sem números: é cargo/função.
      if (l.length >= 3 && l.length <= 70 && !/\d/.test(l) && !cargos.includes(l)) cargos.push(l)
    }

    vinculos.push({
      empresa: empresa || 'Empresa não identificada',
      cnpj,
      cargo: cargos.slice(0, 3).join(' / ') || undefined,
      admissao: iso(admissaoBr),
      saida: saidaBr ? iso(saidaBr) : undefined,
      duracao: duracao || (saidaBr ? duracaoEntre(admissaoBr, saidaBr) : undefined) || undefined,
      salario: salario && salario > 0 ? salario : undefined,
      vinculo_ativo: /ativo|em atividade/i.test(status),
      observacao: [
        semSaida ? 'sem data de saída no relatório' : '',
        ...motivos,
      ].filter(Boolean).join(' · ') || undefined,
    })
  }

  // Mais recente primeiro.
  vinculos.sort((a, b) => String(b.admissao).localeCompare(String(a.admissao)))

  const ativos = vinculos.filter(v => v.vinculo_ativo).length
  const datas = vinculos.map(v => v.admissao!).filter(Boolean).sort()
  const periodo = datas.length
    ? ` entre ${datas[0].split('-').reverse().join('/')} e ${datas[datas.length - 1].split('-').reverse().join('/')}`
    : ''

  return {
    encontrado: vinculos.length > 0,
    resumo: vinculos.length
      ? `${vinculos.length} vínculo(s) de emprego${periodo}. ${ativos ? `${ativos} ativo(s).` : 'Nenhum ativo.'}`
      : 'Nenhum vínculo de emprego reconhecido no texto colado.',
    vinculos,
    nome_consultado: nome,
    cpf_consultado: cpf,
    origem: 'colado',
  }
}
