import {
  type D4SignCreds, listSafes, uploadBinary, createSignerList, sendToSigner,
  webhookAdd, listSignatures, getSignatureLink,
} from '@/lib/d4sign'
import { publicAppUrl } from '@/lib/helpers'
import { sendWhatsAppRaw } from '@/lib/whatsapp'

export function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'doc') return 'application/msword'
  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

/**
 * Cria o documento na D4Sign: faz upload do arquivo no cofre, cadastra o
 * funcionário como signatário, envia para assinatura e registra o webhook.
 * Retorna o uuid do documento criado.
 */
export async function uploadAndSendContract(
  creds: D4SignCreds,
  opts: { fileUrl: string; uploadName: string; employeeEmail: string },
): Promise<{ ok: boolean; uuid: string | null; error: string }> {
  const safes = await listSafes(creds)
  const safeUuid = safes?.[0]?.uuid_safe as string | undefined
  if (!safeUuid) return { ok: false, uuid: null, error: 'Nenhum cofre encontrado na conta D4Sign.' }

  const fileRes = await fetch(opts.fileUrl)
  if (!fileRes.ok) return { ok: false, uuid: null, error: 'Não foi possível ler o arquivo do contrato.' }
  const base64 = Buffer.from(await fileRes.arrayBuffer()).toString('base64')

  const up = await uploadBinary(creds, safeUuid, base64, mimeFor(opts.uploadName), opts.uploadName)
  if (!up.ok || !up.uuid) return { ok: false, uuid: null, error: `Falha no upload para a D4Sign: ${up.error}` }

  const list = await createSignerList(creds, up.uuid, [{ email: opts.employeeEmail }])
  if (!list.ok) return { ok: false, uuid: up.uuid, error: `Falha ao cadastrar signatário: ${list.error}` }

  const send = await sendToSigner(creds, up.uuid, 'Contrato para assinatura.', '0')
  if (!send.ok) return { ok: false, uuid: up.uuid, error: `Falha ao enviar para assinatura: ${send.error}` }

  try { await webhookAdd(creds, up.uuid, `${publicAppUrl()}/api/webhooks/d4sign`) } catch { /* ignora */ }

  return { ok: true, uuid: up.uuid, error: '' }
}

/** Envia (ou reenvia) o link de assinatura por WhatsApp ao funcionário. */
export async function sendSignatureWhatsApp(
  creds: D4SignCreds,
  docUuid: string,
  opts: { phone: string; fullName: string; title: string; employeeEmail: string },
): Promise<boolean> {
  if (!opts.phone) return false
  try {
    const signers = await listSignatures(creds, docUuid)
    const keySigner = signers?.find(s => s.email === opts.employeeEmail.toLowerCase())?.keySigner
      || signers?.[0]?.keySigner || ''
    const link = keySigner ? await getSignatureLink(creds, docUuid, keySigner) : null
    const firstName = String(opts.fullName || '').split(' ')[0] || 'tudo bem'
    const msg = link
      ? `Olá ${firstName}! Seu contrato *${opts.title}* está pronto para assinatura. ✍️\n\nAssine pelo link:\n${link}\n\n(Você também recebeu por e-mail.) Obrigado!`
      : `Olá ${firstName}! Enviamos o contrato *${opts.title}* para assinatura no seu e-mail (${opts.employeeEmail}). Por favor, verifique e assine. Obrigado!`
    const sent = await sendWhatsAppRaw(opts.phone, msg, 'contract_signature')
    return sent.ok
  } catch { return false }
}
