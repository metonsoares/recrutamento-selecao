import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateFinalScore } from '@/lib/helpers'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'
import { AiAnalysisResult } from '@/types'

// ─── Entry point — retorna 200 imediatamente, processa em background ──────────
// Necessário para evitar timeout de 10s do Vercel (plano Hobby)

export async function POST(req: NextRequest) {
  let applicationId = ''
  try {
    const body = await req.json()
    applicationId = body?.applicationId || ''
  } catch { /* ignore */ }

  if (!applicationId) {
    return NextResponse.json({ error: 'applicationId required' }, { status: 400 })
  }

  after(async () => {
    try {
      await runAnalysis(applicationId)
    } catch (err) {
      console.error('[analyze-candidate] unhandled error:', err)
    }
  })

  return NextResponse.json({ ok: true, status: 'processing' })
}

// ─── Helper: parse JSON-stringified answer ────────────────────────────────────

function parseAnswer(text: string | null | undefined): string {
  if (!text) return ''
  try {
    const p = JSON.parse(text)
    if (typeof p === 'string') return p
    if (Array.isArray(p)) return p.join(', ')
    if (typeof p === 'object' && p !== null) {
      const addr = p as Record<string, string>
      return [addr.street, addr.number, addr.complement, addr.neighborhood, addr.city, addr.state]
        .filter(Boolean).join(', ')
    }
    return String(p)
  } catch { return text }
}

// ─── Helper: replace URL variables with candidate data ────────────────────────

function buildSearchUrl(
  template: string,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce((url, [key, value]) => {
    return url.replace(new RegExp(`\\{${key}\\}`, 'gi'), encodeURIComponent(value))
  }, template)
}

// ─── Análise completa ─────────────────────────────────────────────────────────

async function runAnalysis(applicationId: string) {
  const supabase = await createSupabaseServiceClient()

  const [
    { data: application },
    { data: aiSettings },
  ] = await Promise.all([
    supabase.from('applications').select('*, candidates(*), jobs(*)').eq('id', applicationId).single(),
    supabase.from('ai_settings').select('*').limit(1).single(),
  ])

  if (!application) {
    console.error('[analyze-candidate] application not found:', applicationId)
    return
  }

  const [{ data: formAnswers }, { data: cultureAnswers }] = await Promise.all([
    supabase
      .from('form_answers')
      .select('answer_text, form_questions(question_text, field_type, category)')
      .eq('application_id', applicationId),
    supabase
      .from('culture_answers')
      .select('selected_option, score, culture_questions(question_text, culture_value)')
      .eq('application_id', applicationId),
  ])

  // ── Resolve API keys ──────────────────────────────────────────────────────
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

  // ── Extract personal data from form_answers ───────────────────────────────
  const allFa = formAnswers || []

  function getByFieldType(fieldType: string): string {
    return parseAnswer(
      allFa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === fieldType)?.answer_text
    )
  }

  const candidateName  = (application.candidates as { full_name?: string } | null)?.full_name ?? ''
  const candidatePhone = (application.candidates as { phone?: string } | null)?.phone ?? ''
  const candidateEmail = (application.candidates as { email?: string } | null)?.email ?? getByFieldType('email')
  const candidateCity  = (application.candidates as { city?: string } | null)?.city ?? ''
  const candidateBairro = (application.candidates as { neighborhood?: string } | null)?.neighborhood ?? ''
  const candidateCpf   = getByFieldType('cpf')
  const candidateBirth = getByFieldType('date')
  const candidateAddress = getByFieldType('address')
  // Job title: prefer jobs join, fallback to form_answer with field_type='job_select'
  const jobTitle =
    (application.jobs as { title?: string } | null)?.title ||
    getByFieldType('job_select') ||
    'Não informada'

  // ── Build candidate info block ────────────────────────────────────────────
  const candidateInfo = [
    `Nome completo: ${candidateName}`,
    candidateCpf         ? `CPF: ${candidateCpf}` : '',
    candidateBirth       ? `Data de nascimento: ${candidateBirth}` : '',
    candidatePhone       ? `Telefone: ${candidatePhone}` : '',
    candidateEmail       ? `E-mail: ${candidateEmail}` : '',
    candidateAddress     ? `Endereço: ${candidateAddress}` : '',
    candidateBairro      ? `Bairro: ${candidateBairro}` : '',
    candidateCity        ? `Cidade: ${candidateCity}` : '',
    `Vaga de interesse: ${jobTitle}`,
    application.culture_score != null ? `Nota Cultural prévia: ${application.culture_score}` : '',
  ].filter(Boolean).join('\n')

  // ── Form answers (experience section only) ────────────────────────────────
  const HIDE_FIELD_TYPES = new Set(['date','celular','email','job_select','address','file_upload','cpf','cep'])
  const HIDE_PATTERNS = ['nome completo','endereço','bairro','cidade','telefone','e-mail','email','vaga de interesse','anexe']

  const formSummary = allFa
    .filter(a => {
      const q = a.form_questions as { field_type?: string; question_text?: string } | null
      if (!q) return false
      if (HIDE_FIELD_TYPES.has(q.field_type ?? '')) return false
      const ql = (q.question_text ?? '').toLowerCase()
      return !HIDE_PATTERNS.some(p => ql.includes(p))
    })
    .map(a => `- ${(a.form_questions as { question_text?: string } | null)?.question_text}: ${parseAnswer(a.answer_text)}`)
    .join('\n')

  const cultureSummary = (cultureAnswers || [])
    .map(a => `- ${(a.culture_questions as { question_text?: string } | null)?.question_text} → "${a.selected_option}" (${a.score}/10)`)
    .join('\n')

  // ── Company data ──────────────────────────────────────────────────────────
  const desiredBehaviors = Array.isArray(aiSettings?.desired_behaviors)
    ? (aiSettings.desired_behaviors as string[]).join('\n') : ''
  const alertBehaviors = Array.isArray(aiSettings?.alert_behaviors)
    ? (aiSettings.alert_behaviors as string[]).join('\n') : ''

  const companySection = [
    aiSettings?.mission                 ? `• Missão: ${aiSettings.mission}` : '',
    aiSettings?.vision                  ? `• Visão: ${aiSettings.vision}` : '',
    aiSettings?.company_culture         ? `• Cultura:\n${aiSettings.company_culture}` : '',
    aiSettings?.ideal_candidate_profile ? `• Perfil ideal do colaborador:\n${aiSettings.ideal_candidate_profile}` : '',
    desiredBehaviors                    ? `• Comportamentos desejados:\n${desiredBehaviors}` : '',
    alertBehaviors                      ? `• Comportamentos de ALERTA (fatores negativos):\n${alertBehaviors}` : '',
  ].filter(Boolean).join('\n\n')

  // ── Search URLs — variables built from ALL personal data ──────────────────
  // Variables available: {NOME}, {CPF}, {TELEFONE}, {EMAIL}, {DATA_NASCIMENTO},
  //                      {CIDADE}, {BAIRRO}, {VAGA}
  const urlVars: Record<string, string> = {
    NOME:             candidateName,
    CPF:              candidateCpf,
    TELEFONE:         candidatePhone,
    EMAIL:            candidateEmail,
    DATA_NASCIMENTO:  candidateBirth,
    CIDADE:           candidateCity,
    BAIRRO:           candidateBairro,
    VAGA:             jobTitle,
  }

  const searchUrlFields = [
    { url: aiSettings?.search_url_1 as string | null, label: aiSettings?.search_url_1_label as string | null },
    { url: aiSettings?.search_url_2 as string | null, label: aiSettings?.search_url_2_label as string | null },
    { url: aiSettings?.search_url_3 as string | null, label: aiSettings?.search_url_3_label as string | null },
  ]

  const searchResults: string[] = []
  for (const { url, label } of searchUrlFields) {
    if (!url) continue
    const resolved = buildSearchUrl(url, urlVars)
    const sectionLabel = label || 'Pesquisa pública'
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 6000)
      const res = await fetch(resolved, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HRBot/1.0)' },
      })
      clearTimeout(timeout)
      if (res.ok) {
        const html = await res.text()
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 2500)
        if (text) searchResults.push(`=== ${sectionLabel} (${resolved}) ===\n${text}`)
      }
    } catch { /* URL inacessível — ignora silenciosamente */ }
  }

  // ── System prompt (role/behavior) ─────────────────────────────────────────
  // O prompt configurado define o PAPEL da IA (system message)
  const systemPrompt = aiSettings?.analysis_prompt ||
    'Você é um analista de RH especializado em recrutamento e seleção.'

  // ── User prompt (dados do candidato) ─────────────────────────────────────
  const userPrompt = `
DADOS PESSOAIS DO CANDIDATO:
${candidateInfo}

RESPOSTAS DO FORMULÁRIO DE EXPERIÊNCIA:
${formSummary || 'Não preenchido'}

TESTE CULTURAL (respostas + pontuações):
${cultureSummary || 'Não preenchido'}

DADOS DA EMPRESA (use para avaliar compatibilidade):
${companySection || '(Não configurado — acesse Configurações → Empresa e Cultura)'}

${searchResults.length ? `PESQUISA PÚBLICA SOBRE O CANDIDATO:\n${searchResults.join('\n\n')}` : ''}

---

Com base em TODOS os dados acima, analise o candidato considerando:
1. Compatibilidade cultural com a empresa (missão, visão, comportamentos desejados vs alertas)
2. Aderência ao perfil ideal de colaborador
3. Experiência e qualificações para a vaga "${jobTitle}"
4. Disponibilidade (finais de semana, horários, restrições declaradas)
5. Localização em relação ao estabelecimento
6. Informações públicas encontradas (se houver — processos, benefícios, reputação)

Retorne APENAS um JSON válido, sem markdown, sem explicação extra:
{
  "resumo_candidato": "2 a 3 frases objetivas sobre o perfil geral",
  "pontos_fortes": ["ponto 1", "ponto 2", "ponto 3"],
  "pontos_de_atencao": ["ponto 1", "ponto 2"],
  "compatibilidade_cultural": number (0-100),
  "compatibilidade_com_a_vaga": number (0-100),
  "nota_experiencia": number (0-100),
  "nota_disponibilidade": number (0-100),
  "nota_final": number (0-100),
  "parecer_ia": "recomendação final objetiva em 1 frase",
  "status_sugerido": "apto_para_entrevista | banco_de_talentos | reprovado | analise_ia_concluida",
  "vaga_recomendada": "título da vaga recomendada ou a atual"
}`

  // ── Call AI ───────────────────────────────────────────────────────────────
  let aiResult: AiAnalysisResult | null = null

  if (anthropicKey) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1500,
          system: systemPrompt,                       // ← system prompt = papel da IA
          messages: [{ role: 'user', content: userPrompt }], // ← dados do candidato
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        console.error('[analyze-candidate] Anthropic error:', JSON.stringify(data))
      } else {
        const text = data.content?.[0]?.text || ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          try { aiResult = JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error('[analyze-candidate] Anthropic fetch error:', e)
    }
  }

  if (!aiResult && openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },   // ← system prompt = papel da IA
            { role: 'user',   content: userPrompt },     // ← dados do candidato
          ],
          max_tokens: 1500,
          response_format: { type: 'json_object' },      // força JSON puro
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        console.error('[analyze-candidate] OpenAI error:', JSON.stringify(data))
      } else {
        const text = data.choices?.[0]?.message?.content || ''
        try { aiResult = JSON.parse(text) } catch {
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) try { aiResult = JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error('[analyze-candidate] OpenAI fetch error:', e)
    }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  if (!aiResult) {
    console.warn('[analyze-candidate] No AI result — fallback for application:', applicationId)
    aiResult = {
      resumo_candidato: 'Análise manual necessária — verifique as chaves de IA em Configurações → Configuração IA.',
      pontos_fortes: [],
      pontos_de_atencao: ['Nenhuma IA disponível retornou resultado. Verifique as chaves de API configuradas.'],
      compatibilidade_cultural: application.culture_score || 0,
      compatibilidade_com_a_vaga: 50,
      nota_experiencia: 50,
      nota_disponibilidade: 50,
      nota_final: 50,
      parecer_ia: 'Análise automática indisponível — avalie manualmente.',
      status_sugerido: 'analise_ia_concluida',
      vaga_recomendada: jobTitle,
    }
  }

  // ── Calculate final score ─────────────────────────────────────────────────
  const weights = {
    culture:      Number(aiSettings?.culture_weight)      || 0.5,
    experience:   Number(aiSettings?.experience_weight)   || 0.35,
    availability: Number(aiSettings?.availability_weight) || 0.15,
  }

  const finalScore = calculateFinalScore(
    aiResult.compatibilidade_cultural,
    aiResult.nota_experiencia,
    aiResult.nota_disponibilidade,
    weights
  )

  // ── Save to DB ────────────────────────────────────────────────────────────
  const { error: updateError } = await supabase.from('applications').update({
    ai_summary:          aiResult.resumo_candidato,
    ai_strengths:        aiResult.pontos_fortes,
    ai_risks:            aiResult.pontos_de_atencao,
    ai_recommendation:   aiResult.parecer_ia,
    ai_status_suggestion: aiResult.status_sugerido,
    ai_raw_response:     aiResult as unknown as Record<string, unknown>,
    experience_score:    aiResult.nota_experiencia,
    availability_score:  aiResult.nota_disponibilidade,
    culture_score:       aiResult.compatibilidade_cultural,
    final_score:         finalScore,
    status:              'analise_ia_concluida',
    updated_at:          new Date().toISOString(),
  }).eq('id', applicationId)

  if (updateError) {
    console.error('[analyze-candidate] DB update error:', updateError)
  } else {
    console.log(`[analyze-candidate] Done ✓ applicationId=${applicationId} final_score=${finalScore} provider=${anthropicKey ? 'anthropic' : 'openai'}`)
  }
}
