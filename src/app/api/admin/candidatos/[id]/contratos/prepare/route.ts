import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const maxDuration = 30

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

function fmtCpf(cpf: string | null): string {
  const d = (cpf || '').replace(/\D/g, '')
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (cpf || '')
}

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

    // baixa o .docx e extrai variáveis {variavel}
    const res = await fetch(tpl.file_url as string)
    if (!res.ok) return NextResponse.json({ error: 'Não foi possível ler o arquivo do template.' }, { status: 502 })
    const buf = Buffer.from(await res.arrayBuffer())
    const { value: text } = await mammoth.extractRawText({ buffer: buf })
    const tags = Array.from(new Set([...text.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*\}/g)].map(m => m[1])))

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

    // mapa de valores conhecidos (normalizado)
    const today = new Date().toLocaleDateString('pt-BR')
    const known: Record<string, string> = {
      nome: cand?.full_name || '', nomecompleto: cand?.full_name || '',
      cpf: fmtCpf(cand?.cpf as string | null),
      telefone: cand?.phone || '', celular: cand?.phone || '', fone: cand?.phone || '',
      email: cand?.email || '', cidade: cand?.city || '', bairro: cand?.neighborhood || '',
      data: today, datahoje: today, dataatual: today, hoje: today,
      cargo: jobTitle, funcao: jobTitle, vaga: jobTitle,
      salario: String(salary || ''), valor: String(salary || ''),
    }

    const variables = tags.map(name => ({ name, value: known[norm(name)] ?? '' }))

    return NextResponse.json({ templateName: tpl.name, fileType: tpl.file_type, variables })
  } catch (err) {
    console.error('[contratos prepare]', err)
    return NextResponse.json({ error: 'Erro ao ler o template.' }, { status: 500 })
  }
}
