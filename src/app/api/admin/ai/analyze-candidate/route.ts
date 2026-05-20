import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateFinalScore } from '@/lib/helpers'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'
import { AiAnalysisResult } from '@/types'

// ─── Entry point ──────────────────────────────────────────────────────────────
// Executa a análise de forma SÍNCRONA (sem after()).
// Claude Haiku responde em 2-5s → cabe no limite de 10s do Vercel Hobby.
// URLs de pesquisa são buscadas em paralelo com timeout de 2s cada.

export async function POST(req: NextRequest) {
    let applicationId = ''
    try {
          const body = await req.json()
          applicationId = body?.applicationId || ''
    } catch { /* ignore */ }

  if (!applicationId) {
        return NextResponse.json({ error: 'applicationId required' }, { status: 400 })
  }

  const debugLog: string[] = []
      let dbError: string | null = null

  try {
        const result = await runAnalysis(applicationId, debugLog)
        dbError = result?.dbError ?? null
  } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[analyze-candidate] runAnalysis error:', msg, err)
        debugLog.push('runAnalysis threw: ' + msg)
  }

  return NextResponse.json({ ok: true, status: 'done', dbError, debug: debugLog })
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

// ─── Helper: replace URL variables ────────────────────────────────────────────

function buildSearchUrl(template: string, vars: Record<string, string>): string {
    return Object.entries(vars).reduce((url, [key, value]) => {
          return url.replace(new RegExp(`\\{${key}\\}`, 'gi'), encodeURIComponent(value))
    }, template)
}

// ─── Análise completa ─────────────────────────────────────────────────────────

async function runAnalysis(applicationId: string, log: string[]): Promise<{ dbError: string | null }> {
    log.push('start runAnalysis: ' + applicationId)
    const supabase = await createSupabaseServiceClient()
    log.push('supabase client created')

  const [
    { data: application, error: appError },
    { data: aiSettings, error: settingsError },
      ] = await Promise.all([
        supabase.from('applications').select('*, candidates!applications_candidate_id_fkey(*), jobs(*)').eq('id', applicationId).single(),
        supabase.from('ai_settings').select('*').limit(1).single(),
      ])

  if (appError) log.push('appError: ' + JSON.stringify(appError))
    if (settingsError) log.push('settingsError: ' + JSON.stringify(settingsError))

  if (!application) {
        log.push('application not found for id: ' + applicationId)
        console.error('[analyze-candidate] application not found:', applicationId)
        return { dbError: null }
  }
    log.push('application found: ' + application.id)

  const [{ data: formAnswers, error: faError }, { data: cultureAnswers, error: caError }] = await Promise.all([
        supabase
          .from('form_answers')
          .select('answer_text, form_questions(question_text, field_type, category)')
          .eq('application_id', applicationId),
        supabase
          .from('culture_answers')
          .select('selected_option, score, culture_questions(question_text, culture_value)')
          .eq('application_id', applicationId),
      ])

  if (faError) log.push('faError: ' + JSON.stringify(faError))
    if (caError) log.push('caError: ' + JSON.stringify(caError))
    log.push('formAnswers count: ' + (formAnswers?.length ?? 0))
    log.push('cultureAnswers count: ' + (cultureAnswers?.length ?? 0))

  // ── Resolve API keys ──────────────────────────────────────────────────────
  const configuredProvider = (aiSettings?.analysis_provider as 'anthropic' | 'openai' | null) ?? null
    log.push('configuredProvider: ' + configuredProvider)
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

  log.push('anthropicKey present: ' + !!anthropicKey)
    log.push('openaiKey present: ' + !!openaiKey)

  // ── Extract personal data from form_answers ───────────────────────────────
  const allFa = formAnswers || []

      function getByFieldType(fieldType: string): string {
            return parseAnswer(
                    allFa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === fieldType)?.answer_text
                  )
      }

  const candidateName   = (application.candidates as { full_name?: string } | null)?.full_name ?? ''
    const candidatePhone  = (application.candidates as { phone?: string } | null)?.phone ?? ''
    const candidateEmail  = (application.candidates as { email?: string } | null)?.email ?? getByFieldType('email')
    const candidateCity   = (application.candidates as { city?: string } | null)?.city ?? ''
    const candidateBairro = (application.candidates as { neighborhood?: string } | null)?.neighborhood ?? ''
    const candidateCpf    = getByFieldType('cpf')
    const candidateBirth  = getByFieldType('date')
    const candidateAddress = getByFieldType('address')

  // Job title: prefer jobs join, fallback to job_select form answer (pode ser UUID — faz lookup)
  let jobTitle = (application.jobs as { title?: string } | null)?.title || ''
    if (!jobTitle) {
          const jobSelectRaw = getByFieldType('job_select')
          if (jobSelectRaw) {
                  // Se parecer UUID, busca o título no banco
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                  if (uuidRegex.test(jobSelectRaw.trim())) {
                            const { data: jobRow } = await supabase
                              .from('jobs').select('title').eq('id', jobSelectRaw.trim()).single()
                            jobTitle = jobRow?.title ?? jobSelectRaw
                  } else {
                            jobTitle = jobSelectRaw
                  }
          }
    }
    if (!jobTitle) jobTitle = 'Não informada'
    log.push('jobTitle: ' + jobTitle)

  // ── Build candidate info block ────────────────────────────────────────────
  const candidateInfo = [
        `Nome completo: ${candidateName}`,
        candidateCpf     ? `CPF: ${candidateCpf}` : '',
        candidateBirth   ? `Data de nascimento: ${candidateBirth}` : '',
        candidatePhone   ? `Telefone: ${candidatePhone}` : '',
        candidateEmail   ? `E-mail: ${candidateEmail}` : '',
        candidateAddress ? `Endereço: ${candidateAddress}` : '',
        candidateBairro  ? `Bairro: ${candidateBairro}` : '',
        candidateCity    ? `Cidade: ${candidateCity}` : '',
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
        alertBehaviors                      ? `• Comportamentos de ALERTA:\n${alertBehaviors}` : '',
      ].filter(Boolean).join('\n\n')

  // ── Search URLs — busca em PARALELO com timeout de 1s cada ────────────────
  const urlVars: Record<string, string> = {
        NOME: candidateName, CPF: candidateCpf, TELEFONE: candidatePhone,
        EMAIL: candidateEmail, DATA_NASCIMENTO: candidateBirth,
        CIDADE: candidateCity, BAIRRO: candidateBairro, VAGA: jobTitle,
  }

  const searchUrlFields = [
    { url: aiSettings?.search_url_1 as string | null, label: aiSettings?.search_url_1_label as string | null },
    { url: aiSettings?.search_url_2 as string | null, label: aiSettings?.search_url_2_label as string | null },
    { url: aiSettings?.search_url_3 as string | null, label: aiSettings?.search_url_3_label as string | null },
      ]

  // Busca paralela, 1s por URL
  const searchResults = (await Promise.all(
        searchUrlFields
          .filter(({ url }) => !!url)
          .map(async ({ url, label }) => {
                    const resolved = buildSearchUrl(url!, urlVars)
                    const sectionLabel = label || 'Pesquisa pública'
                    try {
                                const ctrl = new AbortController()
                                const t = setTimeout(() => ctrl.abort(), 1000)
                                const res = await fetch(resolved, {
                                              signal: ctrl.signal,
                                              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HRBot/1.0)' },
                                })
                                clearTimeout(t)
                                if (!res.ok) return null
                                const html = await res.text()
                                const text = html
                                  .replace(/<script[\s\S]*?<\/script>/gi, '')
                                  .replace(/<style[\s\S]*?<\/style>/gi, '')
                                  .replace(/<[^>]+>/g, ' ')
                                  .replace(/\s+/g, ' ').trim().slice(0, 2000)
                                return text ? `=== ${sectionLabel} ===\n${text}` : null
                    } catch { return null }
          })
      )).filter(Boolean) as string[]

  // ── Prompts ───────────────────────────────────────────────────────────────
  const systemPrompt = (aiSettings?.analysis_prompt as string | null) ||
        'Você é um analista de RH especializado em recrutamento e seleção.'

  const userPrompt = `
  DADOS PESSOAIS DO CANDIDATO:
  ${candidateInfo}

  RESPOSTAS DO FORMULÁRIO DE EXPERIÊNCIA:
  ${formSummary || 'Não preenchido'}

  TESTE CULTURAL (respostas + pontuações):
  ${cultureSummary || 'Não preenchido'}

  DADOS DA EMPRESA (use para avaliar compatibilidade):
  ${companySection || '(Não configurado)'}

  ${searchResults.length ? `PESQUISA PÚBLICA SOBRE O CANDIDATO:\n${searchResults.join('\n\n')}` : ''}

  ---

  Com base em TODOS os dados acima, analise o candidato e retorne APENAS um JSON válido, sem markdown:
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

  // ── Call AI com timeout de 7s ─────────────────────────────────────────────
  let aiResult: AiAnalysisResult | null = null

  if (anthropicKey) {
        log.push('calling Anthropic API...')
        try {
                const ctrl = new AbortController()
                const t = setTimeout(() => ctrl.abort(), 7000)
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                          method: 'POST',
                          signal: ctrl.signal,
                          headers: {
                                      'x-api-key': anthropicKey,
                                      'anthropic-version': '2023-06-01',
                                      'content-type': 'application/json',
                          },
                          body: JSON.stringify({
                                      model: 'claude-3-5-haiku-20241022',
                                      max_tokens: 1200,
                                      system: systemPrompt,
                                      messages: [{ role: 'user', content: userPrompt }],
                          }),
                })
                clearTimeout(t)
                const data = await response.json()
                if (!response.ok) {
                          const errMsg = JSON.stringify(data)
                          log.push('Anthropic error ' + response.status + ': ' + errMsg)
                          console.error('[analyze-candidate] Anthropic error:', errMsg)
                } else {
                          const text = data.content?.[0]?.text || ''
                          const m = text.match(/\{[\s\S]*\}/)
                          if (m) {
                                      try {
                                                    aiResult = JSON.parse(m[0])
                                                    log.push('Anthropic success, aiResult parsed')
                                      } catch (parseErr) {
                                                    log.push('Anthropic JSON parse error: ' + String(parseErr))
                                      }
                          } else {
                                      log.push('Anthropic response has no JSON block, text: ' + text.substring(0, 200))
                          }
                }
        } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                log.push('Anthropic fetch error: ' + msg)
                console.error('[analyze-candidate] Anthropic fetch error:', e)
        }
  }

  if (!aiResult && openaiKey) {
        log.push('calling OpenAI API...')
        try {
                const ctrl = new AbortController()
                const t = setTimeout(() => ctrl.abort(), 7000)
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                          method: 'POST',
                          signal: ctrl.signal,
                          headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                                      model: 'gpt-4o-mini',
                                      messages: [
                                        { role: 'system', content: systemPrompt },
                                        { role: 'user', content: userPrompt },
                                                  ],
                                      max_tokens: 1200,
                                      response_format: { type: 'json_object' },
                          }),
                })
                clearTimeout(t)
                const data = await response.json()
                if (!response.ok) {
                          const errMsg = JSON.stringify(data)
                          log.push('OpenAI error ' + response.status + ': ' + errMsg)
                          console.error('[analyze-candidate] OpenAI error:', errMsg)
                } else {
                          const text = data.choices?.[0]?.message?.content || ''
                          try {
                                      aiResult = JSON.parse(text)
                                      log.push('OpenAI success, aiResult parsed')
                          } catch {
                                      const m = text.match(/\{[\s\S]*\}/)
                                      if (m) {
                                                    try {
                                                                    aiResult = JSON.parse(m[0])
                                                                    log.push('OpenAI success (extracted JSON), aiResult parsed')
                                                    } catch { log.push('OpenAI JSON parse error') }
                                      }
                          }
                }
        } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                log.push('OpenAI fetch error: ' + msg)
                console.error('[analyze-candidate] OpenAI fetch error:', e)
        }
  }

  // ── Fallback quando não há chave de IA configurada ────────────────────────
  if (!aiResult) {
        log.push('using fallback aiResult (no AI key or AI failed)')
        console.warn('[analyze-candidate] No AI result — using fallback for:', applicationId)
        aiResult = {
                resumo_candidato: 'Análise manual necessária — configure uma chave de IA em Configurações → Configuração IA.',
                pontos_fortes: [],
                pontos_de_atencao: ['Nenhuma IA disponível. Verifique as chaves de API configuradas.'],
                compatibilidade_cultural: application.culture_score || 0,
                compatibilidade_com_a_vaga: 50,
                nota_experiencia: 50,
                nota_disponibilidade: 50,
                nota_final: 50,
                parecer_ia: 'Configure uma chave de API (Anthropic ou OpenAI) para análise automática.',
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
          weights,
        )
    log.push('finalScore: ' + finalScore)

  // ── Save to DB ────────────────────────────────────────────────────────────
  log.push('saving to DB...')
    const updatePayload = {
          ai_summary:           aiResult.resumo_candidato,
          ai_strengths:         aiResult.pontos_fortes,
          ai_risks:             aiResult.pontos_de_atencao,
          ai_recommendation:    aiResult.parecer_ia,
          ai_status_suggestion: aiResult.status_sugerido,
          ai_raw_response:      aiResult as unknown as Record<string, unknown>,
          experience_score:     aiResult.nota_experiencia,
          availability_score:   aiResult.nota_disponibilidade,
          culture_score:        aiResult.compatibilidade_cultural,
          final_score:          finalScore,
          status:               'analise_ia_concluida',
          updated_at:           new Date().toISOString(),
    }

  const { error: updateError } = await supabase
      .from('applications')
      .update(updatePayload)
      .eq('id', applicationId)

  if (updateError) {
        const errMsg = JSON.stringify(updateError)
        log.push('DB update error: ' + errMsg)
        console.error('[analyze-candidate] DB update error:', updateError)
        return { dbError: errMsg }
  }

  log.push('DB update success for applicationId=' + applicationId + ' score=' + finalScore)
    console.log(`[analyze-candidate] ✓ done applicationId=${applicationId} score=${finalScore} provider=${anthropicKey ? 'anthropic' : 'openai'}`)
    return { dbError: null }
}
