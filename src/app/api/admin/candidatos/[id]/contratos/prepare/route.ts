import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { parseAddressAnswer, formatAddress } from '@/lib/parse-address'

export const runtime = 'nodejs'
export const maxDuration = 30

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

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
      [...text.matchAll(/\{([^{}\n]{1,60}?)\}/g)].map(m => m[1].trim()).filter(Boolean)
    ))

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
    const companyId = (ctr.selected_company_id || adm.selected_company_id) as string | undefined
    if (companyId) {
      const { data: comp } = await supabase.from('companies').select('apelido, razao_social, cnpj').eq('id', companyId).maybeSingle()
      empresaNome = (comp?.razao_social || comp?.apelido || '') as string
      empresaCnpj = (comp?.cnpj || '') as string
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
    }
    // heurística por nome da variável (fallback quando não há mapeamento)
    const KNOWN: Record<string, string> = {
      nome: SOURCE_VALUES.nome, nomecompleto: SOURCE_VALUES.nome, contratado: SOURCE_VALUES.nome, contratada: SOURCE_VALUES.nome,
      cpf: SOURCE_VALUES.cpf,
      telefone: SOURCE_VALUES.telefone, celular: SOURCE_VALUES.telefone, fone: SOURCE_VALUES.telefone,
      email: SOURCE_VALUES.email, cidade: SOURCE_VALUES.cidade, bairro: SOURCE_VALUES.bairro,
      endereco: endereco, enderecocompleto: endereco, residencia: endereco, cep: cep,
      data: today, datahoje: today, dataatual: today, hoje: today,
      cargo: jobTitle, funcao: jobTitle, vaga: jobTitle,
      salario: SOURCE_VALUES.salario, valor: SOURCE_VALUES.salario,
      empresa: empresaNome, contratante: empresaNome, cnpj: empresaCnpj,
    }

    const mappings = (tpl.field_mappings || {}) as Record<string, Mapping>

    const variables = tags.map(name => {
      const map = mappings[name]
      if (map) {
        if (map.source === 'manual') {
          return { name, value: '', type: map.type || 'text', label: map.label || name, manual: true }
        }
        return { name, value: SOURCE_VALUES[map.source] ?? '', type: 'text', label: map.label || name, manual: false }
      }
      return { name, value: KNOWN[norm(name)] ?? '', type: 'text', label: name, manual: false }
    })

    return NextResponse.json({ templateName: tpl.name, fileType: tpl.file_type, variables })
  } catch (err) {
    console.error('[contratos prepare]', err)
    return NextResponse.json({ error: 'Erro ao ler o template.' }, { status: 500 })
  }
}
