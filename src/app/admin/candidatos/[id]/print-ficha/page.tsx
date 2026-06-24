import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { AutoPrint } from '../print/auto-print'
import { AdmissionFormData } from '../ficha-admissao/ficha-admissao-form'

export const dynamic = 'force-dynamic'

export default async function PrintFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, full_name, phone, email, cpf, city, neighborhood')
    .eq('id', id)
    .single()
  if (!candidate) notFound()

  const { data: app } = await supabase
    .from('applications')
    .select('id, admission_form, job_id, jobs(title)')
    .eq('candidate_id', id)
    .eq('is_latest', true)
    .maybeSingle()

  const service = await createSupabaseServiceClient()
  const { data: brand } = await service
    .from('ai_settings').select('company_name').limit(1).single()

  // Foto do candidato (1ª resposta de upload) — servida via proxy same-origin
  let photoUrl: string | null = null
  if (app?.id) {
    const { data: fileQs } = await service.from('form_questions').select('id').eq('field_type', 'file_upload')
    const fileIds = (fileQs || []).map(q => q.id as string)
    if (fileIds.length) {
      const { data: anss } = await service.from('form_answers')
        .select('answer_text').eq('application_id', app.id as string).in('question_id', fileIds)
      for (const a of anss || []) {
        const raw = a.answer_text ? String(a.answer_text).replace(/^"|"$/g, '') : ''
        if (raw.startsWith('http')) { photoUrl = raw; break }
      }
    }
  }
  const photoSrc = photoUrl ? `/api/img?u=${encodeURIComponent(photoUrl)}` : null

  const rawJobs = (app as Record<string, unknown> | null)?.jobs
  const jobTitle = (Array.isArray(rawJobs)
    ? (rawJobs[0] as { title?: string })?.title
    : (rawJobs as { title?: string } | null)?.title) ?? null

  const f = (app?.admission_form as AdmissionFormData | null) ?? null
  const companyName = brand?.company_name || 'Brownie do Ton'

  // Empresa contratante (Razão Social + CNPJ) selecionada na ficha
  let empresa: { razao_social?: string | null; cnpj?: string | null } | null = null
  if (f?.selected_company_id) {
    const { data } = await service
      .from('companies').select('razao_social, cnpj').eq('id', f.selected_company_id).maybeSingle()
    empresa = data
  }

  function yn(v: boolean | null | undefined) {
    if (v === true) return 'Sim'
    if (v === false) return 'Não'
    return '—'
  }

  function maskCpf(v: string) {
    const d = (v || '').replace(/\D/g, '')
    if (d.length !== 11) return v || ''
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }

  function maskCnpj(v: string | null | undefined) {
    const d = (v || '').replace(/\D/g, '')
    if (d.length !== 14) return v || ''
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 1.2cm; }
        *, *::before, *::after { box-sizing: border-box; }
        html, body { width: 100%; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; margin: 0; background: white; line-height: 1.35; }

        /* Sidebar e nav fixados não aparecem no print por padrão (position:fixed),
           mas escondemos explicitamente por segurança */
        aside, nav, header { display: none !important; }
        main { padding: 0 !important; margin: 0 !important; }

        .page { max-width: 100%; }
        .no-print { display: block; }
        @media print { .no-print { display: none !important; } body { font-size: 10px; } }

        h1.titulo { font-size: 15px; font-weight: bold; text-align: center; margin: 0 0 2px; text-transform: uppercase; letter-spacing: 0.5px; }
        .empresa { font-size: 10px; text-align: center; text-transform: uppercase; letter-spacing: 1px; color: #555; margin-bottom: 2px; }
        .data-preenchi { font-size: 10px; text-align: center; color: #555; margin-bottom: 4px; }
        hr.divider { border: none; border-top: 2px solid #1a5c38; margin: 6px 0; }

        /* Cabeçalho com foto no canto (estilo currículo) */
        .cabecalho { display: flex; align-items: center; gap: 10px; }
        .cabecalho-texto { flex: 1; }
        .foto-box { width: 2.3cm; height: 2.9cm; flex-shrink: 0; border: 1px solid #9ca3af; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #f9fafb; }
        .foto-box img { width: 100%; height: 100%; object-fit: cover; }
        .foto-vazia { font-size: 8px; color: #9ca3af; text-align: center; line-height: 1.2; }
        .foto-spacer { width: 2.3cm; flex-shrink: 0; }

        .secao { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; text-align: center; margin: 8px 0 4px; }

        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; margin-bottom: 3px; }
        .grid3 { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 3px 16px; margin-bottom: 3px; }
        .field { margin-bottom: 3px; }
        .field label { display: block; font-size: 8px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 1px; }
        .field .val { border-bottom: 1px solid #9ca3af; min-height: 16px; font-size: 11px; padding: 1px 2px; }
        .field .val.filled { color: #1a1a1a; }
        .field .val.empty { color: #d1d5db; font-style: italic; }

        .checkbox-list { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 16px; }
        .checkbox-list li { display: flex; align-items: flex-start; gap: 5px; padding: 2px 0; border-bottom: 1px solid #f3f4f6; font-size: 10px; break-inside: avoid; }
        .checkbox-list li span.mark { font-size: 12px; line-height: 1; margin-top: 1px; }
        .checkbox-list li span.label-text { flex: 1; }

        .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 14px; }
        .assinatura-box { text-align: center; }
        .assinatura-box .linha { border-bottom: 1px solid #374151; height: 30px; margin-bottom: 4px; }
        .assinatura-box p { font-size: 9px; color: #6b7280; margin: 0; }

        .rodape { font-size: 8px; color: #9ca3af; text-align: center; margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 6px; }
      `}</style>

      <AutoPrint />

      <div className="page">
        {/* Cabeçalho com foto no canto (estilo currículo) */}
        <div className="cabecalho">
          <div className="foto-spacer" />
          <div className="cabecalho-texto">
            <p className="empresa">{companyName}</p>
            <h1 className="titulo">Ficha Cadastral para Admissão de Funcionários</h1>
          </div>
          <div className="foto-box">
            {photoSrc
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={photoSrc} alt="Foto do candidato" />
              : <span className="foto-vazia">Foto 3x4</span>}
          </div>
        </div>
        <hr className="divider" />

        {/* ── Dados do funcionário ── */}
        <p className="secao">Dados do Funcionário</p>
        <div className="field">
          <label>Nome Completo</label>
          <div className="val filled">{candidate.full_name}</div>
        </div>
        <div className="grid2">
          <div className="field"><label>CPF</label><div className="val filled">{maskCpf(f?.cpf_value || (candidate as {cpf?:string}).cpf || '') || '—'}</div></div>
          <div className="field"><label>E-mail</label><div className="val filled">{candidate.email || '—'}</div></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Telefone Celular</label><div className="val filled">{candidate.phone || '—'}</div></div>
          <div className="field"><label>Telefone Fixo</label><div className="val filled">{f?.phone_landline || '—'}</div></div>
        </div>
        <div className="grid2">
          <div className="field"><label>CEP</label><div className="val filled">{f?.address_cep || '—'}</div></div>
          <div className="field"><label>Bairro</label><div className="val filled">{f?.address_bairro || (candidate as {neighborhood?:string}).neighborhood || '—'}</div></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Endereço</label><div className="val filled">{[f?.address_street, f?.address_number, f?.address_complement].filter(Boolean).join(', ') || '—'}</div></div>
          <div className="field"><label>Cidade</label><div className="val filled">{f?.address_city || candidate.city || '—'}</div></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Nº PIS</label><div className="val filled">{f?.pis || '—'}</div></div>
          <div className="field"><label>Data de Cadastro do PIS</label><div className="val filled">{f?.pis_date || '—'}</div></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Nº da Identidade (RG)</label><div className="val filled">{f?.identity_number || '—'}</div></div>
          <div className="field"><label>Data de Emissão (RG)</label><div className="val filled">{f?.identity_date || '—'}</div></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Estado Civil</label><div className="val filled">{f?.marital_status || '—'}</div></div>
          <div className="field"><label>Grau de Escolaridade</label><div className="val filled">{f?.education || '—'}</div></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Mensalidade Sindical</label><div className="val filled">{yn(f?.union_dues)}</div></div>
          <div className="field"><label>Vale Transporte</label><div className="val filled">{yn(f?.transport_benefit)}</div></div>
        </div>

        {/* ── Dados do Empregador ── */}
        <p className="secao">Dados do Empregador</p>
        <div className="grid2">
          <div className="field"><label>Empresa Contratante (Razão Social)</label><div className="val filled">{empresa?.razao_social || companyName || '—'}</div></div>
          <div className="field"><label>CNPJ</label><div className="val filled">{maskCnpj(empresa?.cnpj) || '—'}</div></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Função / Cargo</label><div className="val filled">{f?.function_title || jobTitle || '—'}</div></div>
          <div className="field"><label>Salário Base</label><div className="val filled">{f?.salary || '—'}</div></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Data de Admissão</label><div className="val filled">{f?.admission_date || '—'}</div></div>
          <div className="field"><label>Contrato de Experiência</label><div className="val filled">{f?.trial_contract || '—'}</div></div>
        </div>

        {/* ── Salário Família ── (Documentos removidos do PDF) */}
        <p className="secao">Salário Família / Dependentes</p>
        <div className="grid2">
          <div className="field"><label>Filhos menores de 14 anos</label><div className="val filled">{f?.children_count || '0'}</div></div>
          <div className="field"><label>Pensão Alimentícia</label><div className="val filled">{yn(f?.alimony)}</div></div>
        </div>

        {/* ── Vale Transporte ── */}
        <p className="secao">Vale Transporte</p>
        <div className="grid2">
          <div className="field"><label>Empresa de Transporte</label><div className="val filled">{f?.transport_company || '—'}</div></div>
          <div className="field"><label>Qtd. Passagens / dia</label><div className="val filled">{f?.transport_count || '—'}</div></div>
        </div>

        {/* Observações */}
        {f?.notes && (
          <>
            <p className="secao">Observações</p>
            <div className="field"><div className="val filled" style={{ minHeight: 40, whiteSpace: 'pre-wrap' }}>{f.notes}</div></div>
          </>
        )}

        {/* Assinaturas */}
        <div className="assinaturas">
          <div className="assinatura-box"><div className="linha" /><p>Assinatura do Funcionário</p></div>
          <div className="assinatura-box"><div className="linha" /><p>Assinatura Empresa</p></div>
        </div>

      </div>
    </>
  )
}
