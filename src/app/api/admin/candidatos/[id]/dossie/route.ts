import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'
import { caminhoNoBucket } from '@/lib/arquivo-url'
import { rotuloDoDocumento } from '@/lib/documentos-defs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/candidatos/[id]/dossie
 *
 * Inventário de TUDO que está anexado na ficha de um colaborador, agrupado por
 * aba, com uma URL assinada por arquivo. Quem monta o ZIP é o navegador
 * (ver `botao-dossie.tsx`): os arquivos vão do Storage direto para a máquina de
 * quem pediu, sem passar pela função — a Vercel corta corpo/resposta de função
 * em ~4,5 MB e um dossiê passa disso com facilidade.
 *
 * Esta rota devolve só JSON: nomes, pastas e links de vida curta.
 */

const VALIDADE_SEGUNDOS = 60 * 30
const BUCKET_FICHA = 'admission-docs'

interface Anexo { url?: string | null; name?: string | null; path?: string | null }

/** Arquivo já resolvido: a pasta é a aba, o nome é como ele aparece no ZIP. */
interface ArquivoDossie { pasta: string; nome: string; bucket: string; path: string }

function limparNome(valor: string): string {
  return valor
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'arquivo'
}

function extensaoDe(nome: string, path: string): string {
  const doNome = nome.includes('.') ? nome.split('.').pop()! : ''
  if (/^[A-Za-z0-9]{1,5}$/.test(doNome)) return ''
  const doPath = path.includes('.') ? path.split('.').pop()!.split('?')[0] : ''
  return /^[A-Za-z0-9]{1,5}$/.test(doPath) ? `.${doPath.toLowerCase()}` : ''
}

/** Nome dentro da pasta: "<prefixo> - <nome original>", sem perder a extensão. */
function nomeDoArquivo(prefixo: string, anexo: Anexo, path: string): string {
  const original = (anexo.name ?? '').trim() || path.split('/').pop() || 'arquivo'
  const base = prefixo ? `${prefixo} - ${original}` : original
  return limparNome(base) + extensaoDe(original, path)
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    // Mesma permissão da tela de Colaboradores/Desligados, de onde o botão sai.
    const denied = await requirePermissionApi('colaboradores.ver')
    if (denied) return denied

    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: 'Colaborador não informado.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    const [{ data: candidate }, { data: apps }] = await Promise.all([
      supabase.from('candidates').select('*').eq('id', id).single(),
      supabase.from('applications').select('*, jobs(title)').eq('candidate_id', id)
        .order('created_at', { ascending: false }),
    ])
    if (!candidate) return NextResponse.json({ error: 'Colaborador não encontrado.' }, { status: 404 })

    const app = (apps ?? [])[0] as Record<string, unknown> | undefined

    const [
      { data: warnings }, { data: certificates }, { data: employeeFiles },
      { data: records }, { data: vacations }, { data: contracts },
      { data: companies }, { data: absences },
    ] = await Promise.all([
      supabase.from('warnings').select('*').eq('candidate_id', id).order('occurred_at', { ascending: false }),
      supabase.from('medical_certificates').select('*').eq('candidate_id', id).order('certificate_date', { ascending: false }),
      supabase.from('employee_files').select('*').eq('candidate_id', id).order('created_at', { ascending: false }),
      supabase.from('records').select('*').eq('candidate_id', id).order('record_date', { ascending: false }),
      supabase.from('vacations').select('*').eq('candidate_id', id).order('start_date', { ascending: false }),
      supabase.from('freelancer_contracts').select('*').eq('candidate_id', id).order('contract_date', { ascending: false }),
      supabase.from('companies').select('id, apelido, razao_social'),
      supabase.from('absences').select('*').eq('candidate_id', id).order('absence_date', { ascending: false }),
    ])

    const [{ data: salaryRaises }, { data: roleChanges }, { data: respostas }] = await Promise.all([
      supabase.from('salary_raises').select('*').eq('candidate_id', id).order('raise_date'),
      supabase.from('role_changes').select('*').eq('candidate_id', id).order('change_date'),
      // A data de nascimento NÃO é coluna de `candidates`: mora na resposta do
      // formulário cujo tipo é `date` (é de lá que a ficha tira a idade).
      app?.id
        ? supabase.from('form_answers').select('answer_text, form_questions(field_type)').eq('application_id', app.id as string)
        : Promise.resolve({ data: [] as unknown[] }),
    ])

    const arquivos: ArquivoDossie[] = []

    /** Guarda o arquivo se der para localizar o caminho dele no bucket. */
    function incluir(pasta: string, prefixo: string, anexo: Anexo | null | undefined, bucket = BUCKET_FICHA) {
      if (!anexo) return
      const path = (anexo.path ?? '').trim() || caminhoNoBucket(anexo.url, bucket) || ''
      if (!path) return
      arquivos.push({ pasta, bucket, path, nome: nomeDoArquivo(prefixo, anexo, path) })
    }

    /** Blocos `{ chave: { files: [...] } }` da ficha e dos documentos da empresa. */
    function incluirBloco(pasta: string, bloco: unknown) {
      if (!bloco || typeof bloco !== 'object') return
      for (const [chave, valor] of Object.entries(bloco as Record<string, unknown>)) {
        // Itens criados à mão na aba Documentos vêm numa lista própria.
        if (Array.isArray(valor)) {
          for (const item of valor as { name?: string; files?: Anexo[] }[]) {
            for (const f of item?.files ?? []) incluir(pasta, (item?.name ?? '').trim(), f)
          }
          continue
        }
        const files = (valor as { files?: Anexo[] } | null)?.files
        if (!Array.isArray(files)) continue
        for (const f of files) incluir(pasta, rotuloDoDocumento(chave), f)
      }
    }

    // ── Uma pasta por aba ─────────────────────────────────────────────────────
    incluirBloco('Ficha de Admissão', (app?.admission_form as { docs?: unknown } | null)?.docs)
    incluirBloco('Documentos', app?.company_docs)

    const carta = (app?.termination_data as { letter?: Anexo } | null)?.letter
    incluir('Documentos', 'Carta de demissão', carta)

    const aso = app?.aso_data as {
      admissional?: { date?: string; file?: Anexo }
      periodicos?: { date?: string; file?: Anexo }[]
      demissional?: { date?: string; file?: Anexo }
    } | null
    incluir('ASOs', `Admissional${aso?.admissional?.date ? ' ' + aso.admissional.date : ''}`, aso?.admissional?.file)
    for (const p of aso?.periodicos ?? []) incluir('ASOs', `Periódico${p.date ? ' ' + p.date : ''}`, p.file)
    incluir('ASOs', `Demissional${aso?.demissional?.date ? ' ' + aso.demissional.date : ''}`, aso?.demissional?.file)

    for (const w of warnings ?? []) {
      incluir('Advertências', String(w.occurred_at ?? '').slice(0, 10), { url: w.file_url, name: w.file_name, path: w.file_path })
    }
    for (const c of certificates ?? []) {
      incluir('Atestados', String(c.certificate_date ?? '').slice(0, 10), { url: c.file_url, name: c.file_name, path: c.file_path })
    }
    for (const r of records ?? []) {
      incluir('Registros', String(r.record_date ?? '').slice(0, 10), { url: r.file_url, name: r.file_name, path: r.file_path })
    }

    const PASTA_POR_TIPO: Record<string, string> = {
      contracheque: 'Contracheques',
      folha_ponto: 'Folhas de ponto',
      recibo: 'Recibos',
    }
    for (const f of employeeFiles ?? []) {
      const pasta = PASTA_POR_TIPO[String(f.kind)] ?? 'Outros arquivos'
      const ref = String(f.reference ?? '').trim()
      incluir(pasta, ref, { url: f.file_url, name: f.file_name, path: f.file_path })
      incluir(pasta, ref ? `${ref} - comprovante` : 'comprovante', f.comprovante_file as Anexo | null)
    }

    for (const v of vacations ?? []) {
      const periodo = [v.start_date, v.end_date].filter(Boolean).map(d => String(d).slice(0, 10)).join(' a ')
      incluir('Férias', `${periodo} - recibo`, v.recibo_file as Anexo | null)
      incluir('Férias', `${periodo} - notificação`, v.notificacao_file as Anexo | null)
    }

    for (const ct of contracts ?? []) {
      const titulo = String(ct.title ?? 'Contrato').trim()
      incluir('Contratos', titulo, { url: ct.file_url, name: ct.file_name, path: ct.file_path })
      incluir('Contratos', `${titulo} - assinado`, { url: ct.signed_file_url, name: ct.file_name, path: null })
    }

    // A pasta "Currículo" existia e vinha só com a foto do formulário — que não
    // serve a ninguém num dossiê (decisão do dono, 29/10/2026). O que vale do
    // currículo é o Resumo em PDF na raiz, montado com os dados abaixo.

    // ── Assinatura em lote, por bucket ───────────────────────────────────────
    const porBucket = new Map<string, string[]>()
    for (const a of arquivos) {
      if (!porBucket.has(a.bucket)) porBucket.set(a.bucket, [])
      if (!porBucket.get(a.bucket)!.includes(a.path)) porBucket.get(a.bucket)!.push(a.path)
    }
    const assinadas = new Map<string, string>() // `${bucket}|${path}` -> url
    for (const [bucket, paths] of porBucket) {
      const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, VALIDADE_SEGUNDOS)
      for (const item of data ?? []) {
        if (item.signedUrl && item.path) assinadas.set(`${bucket}|${item.path}`, item.signedUrl)
      }
    }

    // Arquivo apagado do Storage não volta assinado — sai do dossiê em vez de
    // virar um item quebrado dentro do ZIP.
    const lista = arquivos
      .map(a => ({ pasta: a.pasta, nome: a.nome, url: assinadas.get(`${a.bucket}|${a.path}`) }))
      .filter((a): a is { pasta: string; nome: string; url: string } => !!a.url)

    // ── Dados do Resumo (viram o PDF na raiz) ────────────────────────────────
    const adm = (app?.admission_form ?? null) as Record<string, unknown> | null
    const empresa = (companies ?? []).find(c => c.id === adm?.selected_company_id)
    const nascimento = ((respostas ?? []) as { answer_text: string | null; form_questions: { field_type?: string } | null }[])
      .find(r => r.form_questions?.field_type === 'date')
      ?.answer_text?.replace(/^"|"$/g, '')
      ?.trim() || null

    let idade: number | null = null
    if (nascimento) {
      const d = new Date(nascimento.length === 10 ? nascimento + 'T00:00:00' : nascimento)
      if (!Number.isNaN(d.getTime())) {
        const hoje = new Date()
        idade = hoje.getFullYear() - d.getFullYear()
        if (hoje.getMonth() < d.getMonth() || (hoje.getMonth() === d.getMonth() && hoje.getDate() < d.getDate())) idade--
        if (idade < 0 || idade > 120) idade = null
      }
    }

    const resumo = {
      nome: candidate.full_name as string,
      // Mesma regra da ficha: o cargo da admissão vale para quem está na ativa;
      // para quem saiu, vale a vaga da candidatura — é o que a tela mostra.
      cargo: (['contratado', 'aprovado'].includes(String(app?.status ?? '')) && adm?.function_title)
        ? (adm.function_title as string)
        : ((app?.jobs as { title?: string } | null)?.title ?? (adm?.function_title as string | null) ?? null),
      empresa: empresa?.apelido || empresa?.razao_social || null,
      status: (app?.status as string | null) ?? null,
      cpf: (candidate.cpf as string | null) ?? null,
      telefone: (candidate.phone as string | null) ?? null,
      email: (candidate.email as string | null) ?? null,
      cidade: (candidate.city as string | null) ?? null,
      idade,
      admissao: (adm?.admission_date as string | null) ?? null,
      salario: (adm?.salary as string | null) ?? null,
      desligamento: (app?.terminated_at as string | null) ?? null,
      solicitante: ((app?.termination_data as { requester?: string } | null)?.requester ?? null),
      advertencias: (warnings ?? []).length,
      atestados: (certificates ?? []).length,
      ferias: (vacations ?? []).length,
      faltas: (absences ?? []).length,
      cadastradoEm: (candidate.created_at as string | null) ?? null,
      /** Períodos de férias gozados, como aparecem na aba Férias. */
      periodosFerias: (vacations ?? []).map(v => ({
        inicio: (v.start_date as string | null) ?? null,
        fim: (v.end_date as string | null) ?? null,
        dias: (v.days as number | null) ?? null,
      })),
      /** Mesma linha do tempo do painel Resumo ("Histórico na empresa"). */
      historico: montarHistorico(),
    }

    /**
     * Histórico na empresa — espelha a linha do tempo da tela (page.tsx).
     * Fica aqui, e não na tela, porque o PDF do dossiê é gerado sem passar
     * pela ficha: quem baixa está na lista de Desligados.
     */
    function montarHistorico(): { data: string; texto: string }[] {
      const itens: { data: string; texto: string }[] = []
      const push = (data: unknown, texto: string) => {
        const d = String(data ?? '').slice(0, 10)
        if (d) itens.push({ data: d, texto })
      }

      push(candidate!.created_at, 'Cadastro no sistema')
      push(adm?.admission_date, 'Admissão / contratação')
      for (const v of vacations ?? []) push(v.start_date, `Férias (${v.days} dia${v.days !== 1 ? 's' : ''})`)
      for (const a of absences ?? []) {
        push(a.absence_date, a.kind === 'afastamento' ? `Afastamento (${a.days} dia${a.days !== 1 ? 's' : ''})` : 'Falta')
      }
      for (const w of warnings ?? []) push(w.occurred_at, `Advertência${w.reason ? ': ' + String(w.reason).slice(0, 60) : ''}`)
      for (const c of certificates ?? []) push(c.certificate_date, `Atestado${c.comment ? ': ' + String(c.comment).slice(0, 60) : ''}`)
      for (const r of salaryRaises ?? []) {
        const valor = Number(r.new_value)
        push(r.raise_date, `Aumento de salário${Number.isFinite(valor) ? ': ' + valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''}`)
      }
      for (const c of roleChanges ?? []) {
        push(c.change_date, c.previous_title
          ? `Mudança de função: ${c.previous_title} → ${c.new_title}`
          : `Mudança de função: ${c.new_title}`)
      }
      if (app?.terminated_at) {
        const quem = (app.termination_data as { requester?: string } | null)?.requester
        const porQuem = quem === 'funcionario' ? ' (a pedido do funcionário)' : quem === 'empresa' ? ' (pela empresa)' : ''
        push(app.terminated_at, `Desligamento${porQuem}`)
      }
      return itens.sort((a, b) => a.data.localeCompare(b.data))
    }

    return NextResponse.json({ ok: true, resumo, arquivos: lista })
  } catch (err) {
    console.error('[dossie]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
