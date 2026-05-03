import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  // Auth — somente admin autenticado
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const admin = await createAdminClient()

  // Survey ativa
  const { data: survey } = await admin
    .from('surveys')
    .select('id, title')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!survey) {
    return NextResponse.json(
      { error: 'Nenhuma pesquisa ativa.' },
      { status: 404 }
    )
  }

  // Perguntas (ordenadas)
  const { data: questionsRaw } = await admin
    .from('questions')
    .select(`
      id, question_text, question_type, display_order,
      survey_sections!inner(title, display_order),
      question_options(id, option_text, display_order)
    `)
    .eq('survey_id', survey.id)
    .order('display_order')

  const questions = (questionsRaw ?? [])
    .map((q) => {
      const section = q.survey_sections as unknown as {
        title: string
        display_order: number
      }
      return {
        id: q.id,
        text: q.question_text,
        type: q.question_type,
        sectionTitle: section.title,
        sectionOrder: section.display_order,
        displayOrder: q.display_order,
        options: (q.question_options ?? [])
          .sort((a, b) => a.display_order - b.display_order)
          .reduce<Record<string, string>>((m, o) => {
            m[o.id] = o.option_text
            return m
          }, {}),
      }
    })
    .sort((a, b) =>
      a.sectionOrder !== b.sectionOrder
        ? a.sectionOrder - b.sectionOrder
        : a.displayOrder - b.displayOrder
    )

  const questionIds = questions.map((q) => q.id)

  // Respondentes com respostas
  const { data: respondentsRaw } = await admin
    .from('respondents')
    .select(`
      id, name, role, created_at,
      responses(id, submitted_at)
    `)
    .eq('survey_id', survey.id)
    .order('created_at', { ascending: false })

  const respondents = (respondentsRaw ?? []).map((r) => {
    const resp = r.responses as unknown as
      | Array<{ id: string; submitted_at: string }>
      | null
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      createdAt: r.created_at,
      responseId: resp?.[0]?.id ?? null,
      submittedAt: resp?.[0]?.submitted_at ?? null,
    }
  })

  // Respostas agrupadas por responseId
  type AnswerMap = Map<
    string, // responseId
    Map<string, string> // questionId → valor textual
  >

  const answerMap: AnswerMap = new Map()

  if (questionIds.length > 0) {
    const { data: answersRaw } = await admin
      .from('answers')
      .select('response_id, question_id, option_id, answer_text, answer_number')
      .in('question_id', questionIds)

    for (const a of answersRaw ?? []) {
      if (!answerMap.has(a.response_id)) {
        answerMap.set(a.response_id, new Map())
      }
      const qMap = answerMap.get(a.response_id)!
      const qId = a.question_id

      let value: string
      if (a.option_id) {
        const q = questions.find((q) => q.id === qId)
        value = q?.options[a.option_id] ?? a.option_id
      } else if (a.answer_text) {
        value = a.answer_text
      } else if (a.answer_number != null) {
        value = String(a.answer_number)
      } else {
        continue
      }

      // Para múltipla escolha, concatena com " | "
      const existing = qMap.get(qId)
      qMap.set(qId, existing ? `${existing} | ${value}` : value)
    }
  }

  // ─── Montagem da planilha ────────────────────────────────────────────────
  // Aba 1: Respostas completas
  const header1 = [
    'Nome',
    'Função',
    'Entrou',
    'Enviou',
    ...questions.map((q) => `[${q.sectionTitle}] ${q.text}`),
  ]

  const rows1 = respondents.map((r) => {
    const qMap = r.responseId ? (answerMap.get(r.responseId) ?? new Map()) : new Map()
    return [
      r.name,
      r.role,
      new Date(r.createdAt).toLocaleString('pt-BR'),
      r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : 'Não enviou',
      ...questions.map((q) => qMap.get(q.id) ?? ''),
    ]
  })

  // Aba 2: Resumo por função
  const roleCounts: Record<string, { total: number; submitted: number }> = {}
  for (const r of respondents) {
    if (!roleCounts[r.role]) roleCounts[r.role] = { total: 0, submitted: 0 }
    roleCounts[r.role].total++
    if (r.submittedAt) roleCounts[r.role].submitted++
  }

  const header2 = ['Função', 'Identificados', 'Enviaram', '% Conclusão']
  const rows2 = Object.entries(roleCounts)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([role, c]) => [
      role,
      c.total,
      c.submitted,
      `${Math.round((c.submitted / c.total) * 100)}%`,
    ])

  // Monta workbook
  const wb = XLSX.utils.book_new()

  const ws1 = XLSX.utils.aoa_to_sheet([header1, ...rows1])
  // Largura das colunas
  ws1['!cols'] = [
    { wch: 30 }, // Nome
    { wch: 22 }, // Função
    { wch: 18 }, // Entrou
    { wch: 18 }, // Enviou
    ...questions.map(() => ({ wch: 40 })),
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Respostas')

  const ws2 = XLSX.utils.aoa_to_sheet([header2, ...rows2])
  ws2['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Por Função')

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[]
  const uint8 = new Uint8Array(buf)
  const filename = `brownie-pesquisa-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new Response(uint8.buffer as ArrayBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
