import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateFinalScore, decryptToken } from '@/lib/helpers'
import { AiAnalysisResult } from '@/types'

export async function POST(req: NextRequest) {
  let applicationId = ''
  try { applicationId = (await req.json())?.applicationId || '' } catch { /* ignore */ }
  if (!applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 })

  const result = await runAnalysis(applicationId)
  return NextResponse.json({ ok: true, ...result })
}

function parseAnswer(text: string | null | undefined): string {
  if (!text) return ''
  try {
    const p = JSON.parse(text)
    if (typeof p === 'string') return p
    if (Array.isArray(p)) return p.join(', ')
    if (typeof p === 'object' && p !== null) {
      const a = p as Record<string, string>
      return [a.street, a.number, a.complement, a.neighborhood, a.city, a.state].filter(Boolean).join(', ')
    }
    return String(p)
  } catch { return text }
}

function buildUrl(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (url, [k, v]) => url.replace(new RegExp(`\\{${k}\\}`, 'gi'), encodeURIComponent(v)),
    template
  )
}

async function runAnalysis(applicationId: string): Promise<Record<string, unknown>> {
  const t0 = Date.now()
  console.log(`[analyze] START ${applicationId}`)

  const supabase = await createSupabaseServiceClient()

  // Tudo em paralelo: placeholder + dados (chaves extraídas do ai_settings depois)
  const [
    placeholderResult,
    { data: application, error: applicationError },
    { data: aiSettings },
    { data: formAnswers },
    { data: cultureAnswers },
  ] = await Promise.all([
    supabase.from('applications')
      .update({ ai_summary: 'Análise em andamento...', updated_at: new Date().toISOString() })
      .eq('id', applicationId),
    supabase.from('applications').select('*').eq('id', applicationId).single(),
    supabase.from('ai_settings').select('*').limit(1).maybeSingle(),
    supabase.from('form_answers')
      .select('answer_text, form_questions(question_text, field_type, category)')
      .eq('application_id', applicationId),
    supabase.from('culture_answers')
      .select('selected_option, score, culture_questions(question_text, culture_value)')
      .eq('application_id', applicationId),
  ])

  const elapsed1 = Date.now() - t0
  const placeholderErr = (placeholderResult as { error?: { message: string } | null }).error
  console.log(`[analyze] parallel done ${elapsed1}ms | placeholder=${placeholderErr ? 'FAIL:' + placeholderErr.message : 'OK'} | app=${!!application} | appErr=${applicationError ? applicationError.message + ' code=' + applicationError.code : 'none'} | fa=${(formAnswers || []).length} | ca=${(cultureAnswers || []).length}`)

  if (placeholderErr) {
    return { step: 'placeholder', error: placeholderErr.message }
  }
  if (!application) {
    const appErrMsg = applicationError ? `${applicationError.message} (code: ${applicationError.code})` : 'unknown'
    console.error(`[analyze] application not found — id=${applicationId} supabaseError=${appErrMsg}`)
    return { step: 'no_application', error: `Application not found: ${applicationId} | supabase: ${appErrMsg}` }
  }

  // Extrai chaves diretamente do ai_settings já buscado (sem queries extras)
  const s = aiSettings as Record<string, unknown> | null
  function resolveKey(encrypted: unknown): string | null {
    if (!encrypted) return null
    try { return decryptToken(encrypted as string) } catch (e) {
      console.error('[analyze] decryptToken error:', String(e))
      return null
    }
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY || resolveKey(s?.anthropic_api_key_encrypted)
  const openaiKey    = process.env.OPENAI_API_KEY    || resolveKey(s?.openai_api_key_encrypted)

  // Resolve provider
  const provider = (s?.analysis_provider as string | null) ?? null
  const useAnthropic = provider === 'openai' ? null : anthropicKey
  const useOpenAI    = provider === 'anthropic' ? null : (!useAnthropic ? openaiKey : null)

  console.log(`[analyze] provider=${provider ?? 'auto'} anthropic=${!!anthropicKey} openai=${!!openaiKey} useAnthropic=${!!useAnthropic} useOpenAI=${!!useOpenAI}`)

  // Busca candidato e vaga separadamente (evita embedded select do PostgREST)
  const app = application as Record<string, unknown>
  const candidateId = app.candidate_id as string | null
  const jobId       = app.job_id as string | null

  const [{ data: candidateRow }, { data: jobRow }] = await Promise.all([
    candidateId
      ? supabase.from('candidates').select('full_name, phone, email, city, neighborhood').eq('id', candidateId).single()
      : Promise.resolve({ data: null }),
    jobId
      ? supabase.from('jobs').select('title').eq('id', jobId).single()
      : Promise.resolve({ data: null }),
  ])

  // Extrai dados do candidato
  const allFa = (formAnswers || []) as Array<Record<string, unknown>>
  const allCa = (cultureAnswers || []) as Array<Record<string, unknown>>

  function get(ft: string) {
    return parseAnswer(
      (allFa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === ft))
        ?.answer_text as string | null
    )
  }

  const cand    = candidateRow as Record<string, string> | null
  const name    = cand?.full_name ?? ''
  const phone   = cand?.phone ?? ''
  const email   = cand?.email ?? get('email')
  const city    = cand?.city ?? ''
  const bairro  = cand?.neighborhood ?? ''
  const cpf     = get('cpf')
  const birth   = get('date')
  const address = get('address')

  // Job title
  let jobTitle = (jobRow as { title?: string } | null)?.title || ''
  if (!jobTitle) {
    // Tenta pegar do formulário (campo job_select pode ser UUID ou texto)
    const raw = get('job_select')
    if (raw) {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (uuidRe.test(raw.trim())) {
        const { data: jr } = await supabase.from('jobs').select('title').eq('id', raw.trim()).maybeSingle()
        jobTitle = (jr as { title?: string } | null)?.title ?? ''
      } else {
        jobTitle = raw
      }
    }
  }
  if (!jobTitle) jobTitle = 'Não informada'

  // Monta textos do prompt
  const candidateInfo = [
    `Nome: ${name}`,
    cpf     ? `CPF: ${cpf}` : '',
    birth   ? `Nascimento: ${birth}` : '',
    phone   ? `Telefone: ${phone}` : '',
    email   ? `E-mail: ${email}` : '',
    address ? `Endereço: ${address}` : '',
    bairro  ? `Bairro: ${bairro}` : '',
    city    ? `Cidade: ${city}` : '',
    `Vaga: ${jobTitle}`,
  ].filter(Boolean).join('\n')

  const HIDE_TYPES = new Set(['date', 'celular', 'email', 'job_select', 'address', 'file_upload', 'cpf', 'cep'])
  const HIDE_WORDS = ['nome completo', 'endereço', 'bairro', 'cidade', 'telefone', 'e-mail', 'email', 'vaga de interesse', 'anexe']

  const formText = allFa
    .filter(a => {
      const q = a.form_questions as { field_type?: string; question_text?: string } | null
      if (!q || HIDE_TYPES.has(q.field_type ?? '')) return false
      return !HIDE_WORDS.some(w => (q.question_text ?? '').toLowerCase().includes(w))
    })
    .map(a =>
      `- ${(a.form_questions as { question_text?: string } | null)?.question_text}: ${parseAnswer(a.answer_text as string | null)}`
    )
    .join('\n') || 'Não preenchido'

  const cultureText = allCa
    .map(a =>
      `- ${(a.culture_questions as { question_text?: string } | null)?.question_text} -> "${a.selected_option}" (${a.score}/10)`
    )
    .join('\n') || 'Não preenchido'

  const companyParts: string[] = []
  if (s?.mission)                 companyParts.push(`Missao: ${s.mission}`)
  if (s?.vision)                  companyParts.push(`Visao: ${s.vision}`)
  if (s?.company_culture)         companyParts.push(`Cultura:\n${s.company_culture}`)
  if (s?.ideal_candidate_profile) companyParts.push(`Perfil ideal:\n${s.ideal_candidate_profile}`)
  if (Array.isArray(s?.desired_behaviors) && (s.desired_behaviors as string[]).length) {
    companyParts.push(`Comportamentos desejados:\n${(s.desired_behaviors as string[]).join('\n')}`)
  }
  if (Array.isArray(s?.alert_behaviors) && (s.alert_behaviors as string[]).length) {
    companyParts.push(`Comportamentos de ALERTA:\n${(s.alert_behaviors as string[]).join('\n')}`)
  }

  // URLs de pesquisa pública (paralelo, timeout 1.5s cada)
  const vars: Record<string, string> = {
    NOME: name, CPF: cpf, TELEFONE: phone, EMAIL: email,
    DATA_NASCIMENTO: birth, CIDADE: city, BAIRRO: bairro, VAGA: jobTitle,
  }
  const urlFields = [
    { url: s?.search_url_1 as string | null, label: s?.search_url_1_label as string | null },
    { url: s?.search_url_2 as string | null, label: s?.search_url_2_label as string | null },
    { url: s?.search_url_3 as string | null, label: s?.search_url_3_label as string | null },
  ].filter(f => !!f.url)

  const searchSnippets: string[] = []
  if (urlFields.length > 0) {
    const fetched = await Promise.all(urlFields.map(async ({ url, label }) => {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 800)
        const res = await fetch(buildUrl(url!, vars), {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        })
        clearTimeout(t)
        if (!res.ok) return null
        const text = (await res.text())
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 1000)
        return text ? `=== ${label || 'Pesquisa'} ===\n${text}` : null
      } catch { return null }
    }))
    searchSnippets.push(...(fetched.filter(Boolean) as string[]))
  }
  console.log(`[analyze] URLs done ${Date.now() - t0}ms`)

  // Prompt
  const systemPrompt = (s?.analysis_prompt as string | null) ||
    'Voce e um analista de RH especializado em recrutamento. Seja objetivo e imparcial.'

  const jsonSchema = `{"resumo_candidato":"2-3 frases sobre o perfil","pontos_fortes":["p1","p2"],"pontos_de_atencao":["p1"],"compatibilidade_cultural":0,"compatibilidade_com_a_vaga":0,"nota_experiencia":0,"nota_disponibilidade":0,"nota_final":0,"parecer_ia":"recomendacao em 1 frase","status_sugerido":"analise_ia_concluida","vaga_recomendada":"${jobTitle}"}`

  const userPrompt = [
    `CANDIDATO:\n${candidateInfo}`,
    `FORMULARIO:\n${formText}`,
    `TESTE CULTURAL:\n${cultureText}`,
    `EMPRESA:\n${companyParts.join('\n\n') || 'Nao configurado'}`,
    searchSnippets.length ? `PESQUISA PUBLICA:\n${searchSnippets.join('\n\n')}` : '',
    `Retorne APENAS JSON valido sem markdown:\n${jsonSchema}`,
  ].filter(Boolean).join('\n\n')

  // Chama IA (timeout 25s — geração de JSON leva mais que 5s)
  let aiResult: AiAnalysisResult | null = null
  let aiProvider = 'none'

  console.log(`[analyze] calling AI ${Date.now() - t0}ms`)

  if (useAnthropic) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 25000)
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'x-api-key': useAnthropic,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
      clearTimeout(t)
      console.log(`[analyze] Anthropic status=${res.status} ${Date.now() - t0}ms`)
      if (res.ok) {
        const body = await res.json()
        const txt = body.content?.[0]?.text || ''
        console.log(`[analyze] Anthropic raw (first 300): ${txt.slice(0, 300)}`)
        const m = txt.match(/\{[\s\S]*\}/)
        if (m) {
          try { aiResult = JSON.parse(m[0]); aiProvider = 'anthropic' } catch (je) {
            console.error('[analyze] JSON parse error:', String(je), 'text:', m[0].slice(0, 200))
          }
        } else {
          console.warn('[analyze] No JSON found in Anthropic response. stop_reason:', body.stop_reason, 'len:', txt.length)
        }
      } else {
        const err = await res.json().catch(() => ({}))
        console.error('[analyze] Anthropic HTTP error:', res.status, JSON.stringify(err).slice(0, 300))
      }
    } catch (e) {
      console.error('[analyze] Anthropic timeout/error:', String(e))
    }
  }

  if (!aiResult && useOpenAI) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 15000)
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Authorization': `Bearer ${useOpenAI}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 512,
          response_format: { type: 'json_object' },
        }),
      })
      clearTimeout(t)
      console.log(`[analyze] OpenAI status=${res.status} ${Date.now() - t0}ms`)
      if (res.ok) {
        const txt = (await res.json()).choices?.[0]?.message?.content || ''
        try {
          aiResult = JSON.parse(txt)
          aiProvider = 'openai'
        } catch {
          const m = txt.match(/\{[\s\S]*\}/)
          if (m) {
            try { aiResult = JSON.parse(m[0]); aiProvider = 'openai' } catch { /* ignore */ }
          }
        }
      }
    } catch (e) {
      console.error('[analyze] OpenAI timeout/error:', String(e))
    }
  }

  // Fallback
  if (!aiResult) {
    const reason = (!useAnthropic && !useOpenAI)
      ? 'Chave de IA nao encontrada. Acesse Configuracoes -> Configuracao IA.'
      : 'A IA nao retornou resposta valida. Tente novamente.'
    console.warn(`[analyze] Fallback useAnthropic=${!!useAnthropic} useOpenAI=${!!useOpenAI}`)
    aiResult = {
      resumo_candidato: reason,
      pontos_fortes: [],
      pontos_de_atencao: ['Verifique as chaves de API nas configuracoes.'],
      compatibilidade_cultural: (application as Record<string, unknown>).culture_score as number || 0,
      compatibilidade_com_a_vaga: 0,
      nota_experiencia: 0,
      nota_disponibilidade: 0,
      nota_final: 0,
      parecer_ia: 'Analise automatica indisponivel.',
      status_sugerido: 'analise_ia_concluida',
      vaga_recomendada: jobTitle,
    }
    aiProvider = 'fallback'
  }

  // Salva resultado final
  const weights = {
    culture:      Number(s?.culture_weight)      || 0.5,
    experience:   Number(s?.experience_weight)   || 0.35,
    availability: Number(s?.availability_weight) || 0.15,
  }
  const finalScore = calculateFinalScore(
    aiResult.compatibilidade_cultural,
    aiResult.nota_experiencia,
    aiResult.nota_disponibilidade,
    weights
  )

  console.log(`[analyze] saving provider=${aiProvider} score=${finalScore} elapsed=${Date.now() - t0}ms`)

  const { error: saveErr } = await supabase.from('applications').update({
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
  }).eq('id', applicationId)

  if (saveErr) {
    console.error('[analyze] Save error:', saveErr.message)
    return { step: 'db_save', error: saveErr.message, provider: aiProvider }
  }

  console.log(`[analyze] DONE provider=${aiProvider} score=${finalScore} total=${Date.now() - t0}ms`)
  return { provider: aiProvider, score: finalScore, elapsed: Date.now() - t0 }
}
