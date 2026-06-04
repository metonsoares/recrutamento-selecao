import { createSupabaseServerClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { AutoPrint } from '../print/auto-print'
import { ContractData } from '../dados-contrato-tab'
import { parseAddressAnswer, formatAddress } from '@/lib/parse-address'

export const dynamic = 'force-dynamic'

function fmtDate(iso?: string | null) {
  if (!iso) return '____/____/______'
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

export default async function PrintContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data: candidate } = await supabase
    .from('candidates').select('full_name, cpf').eq('id', id).single()
  if (!candidate) notFound()

  const { data: app } = await supabase
    .from('applications').select('contract_data').eq('candidate_id', id).eq('is_latest', true).maybeSingle()

  const c = (app?.contract_data as ContractData | null) ?? null
  // Endereço a partir de form_answers (cep/address)
  let endereco = '—'
  const { data: appRow } = await supabase.from('applications').select('id').eq('candidate_id', id).eq('is_latest', true).maybeSingle()
  if (appRow?.id) {
    const { data: addrRows } = await supabase
      .from('form_answers').select('answer_text, form_questions!inner(field_type)')
      .eq('application_id', appRow.id).in('form_questions.field_type', ['address', 'cep'])
    const ans = (addrRows || []).find(r => r.answer_text?.trim().startsWith('['))?.answer_text
      ?? (addrRows || [])[0]?.answer_text
    const parsed = parseAddressAnswer(ans)
    const f = formatAddress(parsed)
    if (f) endereco = f + (parsed?.cep ? ` - CEP ${parsed.cep}` : '')
  }

  const cpfFmt = candidate.cpf ? String(candidate.cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—'
  const today = new Date().toLocaleDateString('pt-BR')

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 2cm; }
        *, *::before, *::after { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; margin: 0; background: white; line-height: 1.7; }
        aside, nav, header { display: none !important; }
        main { padding: 0 !important; margin: 0 !important; }
        h1 { font-size: 16px; text-align: center; text-transform: uppercase; margin: 0 0 6px; }
        .sub { text-align: center; color: #555; font-size: 11px; margin-bottom: 20px; }
        p { margin: 0 0 10px; text-align: justify; }
        .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; }
        .assinatura-box { text-align: center; }
        .assinatura-box .linha { border-bottom: 1px solid #374151; height: 30px; margin-bottom: 4px; }
        .assinatura-box small { font-size: 10px; color: #555; }
        strong { font-weight: bold; }
      `}</style>
      <AutoPrint />

      <h1>Contrato de Prestação de Serviços por Tempo Determinado</h1>
      <p className="sub">{c?.company_name || 'Empresa Contratante'}</p>

      <p>
        Pelo presente instrumento particular, de um lado <strong>{c?.company_name || '_______________'}</strong>,
        doravante denominada <strong>CONTRATANTE</strong>, e de outro lado{' '}
        <strong>{candidate.full_name}</strong>, inscrito(a) no CPF sob nº <strong>{cpfFmt}</strong>,
        residente em {endereco}, doravante denominado(a) <strong>CONTRATADO(A)</strong>,
        têm entre si justo e contratado o seguinte:
      </p>

      <p><strong>1. OBJETO.</strong> O CONTRATADO(A) prestará serviços na função de <strong>{c?.funcao || '_______________'}</strong>.</p>

      <p><strong>2. PRAZO.</strong> O presente contrato vigorará por <strong>{c?.days || '___'} dias</strong>,
        com início em <strong>{fmtDate(c?.start_date)}</strong> e término em <strong>{fmtDate(c?.end_date)}</strong>.</p>

      <p><strong>3. REMUNERAÇÃO.</strong> Pelos serviços prestados, o CONTRATADO(A) receberá o valor total de{' '}
        <strong>{c?.valor || 'R$ ____'}</strong>{c?.bonus ? <>, podendo receber bônus de <strong>{c.bonus}</strong> em caso de ausência de faltas</> : null}.</p>

      <p><strong>4. DISPOSIÇÕES GERAIS.</strong> As partes elegem o foro da comarca da CONTRATANTE para dirimir
        eventuais dúvidas oriundas do presente contrato.</p>

      <p style={{ marginTop: 24 }}>E, por estarem assim justos e contratados, firmam o presente em duas vias de igual teor.</p>
      <p>Data: {today}</p>

      <div className="assinaturas">
        <div className="assinatura-box"><div className="linha" /><small>CONTRATADO(A) — {candidate.full_name}</small></div>
        <div className="assinatura-box"><div className="linha" /><small>CONTRATANTE — {c?.company_name || 'Empresa'}</small></div>
      </div>
    </>
  )
}
