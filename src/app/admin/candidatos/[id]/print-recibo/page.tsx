import { createSupabaseServerClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { AutoPrint } from '../print/auto-print'
import { ContractData } from '../dados-contrato-tab'

export const dynamic = 'force-dynamic'

function parseBRL(str?: string) { return str ? Number(str.replace(/\D/g, '')) / 100 : 0 }
function fmtBRL(n: number) { return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(iso?: string | null) { return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—' }

export default async function PrintReciboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data: candidate } = await supabase
    .from('candidates').select('full_name, cpf').eq('id', id).single()
  if (!candidate) notFound()

  const { data: app } = await supabase
    .from('applications').select('contract_data').eq('candidate_id', id).eq('is_latest', true).maybeSingle()
  const c = (app?.contract_data as ContractData | null) ?? null

  // Cálculo a pagar
  const valorTotal = parseBRL(c?.valor)
  const periodo = parseInt(c?.days || '0') || 0
  const valorDia = periodo > 0 ? valorTotal / periodo : 0
  const faltasNaoComp = (c?.absences || []).filter(a => !a.compensada).length
  const diasTrab = Math.max(0, periodo - faltasNaoComp)
  const valorBruto = valorDia * diasTrab
  const totalAdiant = (c?.adjustments || []).filter(a => a.type === 'adiantamento').reduce((s, a) => s + parseBRL(a.value), 0)
  const totalDesc = (c?.adjustments || []).filter(a => a.type === 'desconto').reduce((s, a) => s + parseBRL(a.value), 0)
  const bonus = faltasNaoComp === 0 ? parseBRL(c?.bonus) : 0
  const aPagar = valorBruto - totalAdiant - totalDesc + bonus

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
        h1 { font-size: 18px; text-align: center; text-transform: uppercase; margin: 0 0 4px; }
        .valor-dest { text-align: center; font-size: 20px; font-weight: bold; color: #1a5c38; margin: 8px 0 18px; }
        p { margin: 0 0 12px; text-align: justify; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11px; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        td.r { text-align: right; }
        tr.total td { font-weight: bold; border-top: 2px solid #1a5c38; border-bottom: none; font-size: 13px; }
        .assinatura-box { text-align: center; margin-top: 50px; }
        .assinatura-box .linha { border-bottom: 1px solid #374151; height: 30px; margin-bottom: 4px; width: 60%; margin-left: auto; margin-right: auto; }
        .assinatura-box small { font-size: 10px; color: #555; }
      `}</style>
      <AutoPrint />

      <h1>Recibo de Pagamento</h1>
      <div className="valor-dest">{fmtBRL(aPagar)}</div>

      <p>
        Recebi de <strong>{c?.company_name || 'Empresa Contratante'}</strong> a importância de{' '}
        <strong>{fmtBRL(aPagar)}</strong>, referente à prestação de serviços na função de{' '}
        <strong>{c?.funcao || '—'}</strong>, no período de <strong>{fmtDate(c?.start_date)}</strong> a{' '}
        <strong>{fmtDate(c?.end_date)}</strong>, conforme demonstrativo abaixo.
      </p>

      <table>
        <tbody>
          <tr><td>Valor do contrato ({periodo} dias)</td><td className="r">{fmtBRL(valorTotal)}</td></tr>
          <tr><td>Dias trabalhados ({periodo} − {faltasNaoComp} falta{faltasNaoComp !== 1 ? 's' : ''})</td><td className="r">{diasTrab} dias</td></tr>
          <tr><td>Valor proporcional</td><td className="r">{fmtBRL(valorBruto)}</td></tr>
          {totalAdiant > 0 && <tr><td>(−) Adiantamentos</td><td className="r">− {fmtBRL(totalAdiant)}</td></tr>}
          {totalDesc > 0 && <tr><td>(−) Descontos / quebras</td><td className="r">− {fmtBRL(totalDesc)}</td></tr>}
          {bonus > 0 && <tr><td>(+) Bônus (sem faltas)</td><td className="r">+ {fmtBRL(bonus)}</td></tr>}
          <tr className="total"><td>Valor líquido recebido</td><td className="r">{fmtBRL(aPagar)}</td></tr>
        </tbody>
      </table>

      <p>Para clareza e validade, firmo o presente recibo.</p>
      <p>Data: {today}</p>

      <div className="assinatura-box">
        <div className="linha" />
        <small>{candidate.full_name} — CPF {cpfFmt}</small>
      </div>
    </>
  )
}
