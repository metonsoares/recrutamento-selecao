import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { parseAddressAnswer, formatAddress } from '@/lib/parse-address'
import { groupVariables, guessSource } from '@/lib/template-vars'

export const runtime = 'nodejs'
export const maxDuration = 30

function fmtCpf(cpf: string | null): string {
  const d = (cpf || '').replace(/\D/g, '')
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (cpf || '')
}

interface Mapping { source: string; type?: string; label?: string }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { template_id } = await req.json()
    if (!template_id) return NextResponse.json({ error: 'Selecione um template.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data: tpl } = await supabase.from('contract_templates').select('*').eq('id', template_id).maybeSingle()
    if (!tpl) return NextResponse.json({ error: 'Template não encontrado.' }, { status: 404 })

    if (tpl.file_type === 'pdf') {
      return NextResponse.json({ templateName: tpl.name, fileType: 'pdf', variables: [], pdf: true })
    }

    // baixa o .docx e extrai variáveis {variavel} (aceita espaços/acentos)
    const res = await fetch(tpl.file_url as string)
    if (!res.ok) return NextResponse.json({ error: 'Não foi possível ler o arquivo do template.' }, { status: 502 })
    const buf = Buffer.from(await res.arrayBuffer())
    const { value: text } = await mammoth.extractRawText({ buffer: buf })
    const tags = Array.from(new Set(
      [...text.matchAll(/\{([^{}\n]{1,80}?)\}/g)].map(m => m[1].trim()).filter(Boolean)
    ))
    const groups = groupVariables(tags)

    // dados do candidato para auto-preenchimento
    const { data: cand } = await supabase
      .from('candidates')
      .select('full_name, cpf, phone, email, city, neighborhood, applications!latest_application_id(admission_form, contract_data, jobs(title))')
      .eq('id', id).maybeSingle()

    type App = { admission_form?: Record<string, unknown> | null; contract_data?: Record<string, unknown> | null; jobs?: { title?: string } | null }
    const app = (Array.isArray(cand?.applications) ? cand?.applications[0] : cand?.applications) as App | null
    const adm = app?.admission_form || {}
    const ctr = app?.contract_data || {}
    const jobTitle = (app?.jobs?.title || (adm.function_title as string) || (ctr.function_title as string) || '') as string
    const salary = (adm.salary || ctr.salary || ctr.value || '') as string

    // Endereço cadastrado pelo candidato (form_answers, field_type address/cep)
    let endereco = ''
    let cep = ''
    const { data: candRow } = await supabase.from('candidates').select('latest_application_id').eq('id', id).maybeSingle()
    if (candRow?.latest_application_id) {
      const { data: addrAnswers } = await supabase
        .from('form_answers')
        .select('answer_text, form_questions!inner(field_type)')
        .eq('application_id', candRow.latest_application_id)
        .in('form_questions.field_type', ['address', 'cep'])
      for (const a of addrAnswers || []) {
        const parsed = parseAddressAnswer(a.answer_text as string | null)
        if (parsed && (parsed.street || parsed.city)) {
          endereco = formatAddress(parsed)
          cep = parsed.cep || cep
          break
        }
        if (parsed?.cep && !cep) cep = parsed.cep
      }
    }

    // Empresa contratante (admission_form/contract_data → companies)
    let empresaNome = ''
    let empresaCnpj = ''
    let empresaEndereco = ''
    let empresaCep = ''
    const companyId = (ctr.selected_company_id || adm.selected_company_id) as string | undefined
    if (companyId) {
      const { data: comp } = await supabase
        .from('companies')
        .select('apelido, razao_social, cnpj, cep, logradouro, numero, complemento, bairro, cidade, estado')
        .eq('id', companyId).maybeSingle()
      empresaNome = (comp?.razao_social || comp?.apelido || '') as string
      empresaCnpj = (comp?.cnpj || '') as string
      empresaCep = (comp?.cep || '') as string
      empresaEndereco = [comp?.logradouro, comp?.numero, comp?.complemento, comp?.bairro, comp?.cidade, comp?.estado]
        .filter(Boolean).join(', ')
    }

    const today = new Date().toLocaleDateString('pt-BR')
    // valores por "source" do mapeamento
    const SOURCE_VALUES: Record<string, string> = {
      nome: cand?.full_name || '',
      cpf: fmtCpf(cand?.cpf as string | null),
      telefone: cand?.phone || '',
      email: cand?.email || '',
      cidade: cand?.city || '',
      bairro: cand?.neighborhood || '',
      endereco,
      cep,
      data: today,
      cargo: jobTitle,
      salario: String(salary || ''),
      empresa: empresaNome,
      empresa_cnpj: empresaCnpj,
      empresa_endereco: empresaEndereco,
      empresa_cep: empresaCep,
    }
    const mappings = (tpl.field_mappings || {}) as Record<string, Mapping>

    // Um campo por GRUPO (grafias diferentes do mesmo campo são unificadas)
    const variables = groups.map(g => {
      // mapeamento salvo: por chave do grupo (novo) ou por tag bruto (legado)
      const map = mappings[g.key] || g.tags.map(t => mappings[t]).find(Boolean)
      if (map) {
        if (map.source === 'manual') {
          return { name: g.key, label: map.label || g.label, tags: g.tags, value: '', type: map.type || 'text', manual: true }
        }
        return { name: g.key, label: map.label || g.label, tags: g.tags, value: SOURCE_VALUES[map.source] ?? '', type: 'text', manual: false }
      }
      // sem mapeamento: sugestão automática
      const guess = guessSource(g.label)
      if (guess.source === 'manual') {
        return { name: g.key, label: g.label, tags: g.tags, value: '', type: guess.type, manual: true }
      }
      return { name: g.key, label: g.label, tags: g.tags, value: SOURCE_VALUES[guess.source] ?? '', type: 'text', manual: false }
    })

    return NextResponse.json({ templateName: tpl.name, fileType: tpl.file_type, variables })
  } catch (err) {
    console.error('[contratos prepare]', err)
    return NextResponse.json({ error: 'Erro ao ler o template.' }, { status: 500 })
  }
}
