import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateFinalScore } from '@/lib/helpers'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'
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
    (url, [k, v]) => url.replace(new RegExp(`\\{${k}\\}`, 'gi'), encodeURIComponent(v)), template)
}

async function runAnalysis(applicationId: string): Promise<Record<string, unknown>> {
  const t0 = Date.now()
  console.log(`[analyze] ▶ START ${applicationId}`)

  const supabase = await createSupabaseServiceClient()

  // ── Tudo em paralelo desde o início: placeholder + dados + chaves ─────────
  const [
    placeholderResult,
    { data: application },
    { data: aiSettings },
    { data: formAnswers },
    { data: cultureAnswers },
    anthropicKey,
    openaiKey,
  ] = await Promise.all([
    // Salva placeholder imediatamente (cliente vê algo em <1s)
    supabase.from('applications')
      .update({ ai_summary: '⏳ Análise em andamento...', updated_at: new Date().toISOString() })
      .eq('id', applicationId),
    // Dados da candidatura
    supabase.from('applications').select('*, candidates(*), jobs(*)').eq('id', applicationId).single(),
    // Configurações de IA (prompt, empresa, pesos, URLs)
    supabase.from('ai_settings').select('*').limit(1).maybeSingle(),
    // Respostas do formulário
    supabase.from('form_answers')
      .select('answer_text, form_questions(question_text, field_type, category)')
      .eq('application_id', applicationId),
    // Respostas do teste cultural
    supabase.from('culture_answers')
      .select('selected_option, score, culture_questions(question_text, culture_value)')
      .eq('application_id', applicationId),
    // Chaves de IA (mesmo método do "Ajustar com IA" — funciona)
    getAnthropicKey(),
    getOpenAIKey(),
  ])

  const elapsed1 = Date.now() - t0
  const placeholderErr = (placeholderResult as { error?: { message: string } | null }).error
  console.log(`[analyze] ✓ Parallel fetch done in ${elapsed1}ms — placeholder=${placeholderErr ? 'FAIL:' + placeholderErr.message : 'OK'} app=${!!application} anthropic=${!!anthropicKey} openai=${!!openaiKey} fa=${(formAnswers||[]).length} ca=${(cultureAnswers||[]).length}`)

  if (placeholderErr) {
    return { step: 'placeholder', error: placeholderErr.message }
  }
  if (!application) {
    return { step: 'no_application', error: 'Application not found for id: ' + applicationId }
  }

  // ── Resolve provider ──────────────────────────────────────────────────────
  const s = aiSettings as Record<string, unknown> | null
  const provider = (s?.analysis_provider as string | null) ?? null
  let useAnthropic = provider === 'openai' ? null : anthropicKey
  let useOpenAI    = provider === 'anthropic' ? null : (!useAnthropic ? openaiKey : null)

  console.log(`[analyze] provider=${provider ?? 'auto'} useAnthropic=${!!useAnthropic} useOpenAI=${!!useOpenAI}`)

  // ── Extrai dados do candidato ─────────────────────────────────────────────
  const allFa = (formAnswers || []) as Array<Record<string, unknown>>
  const allCa = (cultureAnswers || []) as Array<Record<string, unknown>>

  function get(ft: string) {
    return parseAnswer((allFa.find(a => (a.form_questions as {field_type?:string}|null)?.field_type === ft))?.answer_text as string|null)
  }

  const cand     = (application as Record<string, unknown>).candidates as Record<string, string> | null
  const name     = cand?.full_name ?? ''
  const phone    = cand?.phone ?? ''
  const email    = cand?.email ?? get('email')
  const city     = cand?.city ?? ''
  const bairro   = cand?.neighborhood ?? ''
  const cpf      = get('cpf')
  const birth    = get('date')
  const address  = get('address')

  // Job title
  let jobTitle = ((application as Record<string, unknown>).jobs as {title?:string}|null)?.title || ''
  if (!jobTitle) {
    const raw = get('job_select')
    if (raw) {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (uuidRe.test(raw.trim())) {
        const { data: jr } = await supabase.from('jobs').select('title').eq('id', raw.trim()).single()
        jobTitle = (jr as {title?:string}|null)?.title ?? raw
      } else { jobTitle = raw }
    }
  }
  if (!jobTitle) jobTitle = 'Não informada'

  // ── Monta textos do prompt ────────────────────────────────────────────────
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

  const HIDE_TYPES = new Set(['date','celular','email','job_select','address','file_upload','cpf','cep'])
  const HIDE_WORDS = ['nome completo','endereço','bairro','cidade','telefone','e-mail','email','vaga de interesse','anexe']

  const formText = allFa
    .filter(a => {
      const q = a.form_questions as {field_type?:string; question_text?:string}|null
      if (!q || HIDE_TYPES.has(q.field_type ?? '')) return false
      return !HIDE_WORDS.some(w => (q.question_text ?? '').toLowerCase().includes(w))
    })
    .map(a => `- ${(a.form_questions as {question_text?:string}|null)?.question_text}: ${parseAnswer(a.answer_text as string|null)}`)
    .join('\n') || 'Não preenchido'

  const cultureText = allCa
    .map(a => `- ${(a.culture_questions as {question_text?:string}|null)?.question_text} → "${a.selected_option}" (${a.score}/10)`)
    .join('\n') || 'Não preenchido'

  const companyParts: string[] = []
  if (s?.mission)                 companyParts.push(`• Missão: ${s.mission}`)
  if (s?.vision)                  companyParts.push(`• Visão: ${s.vision}`)
  if (s?.company_culture)         companyParts.push(`• Cultura:\n${s.company_culture}`)
  if (s?.ideal_candidate_profile) companyParts.push(`• Perfil ideal:\n${s.ideal_candidate_profile}`)
  if (Array.isArray(s?.desired_behaviors) && (s.desired_behaviors as string[]).length)
    companyParts.push(`• Comportamentos desejados:\n${(s.desired_behaviors as string[]).join('\n')}`)
  if (Array.isArray(s?.alert_behaviors) && (s.alert_behaviors as string[]).length)
    companyParts.push(`• Comportamentos de ALERTA:\n${(s.alert_behaviors as string[]).join('\n')}`)

  // ── URLs de pesquisa pública (paralelo, timeout 1.5s) ────────────────────
  const vars = { NOME: name, CPF: cpf, TELEFONE: phone, EMAIL: email, DATA_NASCIMENTO: birth, CIDADE: city, BAIRRO: bairro, VAGA: jobTitle }
  const urlFields = [
    { url: s?.search_url_1 as string|null, label: s?.search_url_1_label as string|null },
    { url: s?.search_url_2 as string|null, label: s?.search_url_2_label as string|null },
    { url: s?.search_url_3 as string|null, label: s?.search_url_3_label as string|null },
  ].filter(f => !!f.url)

  const searchSnippets: string[] = []
  if (urlFields.length > 0) {
    const fetched = await Promise.all(urlFields.map(async ({ url, label }) => {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 1500)
        const res = await fetch(buildUrl(url!, vars), { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
        clearTimeout(t)
        if (!res.ok) return null
        const text = (await res.text())
          .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000)
        return text ? `=== ${label || 'Pesquisa'} ===\n${text}` : null
      } catch { return null }
    }))
    searchSnippets.push(...fetched.filter(Boolean) as string[])
  }
  console.log(`[analyze] URLs done in ${Date.now() - t0}ms`)

  // ── Prompt ────────────────────────────────────────────────────────────────
  const systemPrompt = (s?.analysis_prompt as string|null) ||
    'Você é um analista de RH especializado em recrutamento. Seja objetivo e imparcial.'

  const userPrompt = `CANDIDATO:\n${candidateInfo}\n\nFORMULÁRIO:\n${formText}\n\nTESTE CULTURAL:\n${cultureText}\n\nEMPRESA:\n${companyParts.join('\n\n') || 'Não configurado'}${searchSnippets.length ? `\n\nPESQUISA PÚBLICA:\n${searchSnippets.join('\n\n')}` : ''}\n\nRetorne APENAS JSON válido sem markdown:\n{"resumo_candidato":"2-3 frases sobre o perfil","pontos_fortes":["p1","p2"],"pontos_de_atencao":["p1"],"compatibilidade_cultural":0,"compatibilidade_com_a_vaga":0,"nota_experiencia":0,"nota_disponibilidade":0,"nota_final":0,"parecer_ia":"recomendação em 1 frase","status_sugerido":"analise_ia_concluida","vaga_recomendada":"${jobTitle}"}`

  // ── Chama IA (timeout 5s) ─────────────────────────────────────────────────
  let aiResult: AiAnalysisResult | null = null
  let aiProvider = 'none'

  console.log(`[analyze] calling AI... (${Date.now() - t0}ms)`)

  if (useAnthropic) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'x-api-key': useAnthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
      })
      clearTimeout(t)
      console.log(`[analyze] Anthropic status=${res.status} (${Date.now() - t0}ms)`)
      if (res.ok) {
        const txt = (await res.json()).content?.[0]?.text || ''
        const m = txt.match(/\{[\s\S]*\}/)
        if (m) try { aiResult = JSON.parse(m[0]); aiProvider = 'anthropic' } catch { /* ignore */ }
      } else {
        const err = await res.json().catch(() => ({}))
        console.error('[analyze] Anthropic error:', JSON.stringify(err).slice(0, 200))
      }
    } catch (e) { console.error('[analyze] Anthropic timeout/error:', String(e)) }
  }

  if (!aiResult && useOpenAI) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Authorization': `Bearer ${useOpenAI}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: 1024, response_format: { type: 'json_object' } }),
      })
      clearTimeout(t)
      console.log(`[analyze] OpenAI status=${res.status} (${Date.now() - t0}ms)`)
      if (res.ok) {
        const txt = (await res.json()).choices?.[0]?.message?.content || ''
        try { aiResult = JSON.parse(txt); aiProvider = 'openai' } catch {
          const m = txt.match(/\{[\s\S]*\}/)
          if (m) try { aiResult = JSON.parse(m[0]); aiProvider = 'openai' } catch { /* ignore */ }
        }
      }
    } catch (e) { console.error('[analyze] OpenAI timeout/error:', String(e)) }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  if (!aiResult) {
    const reason = (!useAnthropic && !useOpenAI)
      ? 'Chave de IA não encontrada. Acesse Configurações → Configuração IA.'
      : 'A IA não retornou resposta válida. Tente novamente.'
    console.warn(`[analyze] Fallback: useAnthropic=${!!useAnthropic} useOpenAI=${!!useOpenAI}`)
    aiResult = {
      resumo_candidato: reason,
      pontos_fortes: [],
      pontos_de_atencao: ['Verifique as chaves de API nas configurações.'],
      compatibilidade_cultural: (application as Record<string, unknown>).culture_score as number || 0,
      compatibilidade_com_a_vaga: 0,
      nota_experiencia: 0,
      nota_disponibilidade: 0,
      nota_final: 0,
      parecer_ia: 'Análise automática indisponível.',
      status_sugerido: 'analise_ia_concluida',
      vaga_recomendada: jobTitle,
    }
    aiProvider = 'fallback'
  }

  // ── Salva resultado final ─────────────────────────────────────────────────
  const weights = {
    culture:      Number(s?.culture_weight)      || 0.5,
    experience:   Number(s?.experience_weight)   || 0.35,
    availability: Number(s?.availability_weight) || 0.15,
  }
  const finalScore = calculateFinalScore(aiResult.compatibilidade_cultural, aiResult.nota_experiencia, aiResult.nota_disponibilidade, weights)

  console.log(`[analyze] saving result... provider=${aiProvider} score=${finalScore} elapsed=${Date.now() - t0}ms`)

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
    console.error('[analyze] ✗ Save error:', saveErr.message)
    return { step: 'db_save', error: saveErr.message, provider: aiProvider }
  }

  console.log(`[analyze] ✓ DONE provider=${aiProvider} score=${finalScore} total=${Date.now() - t0}ms`)
  return { provider: aiProvider, score: finalScore, elapsed: Date.now() - t0 }
}
