import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { getD4SignCreds, getDocument, listSignatures, resendSignatureEmail } from '@/lib/d4sign'
import { uploadAndSendContract, sendSignatureWhatsApp } from '@/lib/d4sign-send'

export const maxDuration = 60

/**
 * POST — reenvia o link de assinatura (e-mail + WhatsApp). Verifica se o
 * documento existe na D4Sign; se existir, reenvia o e-mail; se não existir
 * (não foi gerado), recria o documento e envia. Em ambos os casos reenvia o
 * link por WhatsApp.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { id, contractId } = await params
    const creds = await getD4SignCreds()
    if (!creds) return NextResponse.json({ error: 'D4Sign não conectada. Conecte em Configurações → Integrações.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data: contract } = await supabase
      .from('freelancer_contracts').select('*').eq('id', contractId).eq('candidate_id', id).maybeSingle()
    if (!contract) return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 })
    if (!contract.file_url) return NextResponse.json({ error: 'Este contrato não tem arquivo para enviar.' }, { status: 400 })

    const { data: candidate } = await supabase.from('candidates').select('full_name, email, phone').eq('id', id).maybeSingle()
    const employeeEmail = (candidate?.email as string | null)?.trim() || ''
    if (!employeeEmail) return NextResponse.json({ error: 'Funcionário sem e-mail cadastrado — necessário para a assinatura.' }, { status: 400 })

    const title = (contract.title as string | null)?.trim() || 'Contrato'
    const fullName = (candidate?.full_name as string | null) || ''
    const phone = (candidate?.phone as string | null)?.trim() || ''

    let uuid = (contract.d4sign_uuid as string | null) || null
    let recreated = false
    let emailResent = false
    let existed = false

    // 1) Verifica se o documento ainda existe na D4Sign
    if (uuid) {
      const doc = await getDocument(creds, uuid)
      if (doc.ok) {
        existed = true
        const signers = await listSignatures(creds, uuid)
        const keySigner = signers?.find(s => s.email === employeeEmail.toLowerCase())?.keySigner || signers?.[0]?.keySigner || ''
        const re = await resendSignatureEmail(creds, uuid, employeeEmail, keySigner)
        emailResent = re.ok
      } else {
        uuid = null // documento não existe mais → recria
      }
    }

    // 2) Se não existe (não foi gerado ou sumiu), recria e envia
    if (!uuid) {
      const ext = ((contract.file_name as string | null)?.split('.').pop() || (contract.file_type === 'pdf' ? 'pdf' : 'docx')).toLowerCase()
      const uploadName = `${(fullName || 'Funcionário').trim()} - ${title}`.replace(/\s+/g, ' ').trim() + `.${ext}`
      const created = await uploadAndSendContract(creds, { fileUrl: contract.file_url as string, uploadName, employeeEmail })
      if (!created.ok || !created.uuid) return NextResponse.json({ error: created.error || 'Falha ao gerar o contrato na D4Sign.' }, { status: 502 })
      uuid = created.uuid
      recreated = true
      emailResent = true // o envio dispara o e-mail
      await supabase.from('freelancer_contracts').update({
        d4sign_uuid: uuid, d4sign_status: 'enviado', d4sign_status_raw: 'Aguardando assinaturas', d4sign_sent_at: new Date().toISOString(),
      }).eq('id', contractId)
    }

    // 3) Reenvia o link por WhatsApp
    const whatsappSent = await sendSignatureWhatsApp(creds, uuid, { phone, fullName, title, employeeEmail })

    return NextResponse.json({ ok: true, recreated, existed, emailResent, whatsappSent, uuid })
  } catch (err) {
    console.error('[contrato d4sign resend]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
