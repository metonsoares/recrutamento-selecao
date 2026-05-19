import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateFinalScore } from '@/lib/helpers'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'
import { AiAnalysisResult } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const { applicationId } = await req.json()
    if (!applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    const [
      { data: application },
      { data: aiSettings },
    ] = await Promise.all([
      supabase.from('applications').select('*, candidates(*), jobs(*)').eq('id', applicationId).single(),
      supabase.from('ai_settings').select('*').limit(1).single(),
    ])

    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

    const [{ data: formAnswers }, { data: cultureAnswers }] = await Promise.all([
      supabase
        .from('form_answers')
        .select('answer_text, form_questions(question_text, category)')
        .eq('application_id', applicationId),
      supabase
        .from('culture_answers')
        .select('selected_option, score, culture_questions(question_text, culture_value)')
        .eq('application_id', applicationId),
    ])

    // ── Resolve API keys based on configured provider ─────────────────────────
    const configuredProvider = (aiSettings?.analysis_provider as 'anthropic' | 'openai' | null) ?? null

    let anthropicKey: string | null = null
    let openaiKey: string | null = null

    if (configuredProvider === 'anthropic') {
      anthropicKey = await getAnthropicKey()
    } else if (configuredProvider === 'openai') {
      openaiKey = await getOpenAIKey()
    } else {
      anthropicKey = await getAnthropicKey()
      if (!anthropicKey) openaiKey = await getOpenAIKey()
    }

    // ── Candidate info ────────────────────────────────────────────────────────
    const candidateName = (application.candidates as { full_name?: string } | null)?.full_name ?? ''
    const candidatePhone = (application.candidates as { phone?: string } | null)?.phone ?? ''

    const candidateInfo = `
Nome: ${candidateName}
Telefone: ${candidatePhone}
Cidade: ${(application.candidates as { city?: string } | null)?.city}
Bairro: ${(application.candidates as { neighborhood?: string } | null)?.neighborhood}
Vaga: ${(application.jobs as { title?: string } | null)?.title || 'Não informada'}
Nota Cultural: ${application.culture_score ?? 'Não calculada'}
`
    const formSummary = (formAnswers || [])
      .map(a => `${(a.form_questions as { question_text?: string } | null)?.question_text}: ${a.answer_text}`)
      .join('\n')

    const cultureSummary = (cultureAnswers || [])
      .map(a => `${(a.culture_questions as { question_text?: string } | null)?.question_text} — Resposta: ${a.selected_option}, Pontos: ${a.score}`)
      .join('\n')

    // ── Company data (full cross-reference) ───────────────────────────────────
    const desiredBehaviors = Array.isArray(aiSettings?.desired_behaviors)
      ? (aiSettings.desired_behaviors as string[]).join('\n')
      : ''
    const alertBehaviors = Array.isArray(aiSettings?.alert_behaviors)
      ? (aiSettings.alert_behaviors as string[]).join('\n')
      : ''

    const companySection = [
      aiSettings?.mission            ? `Missão: ${aiSettings.mission}` : '',
      aiSettings?.vision             ? `Visão: ${aiSettings.vision}` : '',
      aiSettings?.company_culture    ? `Cultura da empresa:\n${aiSettings.company_culture}` : '',
      aiSettings?.ideal_candidate_profile ? `Perfil ideal do colaborador:\n${aiSettings.ideal_candidate_profile}` : '',
      desiredBehaviors               ? `Comportamentos desejados:\n${desiredBehaviors}` : '',
      alertBehaviors                 ? `Comportamentos de alerta (fatores negativos):\n${alertBehaviors}` : '',
    ].filter(Boolean).join('\n\n')

    // ── Fetch configured search URLs ──────────────────────────────────────────
    const searchUrlFields = [
      { url: aiSettings?.search_url_1 as string | null, label: aiSettings?.search_url_1_label as string | null },
      { url: aiSettings?.search_url_2 as string | null, label: aiSettings?.search_url_2_label as string | null },
      { url: aiSettings?.search_url_3 as string | null, label: aiSettings?.search_url_3_label as string | null },
    ]

    const searchResults: string[] = []
    for (const { url, label } of searchUrlFields) {
      if (!url) continue
      const resolved = url
        .replace(/\{NOME\}/gi, encodeURIComponent(candidateName))
        .replace(/\{TELEFONE\}/gi, encodeURIComponent(candidatePhone))

      const sectionLabel = label || 'Pesquisa pública'
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)
        const res = await fetch(resolved, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HRBot/1.0)' },
        })
        clearTimeout(timeout)

        if (res.ok) {
          const html = await res.text()
          // Strip HTML tags, collapse whitespace, limit to 3000 chars
          const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000)
          searchResults.push(`=== ${sectionLabel} (${resolved}) ===\n${text || '(sem conteúdo legível)'}`)
        } else {
          searchResults.push(`=== ${sectionLabel} ===\nURL consultada: ${resolved}\n(Página retornou status ${res.status} — não foi possível extrair conteúdo)`)
        }
      } catch {
        searchResults.push(`=== ${sectionLabel} ===\nURL configurada: ${resolved}\n(Não foi possível acessar — verifique se o site permite consulta pública)`)
      }
    }

    const searchSection = searchResults.length > 0
      ? searchResults.join('\n\n')
      : ''

    // ── Build prompt ──────────────────────────────────────────────────────────
    const prompt = `${aiSettings?.analysis_prompt || 'Você é um analista de RH especializado em recrutamento e seleção.'}

DADOS DO CANDIDATO:
${candidateInfo}

FORMULÁRIO DE EXPERIÊNCIA:
${formSummary || 'Não preenchido'}

TESTE CULTURAL:
${cultureSummary || 'Não preenchido'}

DADOS DA EMPRESA (use para cruzar com o perfil do candidato):
${companySection || 'Não configurado'}
${searchSection ? `\nPESQUISA PÚBLICA SOBRE O CANDIDATO:\n${searchSection}` : ''}

Com base em TODOS os dados acima, analise o candidato considerando:
1. Compatibilidade cultural com a empresa (missão, visão, cultura, comportamentos desejados vs alertas)
2. Aderência ao perfil ideal de colaborador
3. Experiência e qualificações para a vaga
4. Disponibilidade e localização
5. Informações públicas encontradas (se houver)

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

    // ── Call AI ───────────────────────────────────────────────────────────────
    let aiResult: AiAnalysisResult | null = null

    if (anthropicKey) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { aiResult = JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
      }
    }

    if (!aiResult && openaiKey) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500,
        }),
      })
      const data = await response.json()
      const text = data.choices?.[0]?.message?.content || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { aiResult = JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
      }
    }

    if (!aiResult) {
      aiResult = {
        resumo_candidato: 'Análise manual necessária — IA não configurada.',
        pontos_fortes: [],
        pontos_de_atencao: ['Configure uma chave de IA na página de Configuração de IA para análise automática.'],
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
      culture: Number(aiSettings?.culture_weight) || 0.5,
      experience: Number(aiSettings?.experience_weight) || 0.35,
      availability: Number(aiSettings?.availability_weight) || 0.15,
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
