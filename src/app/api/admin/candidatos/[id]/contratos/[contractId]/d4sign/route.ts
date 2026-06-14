import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import {
  getD4SignCreds, listSafes, uploadBinary, createSignerList, sendToSigner,
  getDocument, isSigned, getSignedFileUrl, type D4Signer,
} from '@/lib/d4sign'

export const maxDuration = 60

function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'doc') return 'application/msword'
  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // docx (padrão)
}

/** POST — envia o contrato para assinatura na D4Sign (empresa + funcionário). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    const companyEmail = user.email || ''

    const { id, contractId } = await params
    const creds = await getD4SignCreds()
    if (!creds) return NextResponse.json({ error: 'D4Sign não conectada. Conecte em Configurações → Integrações.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data: contract } = await supabase
      .from('freelancer_contracts').select('*').eq('id', contractId).eq('candidate_id', id).maybeSingle()
    if (!contract) return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 })
    if (!contract.file_url) return NextResponse.json({ error: 'Este contrato não tem arquivo para enviar.' }, { status: 400 })
    if (contract.d4sign_uuid) return NextResponse.json({ error: 'Este contrato já foi enviado para assinatura.' }, { status: 409 })

    const { data: candidate } = await supabase.from('candidates').select('full_name, email').eq('id', id).maybeSingle()
    const employeeEmail = (candidate?.email as string | null)?.trim() || ''
    if (!employeeEmail) return NextResponse.json({ error: 'Funcionário sem e-mail cadastrado — necessário para a assinatura.' }, { status: 400 })
    if (!companyEmail) return NextResponse.json({ error: 'Seu usuário não tem e-mail para assinar pela empresa.' }, { status: 400 })

    // Cofre destino (primeiro cofre da conta)
    const safes = await listSafes(creds)
    const safeUuid = safes?.[0]?.uuid_safe as string | undefined
    if (!safeUuid) return NextResponse.json({ error: 'Nenhum cofre encontrado na conta D4Sign. Crie um cofre primeiro.' }, { status: 400 })

    // Baixa o arquivo do contrato e converte para base64
    const fileRes = await fetch(contract.file_url as string)
    if (!fileRes.ok) return NextResponse.json({ error: 'Não foi possível ler o arquivo do contrato.' }, { status: 502 })
    const base64 = Buffer.from(await fileRes.arrayBuffer()).toString('base64')
    const fileName = (contract.file_name as string | null) || `contrato-${contractId}.docx`

    // 1) Upload
    const up = await uploadBinary(creds, safeUuid, base64, mimeFor(fileName), fileName)
    if (!up.ok || !up.uuid) return NextResponse.json({ error: `Falha no upload para a D4Sign: ${up.error}` }, { status: 502 })

    // 2) Signatários: empresa e funcionário (sem ordem obrigatória)
    const signers: D4Signer[] = [
      { email: companyEmail },
      { email: employeeEmail },
    ]
    const list = await createSignerList(creds, up.uuid, signers)
    if (!list.ok) return NextResponse.json({ error: `Falha ao cadastrar signatários: ${list.error}` }, { status: 502 })

    // 3) Envia para assinatura (workflow='0' — empresa e funcionário podem assinar em qualquer ordem)
    const send = await sendToSigner(creds, up.uuid, 'Contrato para assinatura.', '0')
    if (!send.ok) return NextResponse.json({ error: `Falha ao enviar para assinatura: ${send.error}` }, { status: 502 })

    const now = new Date().toISOString()
    await supabase.from('freelancer_contracts').update({
      d4sign_uuid: up.uuid, d4sign_status: 'enviado', d4sign_status_raw: 'Aguardando assinaturas', d4sign_sent_at: now,
    }).eq('id', contractId)

    return NextResponse.json({ ok: true, status: 'enviado', uuid: up.uuid, company: companyEmail, employee: employeeEmail })
  } catch (err) {
    console.error('[contrato d4sign POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** GET — consulta o status da assinatura na D4Sign e atualiza a ficha. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { id, contractId } = await params
    const creds = await getD4SignCreds()
    if (!creds) return NextResponse.json({ error: 'D4Sign não conectada.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data: contract } = await supabase
      .from('freelancer_contracts').select('id, d4sign_uuid, signed_file_url').eq('id', contractId).eq('candidate_id', id).maybeSingle()
    if (!contract?.d4sign_uuid) return NextResponse.json({ error: 'Contrato ainda não enviado para assinatura.' }, { status: 400 })

    const doc = await getDocument(creds, contract.d4sign_uuid as string)
    if (!doc.ok) return NextResponse.json({ error: `Falha ao consultar a D4Sign: ${doc.error}` }, { status: 502 })

    const statusRaw = String((doc.doc?.statusName ?? doc.doc?.status_name ?? doc.doc?.status ?? '')) || 'Aguardando assinaturas'
    const signed = isSigned(doc.doc)

    if (signed) {
      let url = (contract.signed_file_url as string | null) || null
      if (!url) url = await getSignedFileUrl(creds, contract.d4sign_uuid as string)
      const now = new Date().toISOString()
      await supabase.from('freelancer_contracts').update({
        d4sign_status: 'assinado', d4sign_status_raw: statusRaw, signed_file_url: url, d4sign_signed_at: now,
      }).eq('id', contractId)
      return NextResponse.json({ ok: true, status: 'assinado', status_raw: statusRaw, signed_file_url: url })
    }

    await supabase.from('freelancer_contracts').update({ d4sign_status: 'enviado', d4sign_status_raw: statusRaw }).eq('id', contractId)
    return NextResponse.json({ ok: true, status: 'enviado', status_raw: statusRaw })
  } catch (err) {
    console.error('[contrato d4sign GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
