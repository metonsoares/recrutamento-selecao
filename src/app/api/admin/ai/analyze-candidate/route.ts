import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateFinalScore } from '@/lib/helpers'
import { AiAnalysisResult } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const { applicationId } = await req.json()
    if (!applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    const { data: application } = await supabase
      .from('applications')
      .select('*, candidates(*), jobs(*)')
      .eq('id', applicationId)
      .single()

    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

    const { data: formAnswers } = await supabase
      .from('form_answers')
      .select('answer_text, form_questions(question_text, category)')
      .eq('application_id', applicationId)

    const { data: cultureAnswers } = await supabase
      .from('culture_answers')
      .select('selected_option, score, culture_questions(question_text, culture_value)')
      .eq('application_id', applicationId)

    const { data: aiSettings } = await supabase
      .from('ai_settings')
      .select('*')
      .limit(1)
      .single()

    const candidateInfo = `
Nome: ${(application.candidates as { full_name?: string } | null)?.full_name}
Cidade: ${(application.candidates as { city?: string } | null)?.city}
Bairro: ${(application.candidates as { neighborhood?: string } | null)?.neighborhood}
Vaga: ${(application.jobs as { title?: string } | null)?.title || 'Não informada'}
Nota Cultural: ${application.culture_score ?? 'Não calculada'}
`

    const formSummary = (formAnswers || [])
      .map((a) => `${(a.form_questions as { question_text?: string } | null)?.question_text}: ${a.answer_text}`)
      .join('\n')

    const cultureSummary = (cultureAnswers || [])
      .map((a) => `${(a.culture_questions as { question_text?: string } | null)?.question_text} — Resposta: ${a.selected_option}, Pontos: ${a.score}`)
      .join('\n')

    const prompt = `${aiSettings?.analysis_prompt || 'Você é um analista de RH.'}

DADOS DO CANDIDATO:
${candidateInfo}

FORMULÁRIO DE EXPERIÊNCIA:
${formSummary || 'Não preenchido'}

TESTE CULTURAL:
${cultureSummary || 'Não preenchido'}

CULTURA DA EMPRESA:
${aiSettings?.company_culture || ''}

PERFIL IDEAL:
${aiSettings?.ideal_candidate_profile || ''}

Retorne APENAS um JSON válido com esta estrutura exata:
{
  "resumo_candidato": "string",
  "pontos_fortes": ["string"],
  "pontos_de_atencao": ["string"],
  "compatibilidade_cultural": number (0-100),
  "compatibilidade_com_a_vaga": number (0-100),
  "nota_experiencia": number (0-100),
  "nota_disponibilidade": number (0-100),
  "nota_final": number (0-100),
  "parecer_ia": "string",
  "status_sugerido": "string",
  "vaga_recomendada": "string"
}`

    let aiResult: AiAnalysisResult | null = null

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY

    if (process.env.ANTHROPIC_API_KEY) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) aiResult = JSON.parse(jsonMatch[0])
    } else if (process.env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
        }),
      })
      const data = await response.json()
      const text = data.choices?.[0]?.message?.content || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) aiResult = JSON.parse(jsonMatch[0])
    }

    if (!aiResult) {
      aiResult = {
        resumo_candidato: 'Análise manual necessária — IA não configurada.',
        pontos_fortes: [],
        pontos_de_atencao: ['Configure uma chave de IA (ANTHROPIC_API_KEY ou OPENAI_API_KEY) para análise automática.'],
        compatibilidade_cultural: application.culture_score || 0,
        compatibilidade_com_a_vaga: 50,
        nota_experiencia: 50,
        nota_disponibilidade: 50,
        nota_final: 50,
        parecer_ia: 'Análise manual necessária.',
        status_sugerido: 'analise_ia_concluida',
        vaga_recomendada: (application.jobs as { title?: string } | null)?.title || '',
      }
    }

    const weights = {
      culture: aiSettings?.culture_weight || 0.5,
      experience: aiSettings?.experience_weight || 0.35,
      availability: aiSettings?.availability_weight || 0.15,
    }

    const finalScore = calculateFinalScore(
      aiResult.compatibilidade_cultural,
      aiResult.nota_experiencia,
      aiResult.nota_disponibilidade,
      weights
    )

    await supabase.from('applications').update({
      ai_summary: aiResult.resumo_candidato,
      ai_strengths: aiResult.pontos_fortes,
      ai_risks: aiResult.pontos_de_atencao,
      ai_recommendation: aiResult.parecer_ia,
      ai_status_suggestion: aiResult.status_sugerido,
      ai_raw_response: aiResult as unknown as Record<string, unknown>,
      experience_score: aiResult.nota_experiencia,
      availability_score: aiResult.nota_disponibilidade,
      culture_score: aiResult.compatibilidade_cultural,
      final_score: finalScore,
      status: 'analise_ia_concluida',
      updated_at: new Date().toISOString(),
    }).eq('id', applicationId)

    return NextResponse.json({ success: true, result: aiResult })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
