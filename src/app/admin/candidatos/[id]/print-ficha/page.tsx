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
    .select('admission_form, job_id, jobs(title)')
    .eq('candidate_id', id)
    .eq('is_latest', true)
    .maybeSingle()

  const service = await createSupabaseServiceClient()
  const { data: brand } = await service
    .from('ai_settings').select('company_name').limit(1).single()

  const rawJobs = (app as Record<string, unknown> | null)?.jobs
  const jobTitle = (Array.isArray(rawJobs)
    ? (rawJobs[0] as { title?: string })?.title
    : (rawJobs as { title?: string } | null)?.title) ?? null

  const f = (app?.admission_form as AdmissionFormData | null) ?? null
  const today = new Date().toLocaleDateString('pt-BR')
  const companyName = brand?.company_name || 'Brownie do Ton'

  function yn(v: boolean | null | undefined) {
    if (v === true) return 'Sim'
    if (v === false) return 'Não'
    return '—'
  }

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 1.5cm; }
        *, *::before, *::after { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; margin: 0; background: white; line-height: 1.5; }

        /* Sidebar e nav fixados não aparecem no print por padrão (position:fixed),
           mas escondemos explicitamente por segurança */
        aside, nav, header { display: none !important; }
        main { padding: 0 !important; margin: 0 !important; }

        .page { max-width: 100%; }
        .no-print { display: block; }
        @media print { .no-print { display: none !important; } body { font-size: 10px; } }

        h1.titulo { font-size: 15px; font-weight: bold; text-align: center; margin: 0 0 2px; text-transform: uppercase; letter-spacing: 0.5px; }
        .empresa { font-size: 10px; text-align: center; text-transform: uppercase; letter-spacing: 1px; color: #555; margin-bottom: 2px; }
        .data-preenchi { font-size: 10px; text-align: center; color: #555; margin-bottom: 12px; }
        hr.divider { border: none; border-top: 2px solid #1a5c38; margin: 10px 0 8px; }

        .secao { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; text-align: center; margin: 14px 0 6px; }

        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin-bottom: 6px; }
        .grid3 { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 6px 16px; margin-bottom: 6px; }
        .field { margin-bottom: 5px; }
        .field label { display: block; font-size: 8px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 1px; }
        .field .val { border-bottom: 1px solid #9ca3af; min-height: 16px; font-size: 11px; padding: 1px 2px; }
        .field .val.filled { color: #1a1a1a; }
        .field .val.empty { color: #d1d5db; font-style: italic; }

        .checkbox-list { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 16px; }
        .checkbox-list li { display: flex; align-items: flex-start; gap: 5px; padding: 2px 0; border-bottom: 1px solid #f3f4f6; font-size: 10px; break-inside: avoid; }
        .checkbox-list li span.mark { font-size: 12px; line-height: 1; margin-top: 1px; }
        .checkbox-list li span.label-text { flex: 1; }

        .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
        .assinatura-box { text-align: center; }
        .assinatura-box .linha { border-bottom: 1px solid #374151; height: 30px; margin-bottom: 4px; }
        .assinatura-box p { font-size: 9px; color: #6b7280; margin: 0; }

        .rodape { font-size: 8px; color: #9ca3af; text-align: center; margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 6px; }
      `}</style>

      <AutoPrint />

      <div className="page">
        {/* Cabeçalho */}
        <p className="empresa">{companyName}</p>
        <h1 className="titulo">Ficha Cadastral para Admissão de Funcionários</h1>
        <p className="data-preenchi">Data do Preenchimento: {today}</p>
        <hr className="divider" />

        {/* ── Dados do funcionário ── */}
        <p className="secao">Dados do Funcionário</p>
        <div className="field">
          <label>Nome Completo</label>
          <div className="val filled">{candidate.full_name}</div>
        </div>
        <div className="grid2">
          <div className="field"><label>CPF</label><div className="val filled">{f?.cpf_value || (candidate as {cpf?:string}).cpf || '—'}</div></div>
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
          <div className="assinatura-box"><div className="linha" /><p>Assinatura do Responsável</p></div>
        </div>

        <p className="rodape">Tel. Médico do Trabalho: (24) 2242-0310 – Paulo Bittencourt | Dr. Moreirão: (24) 2243-8608</p>
      </div>
    </>
  )
}
