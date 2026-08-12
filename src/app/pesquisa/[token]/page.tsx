import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { verificarIdentidade, apenasDigitos } from '@/lib/pesquisa-identidade'
import { PesquisaForm } from './pesquisa-form'

export const dynamic = 'force-dynamic'

interface QuestionOption { text: string; weight: number }
interface Question { id: string; text: string; options: QuestionOption[] }

/** Tela de recado (link expirado, colaborador não encontrado etc.). */
function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-xl font-bold text-gray-900">{titulo}</h1>
        <p className="text-sm text-muted-foreground mt-2">{texto}</p>
      </div>
    </div>
  )
}

export default async function PesquisaPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ c?: string; u?: string }> }) {
  const { token } = await params
  const { c: lockedId, u: identidadeAssinada } = await searchParams
  const supabase = await createSupabaseServiceClient()
  const { data: survey } = await supabase
    .from('climate_surveys')
    .select('id, title, description, questions, active, company_name, target_candidate_ids')
    .eq('token', token)
    .maybeSingle()

  if (!survey || !survey.active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pesquisa indisponível</h1>
          <p className="text-sm text-muted-foreground mt-1">Este link de pesquisa não está mais ativo.</p>
        </div>
      </div>
    )
  }

  let lockedCandidate: { id: string; full_name: string } | null = null

  // ── Identidade vinda do login do Portal BDT (QR geral) ────────────────────
  // O Portal assina quem é o colaborador; aqui só conferimos a assinatura e
  // casamos com a base — por CPF e, se não achar, por e-mail.
  if (identidadeAssinada) {
    const conferida = verificarIdentidade(identidadeAssinada, process.env.IMPORT_TOKEN)
    if (!conferida.ok) {
      return conferida.motivo === 'expirada'
        ? <Aviso titulo="Link expirado" texto="Por segurança, o acesso vale por poucos minutos. Leia o QR code novamente e entre no Portal para responder." />
        : <Aviso titulo="Não foi possível confirmar quem você é" texto="Leia o QR code novamente pelo Portal BDT. Se continuar assim, procure o RH." />
    }

    const { cpf, email } = conferida.identidade
    const cpfDigitos = apenasDigitos(cpf)
    let achado: { id: string; full_name: string } | null = null

    if (cpfDigitos.length === 11) {
      const { data } = await supabase
        .from('candidates').select('id, full_name, cpf').is('deleted_at', null)
      achado = (data ?? []).find(c => apenasDigitos(c.cpf as string | null) === cpfDigitos) ?? null
    }
    if (!achado && email) {
      const { data } = await supabase
        .from('candidates').select('id, full_name').is('deleted_at', null)
        .ilike('email', email.trim()).maybeSingle()
      if (data) achado = data as { id: string; full_name: string }
    }

    if (!achado) {
      return <Aviso titulo="Não encontramos seu cadastro" texto="Seu acesso ao Portal funcionou, mas você não está na base de colaboradores desta pesquisa. Procure o RH para regularizar." />
    }
    lockedCandidate = { id: achado.id, full_name: achado.full_name }
  }

  // Funcionário pré-identificado via link da ficha (?c=candidateId)
  if (!lockedCandidate && lockedId) {
    const { data } = await supabase.from('candidates').select('id, full_name').eq('id', lockedId).maybeSingle()
    if (data) lockedCandidate = data as { id: string; full_name: string }
  }

  // Sem identificação nenhuma: não abrimos a lista de nomes (qualquer um
  // poderia responder no lugar de outro). O caminho é entrar pelo Portal.
  if (!lockedCandidate) {
    return <Aviso titulo="Entre pelo Portal BDT para responder" texto="Esta pesquisa é identificada: leia o QR code e faça login com seu código de acesso e senha. Assim sua resposta entra na sua ficha." />
  }

  return (
    <PesquisaForm
      token={token}
      title={survey.title}
      description={survey.description}
      companyName={survey.company_name}
      questions={(survey.questions as Question[]) || []}
      funcionarios={[]}
      lockedCandidate={lockedCandidate}
    />
  )
}
