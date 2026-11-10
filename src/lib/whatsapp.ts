/**
 * WhatsApp do Recrutamento — pelo número NATIVO do Portal BDT.
 *
 * Decisão do dono em 10/11/2026: a Z-API sai de cena. Tudo o que este app
 * manda sai pelo número oficial da empresa, +55 24 3302-1335, o mesmo do
 * Atendimento BDT (WhatsApp Cloud API da Meta).
 *
 * Como funciona: este app vive em outro projeto Supabase e não alcança a
 * fila do Atendimento. Então chama a Edge Function `rec-whatsapp` do
 * Portal (autenticada pelo IMPORT_TOKEN, o mesmo mecanismo do magic link),
 * que põe a mensagem na fila única de saída.
 *
 * O QUE MUDA NA PRÁTICA, e não dá para contornar: a Meta só deixa a
 * empresa ABRIR conversa com MODELO (template) APROVADO. Texto livre só
 * vale dentro da janela de 24h depois de a pessoa escrever. Por isso aqui
 * não existe "enviar mensagem qualquer": envia-se um modelo e os valores
 * das variáveis.
 *
 * Uso exclusivamente server-side: o IMPORT_TOKEN nunca vai ao navegador.
 */
import { createSupabaseServiceClient } from './supabase-server'

// Número e nomes de modelo moram em `whatsapp-modelos.ts` (sem servidor
// dentro), para a tela poder importá-los. Reexportados aqui por conforto
// de quem já importa deste arquivo.
export {
  NUMERO_OFICIAL, TEMPLATE_CONVITE, TEMPLATE_REINICIAR, TEMPLATE_TESTE_CULTURA, primeiroNome,
} from './whatsapp-modelos'

const PORTAL_URL =
  process.env.PORTAL_SUPABASE_URL || 'https://xhqzakikatookphvjewy.supabase.co'
const PORTAL_PUBLISHABLE_KEY =
  process.env.PORTAL_SUPABASE_KEY || 'sb_publishable_5WNUgNJi51Rx3kZIQRtVfA_hVRf1tC9'

export interface RespostaEnvio {
  ok: boolean
  /** Código do motivo quando não saiu (TEMPLATE_NAO_APROVADO, SUPPRESSED…). */
  motivo?: string
  /** Frase pronta para mostrar na tela. */
  erro?: string
  messageId?: string
}

/** Frase em português para cada recusa conhecida da porta/ComplianceGuard. */
function explicar(motivo: string | undefined, detalhe: string | undefined, template: string): string {
  switch (motivo) {
    case 'TEMPLATE_NAO_APROVADO':
      return `O modelo "${template}" ainda não foi aprovado pela Meta. `
        + 'Enquanto isso, a mensagem não pode ser enviada — a Meta só deixa a empresa '
        + 'iniciar conversa com modelo aprovado.'
    case 'REQUIRES_APPROVED_TEMPLATE':
      return 'A pessoa não escreveu para o nosso WhatsApp nas últimas 24 horas. '
        + 'Fora dessa janela, a Meta só aceita modelo aprovado — esta mensagem de texto não saiu.'
    case 'SUPPRESSED':
      return 'Esta pessoa pediu para não receber mensagens da empresa no WhatsApp.'
    case 'NUMERO_INVALIDO':
      return 'Telefone inválido. Confira o DDD e o número na ficha.'
    case 'SEM_CANAL':
    case 'MAIS_DE_UM_CANAL':
      return 'O número oficial não está configurado no Portal. Avise a TI.'
    default:
      return detalhe || 'Não foi possível enviar pelo WhatsApp.'
  }
}

/**
 * Envia um modelo aprovado pelo número oficial.
 * Registra em `whatsapp_logs` (é de lá que a Auditoria lê).
 */
export async function enviarWhatsApp(opcoes: {
  numero: string | null | undefined
  /** Nome do modelo aprovado. Vazio = texto livre (só dentro da janela). */
  template: string
  /** Texto livre, quando não é modelo. */
  texto?: string
  /** Valores de {{1}}, {{2}}… na ordem. */
  variaveis?: string[]
  /** Nome do contato, para o Atendimento não mostrar só o número. */
  nome?: string | null
  /** O que originou (id do candidato), para rastrear dos dois lados. */
  referencia?: string | null
  /** Rótulo do registro em whatsapp_logs. */
  acao?: string
}): Promise<RespostaEnvio> {
  const numero = (opcoes.numero ?? '').trim()
  if (!numero) return { ok: false, motivo: 'SEM_TELEFONE', erro: 'Candidato sem telefone cadastrado.' }

  const token = process.env.IMPORT_TOKEN
  if (!token) {
    return { ok: false, motivo: 'SEM_TOKEN', erro: 'A ponte com o Portal não está configurada. Avise a TI.' }
  }

  const variaveis = (opcoes.variaveis ?? []).map(v => String(v ?? '').replace(/\s+/g, ' ').trim())
  let resposta: Record<string, unknown> = {}
  let ok = false
  let erro = ''

  try {
    const res = await fetch(`${PORTAL_URL}/functions/v1/rec-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-import-token': token,
        apikey: PORTAL_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        numero,
        template: opcoes.template || null,
        texto: opcoes.texto ?? null,
        variaveis,
        nome: opcoes.nome ?? null,
        referencia: opcoes.referencia ?? null,
      }),
      cache: 'no-store',
    })
    const texto = await res.text()
    try { resposta = texto ? JSON.parse(texto) as Record<string, unknown> : {} } catch { /* não-JSON */ }
    ok = res.ok && resposta.ok === true
    if (!ok) {
      erro = typeof resposta.error === 'string'
        ? resposta.error
        : explicar(resposta.motivo as string | undefined, resposta.detalhe as string | undefined, opcoes.template)
    }
  } catch {
    erro = 'Não foi possível falar com o Portal para enviar a mensagem.'
    resposta = { erro_rede: true }
  }

  // Registro local: a tela de Auditoria lê daqui.
  try {
    const supabase = await createSupabaseServiceClient()
    await supabase.from('whatsapp_logs').insert({
      direction: 'outbound',
      action: opcoes.acao ?? 'portal_template',
      phone: numero,
      message: opcoes.template
        ? `[${opcoes.template}] ${variaveis.join(' · ')}`.trim()
        : (opcoes.texto ?? ''),
      status: ok ? 'sent' : 'error',
      response_payload: resposta,
    })
  } catch { /* log não derruba envio */ }

  if (ok) return { ok: true, messageId: resposta.message_id as string | undefined }
  return { ok: false, motivo: resposta.motivo as string | undefined, erro }
}

/**
 * Texto livre para um telefone.
 *
 * ATENÇÃO — não é mais um "envia sempre". Com o número oficial da Meta,
 * texto livre só sai se a pessoa tiver escrito para a empresa nas últimas
 * 24 horas. Fora disso volta `ok: false` com o motivo, e quem chama decide
 * o que fazer (hoje todos só avisam na tela).
 *
 * Mantém a assinatura antiga de propósito: os avisos de contrato, pedido
 * de documento, pesquisa de clima e agenda de entrevista continuam
 * chamando daqui, agora pelo número certo.
 */
export async function sendWhatsAppRaw(
  rawPhone: string,
  message: string,
  action = 'system_message',
): Promise<{ ok: boolean; error?: string }> {
  const r = await enviarWhatsApp({ numero: rawPhone, template: '', texto: message, acao: action })
  return r.ok ? { ok: true } : { ok: false, error: r.erro }
}

/** Compatibilidade: igual ao de cima, devolvendo só true/false. */
export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  _conversationId?: string | null,
): Promise<boolean> {
  const r = await sendWhatsAppRaw(phone, message, 'conversa')
  return r.ok
}
