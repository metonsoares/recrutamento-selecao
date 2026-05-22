import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateFinalScore, decryptToken } from '@/lib/helpers'
import { AiAnalysisResult, BackgroundCheckResult } from '@/types'

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

/**
 * Calcula score cultural REAL a partir das respostas do teste.
 * Usa a média das notas individuais (escala 0-10) convertida para 0-100.
 * Este valor é FIXO e não pode ser alterado pela IA.
 */
function calcRealCultureScore(
  cultureAnswers: Array<Record<string, unknown>>,
  appCultureScore: number | null,
): number {
  if (cultureAnswers.length > 0) {
    const scores = cultureAnswers.map(a => Number(a.score) || 0)
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length
    return Math.round(avg * 10) // 0-10 → 0-100
  }
  return Math.round(appCultureScore ?? 0)
}

async function runAnalysis(applicationId: string): Promise<Record<string, unknown>> {
  const t0 = Date.now()
  console.log(`[analyze] START ${applicationId}`)

  const supabase = await createSupabaseServiceClient()

  // Tudo em paralelo
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
  console.log(`[analyze] parallel done ${elapsed1}ms | placeholder=${placeholderErr ? 'FAIL:' + placeholderErr.message : 'OK'} | app=${!!application} | fa=${(formAnswers || []).length} | ca=${(cultureAnswers || []).length}`)

  if (placeholderErr) return { step: 'placeholder', error: placeholderErr.message }
  if (!application) {
    const appErrMsg = applicationError ? `${applicationError.message} (code: ${applicationError.code})` : 'unknown'
    return { step: 'no_application', error: `Application not found: ${applicationId} | supabase: ${appErrMsg}` }
  }

  // Resolve chaves IA
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
  const provider     = (s?.analysis_provider as string | null) ?? null
  const useAnthropic = provider === 'openai' ? null : anthropicKey
  const useOpenAI    = provider === 'anthropic' ? null : (!useAnthropic ? openaiKey : null)

  console.log(`[analyze] provider=${provider ?? 'auto'} anthropic=${!!anthropicKey} openai=${!!openaiKey}`)

  const app          = application as Record<string, unknown>
  const candidateId  = app.candidate_id as string | null
  const jobId        = app.job_id as string | null

  // Busca candidato (com background_check_result) e vaga
  const [{ data: candidateRow }, { data: jobRow }] = await Promise.all([
    candidateId
      ? supabase.from('candidates')
          .select('full_name, phone, email, city, neighborhood, cpf, background_check_result, background_check_at')
          .eq('id', candidateId).single()
      : Promise.resolve({ data: null }),
    jobId
      ? supabase.from('jobs').select('title').eq('id', jobId).single()
      : Promise.resolve({ data: null }),
  ])

  const allFa = (formAnswers || []) as Array<Record<string, unknown>>
  const allCa = (cultureAnswers || []) as Array<Record<string, unknown>>
  const cand  = candidateRow as Record<string, unknown> | null

  function get(ft: string) {
    return parseAnswer(
      (allFa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === ft))
        ?.answer_text as string | null
    )
  }

  const name    = String(cand?.full_name ?? '')
  const phone   = String(cand?.phone ?? '')
  const email   = String(cand?.email ?? get('email'))
  const city    = String(cand?.city ?? '')
  const bairro  = String(cand?.neighborhood ?? '')
  const cpf     = get('cpf') || (cand?.cpf ? String(cand.cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '')
  const birth   = get('date')
  const address = get('address')

  // Job title
  let jobTitle = (jobRow as { title?: string } | null)?.title || ''
  if (!jobTitle) {
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

  // ── Score cultural REAL (calculado dos dados do teste, não pela IA) ──────────
  const realCultureScore = calcRealCultureScore(allCa, app.culture_score as number | null)
  console.log(`[analyze] realCultureScore=${realCultureScore} (from ${allCa.length} respostas)`)

  // ── Bloco de dados pessoais ───────────────────────────────────────────────────
  const candidateInfo = [
    `Nome: ${name}`,
    cpf     ? `CPF: ${cpf}` : '',
    birth   ? `Data de Nascimento: ${birth}` : '',
    phone   ? `Telefone: ${phone}` : '',
    email   ? `E-mail: ${email}` : '',
    address ? `Endereço: ${address}` : '',
    bairro  ? `Bairro: ${bairro}` : '',
    city    ? `Cidade: ${city}` : '',
    `Vaga pretendida: ${jobTitle}`,
  ].filter(Boolean).join('\n')

  // ── Bloco de formulário de experiência ────────────────────────────────────────
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

  // ── Bloco do teste cultural com scores individuais ────────────────────────────
  const cultureLines = allCa.map(a => {
    const score  = Number(a.score) ?? 0
    const label  = score >= 8 ? '✓ Alta aderência' : score >= 5 ? '~ Aderência parcial' : '✗ Baixa aderência'
    return `- ${(a.culture_questions as { question_text?: string } | null)?.question_text}\n  → Resposta: "${a.selected_option}" | Nota: ${score}/10 | ${label}`
  })
  const cultureText = cultureLines.length
    ? `Média geral: ${realCultureScore}% de compatibilidade cultural\n\n${cultureLines.join('\n')}`
    : 'Teste cultural não realizado'

  // ── Bloco de check de processos ───────────────────────────────────────────────
  const bgCheck = cand?.background_check_result as BackgroundCheckResult | null
  let bgCheckText = 'Check de processos não realizado para este candidato.'
  if (bgCheck) {
    const processos = bgCheck.processos_judiciais
    const risco = { baixo: 'BAIXO', medio: 'MÉDIO', alto: 'ALTO', nao_determinado: 'NÃO DETERMINADO' }[bgCheck.nivel_risco] ?? bgCheck.nivel_risco
    bgCheckText = [
      `Nível de risco: ${risco}`,
      `Processos judiciais encontrados: ${processos.encontrado ? 'SIM' : 'NÃO'}`,
      processos.resumo ? `Resumo: ${processos.resumo}` : '',
      processos.detalhes?.length ? `Detalhes:\n${processos.detalhes.map(d => `  • ${d}`).join('\n')}` : '',
      bgCheck.parecer_geral ? `Parecer: ${bgCheck.parecer_geral}` : '',
    ].filter(Boolean).join('\n')
  }

  // ── Bloco da empresa / perfil ideal ──────────────────────────────────────────
  const companyParts: string[] = []
  if (s?.mission)                 companyParts.push(`Missão: ${s.mission}`)
  if (s?.vision)                  companyParts.push(`Visão: ${s.vision}`)
  if (s?.company_culture)         companyParts.push(`Cultura:\n${s.company_culture}`)
  if (s?.ideal_candidate_profile) companyParts.push(`Perfil ideal:\n${s.ideal_candidate_profile}`)
  if (Array.isArray(s?.desired_behaviors) && (s.desired_behaviors as string[]).length)
    companyParts.push(`Comportamentos desejados:\n${(s.desired_behaviors as string[]).join('\n')}`)
  if (Array.isArray(s?.alert_behaviors) && (s.alert_behaviors as string[]).length)
    companyParts.push(`Comportamentos de ALERTA:\n${(s.alert_behaviors as string[]).join('\n')}`)

  // ── URLs de pesquisa pública (opcional) ───────────────────────────────────────
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
      const finalUrl = buildUrl(url!, vars)
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 3000)
        const res = await fetch(finalUrl, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        })
        clearTimeout(t)
        if (!res.ok) return null
        const text = (await res.text())
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ').trim().slice(0, 1500)
        return text ? `=== ${label || 'Pesquisa'} (${finalUrl}) ===\n${text}` : null
      } catch { return null }
    }))
    searchSnippets.push(...(fetched.filter(Boolean) as string[]))
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PROMPT PRINCIPAL — critérios fixos e determinísticos
  // ─────────────────────────────────────────────────────────────────────────────

  const systemPrompt = (s?.analysis_prompt as string | null) ||
    `Você é um especialista em Recursos Humanos com 15 anos de experiência em recrutamento e seleção.
Analisa candidatos de forma objetiva, criteriosa e consistente, sempre baseando suas avaliações exclusivamente nos dados fornecidos.
Nunca inventa informações. Nunca presume experiências não documentadas. Usa linguagem direta e profissional.`

  const userPrompt = `
━━━ DADOS DO CANDIDATO ━━━
${candidateInfo}

━━━ FORMULÁRIO DE EXPERIÊNCIA ━━━
${formText}

━━━ TESTE CULTURAL ━━━
${cultureText}

━━━ CHECK DE PROCESSOS JUDICIAIS ━━━
${bgCheckText}

━━━ EMPRESA / PERFIL IDEAL ━━━
${companyParts.join('\n\n') || 'Não configurado'}

${searchSnippets.length ? `━━━ PESQUISA PÚBLICA ADICIONAL ━━━\n${searchSnippets.join('\n\n')}` : ''}

━━━ INSTRUÇÕES DE AVALIAÇÃO ━━━

Você deve avaliar este candidato cruzando TODOS os dados acima e gerar um parecer de especialista em RH.

REGRA ABSOLUTA — COMPATIBILIDADE CULTURAL:
O score de compatibilidade cultural é FIXO e calculado automaticamente pelo sistema a partir das notas individuais do teste:
  compatibilidade_cultural = ${realCultureScore}
Você DEVE retornar exatamente este valor. NÃO altere este número.

RUBRICA — NOTA DE EXPERIÊNCIA (nota_experiencia, 0 a 100):
Avalie exclusivamente o que está documentado no formulário de experiência:
  90-100 → Experiência direta comprovada de 2+ anos na função exata, com empresa e período identificados
  70-89  → Experiência direta na área com alguma limitação (tempo curto, empresa informal, 1 empresa só)
  50-69  → Experiência indireta ou em área relacionada / experiência freelance parcialmente documentada
  30-49  → Experiência muito limitada, vaga ou apenas como autônomo sem documentação suficiente
  0-29   → Sem experiência relevante ou formulário em branco

RUBRICA — NOTA DE DISPONIBILIDADE (nota_disponibilidade, 0 a 100):
Avalie com base no que o candidato declarou no formulário:
  100    → Disponível imediatamente, sem restrições de horário, finais de semana e feriados
  80-99  → Disponível imediatamente com pequenas restrições (ex: não pode alguns dias)
  60-79  → Disponível em até 2 semanas ou com restrições moderadas de horário
  40-59  → Disponível em 1 mês ou com restrições significativas
  0-39   → Disponibilidade muito limitada ou não informada

RUBRICA — STATUS SUGERIDO:
  "apto_para_entrevista"   → nota_final ≥ 65 e sem processos criminais graves
  "banco_de_talentos"      → nota_final entre 45-64 ou com limitações recuperáveis
  "reprovado"              → nota_final < 45 ou comportamentos de alerta críticos
  "analise_ia_concluida"   → quando há dúvida e precisa de avaliação humana

SOBRE PROCESSOS JUDICIAIS:
Se o check de processos indicar processos encontrados, MENCIONE no parecer e nos pontos de atenção.
Processos criminais ou com MPF Federal devem elevar o nível de atenção obrigatoriamente.
Processos trabalhistas como reclamante (ex-funcionário que processou empregador anterior) devem ser mencionados mas não são eliminatórios por si só.

Retorne APENAS JSON válido sem markdown, sem texto antes ou depois:
{
  "resumo_candidato": "2-3 frases objetivas descrevendo o perfil: quem é, experiência, fit cultural e disponibilidade",
  "pontos_fortes": ["ponto 1 com dado concreto do formulário/teste", "ponto 2", "ponto 3"],
  "pontos_de_atencao": ["atenção 1 com dado concreto", "atenção 2"],
  "compatibilidade_cultural": ${realCultureScore},
  "nota_experiencia": 0,
  "nota_disponibilidade": 0,
  "nota_final": 0,
  "parecer_ia": "Recomendação direta em 1-2 frases para o recrutador, como um especialista em RH falando para outro profissional",
  "status_sugerido": "analise_ia_concluida",
  "vaga_recomendada": "${jobTitle}"
}

IMPORTANTE: nota_final NÃO deve ser calculado por você — o sistema calcula automaticamente. Coloque 0 em nota_final.
`

  // ── Chama IA ──────────────────────────────────────────────────────────────────
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
          temperature: 0.1, // quase determinístico
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
      clearTimeout(t)
      console.log(`[analyze] Anthropic status=${res.status} ${Date.now() - t0}ms`)
      if (res.ok) {
        const body = await res.json()
        const txt = body.content?.[0]?.text || ''
        console.log(`[analyze] Anthropic raw (first 400): ${txt.slice(0, 400)}`)
        const m = txt.match(/\{[\s\S]*\}/)
        if (m) {
          try { aiResult = JSON.parse(m[0]); aiProvider = 'anthropic' } catch (je) {
            console.error('[analyze] JSON parse error:', String(je))
          }
        } else {
          console.warn('[analyze] No JSON in Anthropic response')
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
          temperature: 0.1, // quase determinístico
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 2048,
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

  // ── Fallback sem IA ───────────────────────────────────────────────────────────
  if (!aiResult) {
    const reason = (!useAnthropic && !useOpenAI)
      ? 'Chave de IA não encontrada. Acesse Configurações → Configuração IA.'
      : 'A IA não retornou resposta válida. Tente novamente.'
    console.warn(`[analyze] Fallback useAnthropic=${!!useAnthropic} useOpenAI=${!!useOpenAI}`)
    aiResult = {
      resumo_candidato: reason,
      pontos_fortes: [],
      pontos_de_atencao: ['Verifique as chaves de API nas configurações.'],
      compatibilidade_cultural: realCultureScore,
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

  // ── Garante que compatibilidade_cultural é sempre o valor REAL do teste ───────
  // A IA não pode alterar este valor — se tentou, corrige aqui.
  aiResult.compatibilidade_cultural = realCultureScore

  // ── Calcula nota final com pesos configuráveis ────────────────────────────────
  const weights = {
    culture:      Number(s?.culture_weight)      || 0.5,
    experience:   Number(s?.experience_weight)   || 0.35,
    availability: Number(s?.availability_weight) || 0.15,
  }
  const finalScore = calculateFinalScore(
    realCultureScore,           // sempre o score real, não o da IA
    aiResult.nota_experiencia,
    aiResult.nota_disponibilidade,
    weights,
  )

  console.log(`[analyze] scores: cultural=${realCultureScore} exp=${aiResult.nota_experiencia} disp=${aiResult.nota_disponibilidade} final=${finalScore}`)

  // ── Extrai processos judiciais do resultado da IA (se pesquisa pública retornou) ──
  type JudicialItem = { fonte?: string; url?: string; descricao?: string }
  type JudicialAlert = { encontrado: boolean; itens: JudicialItem[] }
  const judicialRaw = (aiResult as unknown as Record<string, unknown>).processos_judiciais as JudicialAlert | undefined
  const judicialAlert: JudicialAlert = {
    encontrado: judicialRaw?.encontrado === true,
    itens: Array.isArray(judicialRaw?.itens)
      ? judicialRaw!.itens.filter((i: JudicialItem) => i?.url && i.url !== 'https://...')
      : [],
  }

  // ── Salva resultado ───────────────────────────────────────────────────────────
  const { error: saveErr } = await supabase.from('applications').update({
    ai_summary:           aiResult.resumo_candidato,
    ai_strengths:         aiResult.pontos_fortes,
    ai_risks:             aiResult.pontos_de_atencao,
    ai_recommendation:    aiResult.parecer_ia,
    ai_status_suggestion: aiResult.status_sugerido,
    ai_raw_response:      aiResult as unknown as Record<string, unknown>,
    ai_judicial_alert:    judicialAlert,
    // Scores: culture_score vem do teste real, experiência e disponibilidade da IA
    culture_score:        realCultureScore,
    experience_score:     aiResult.nota_experiencia,
    availability_score:   aiResult.nota_disponibilidade,
    final_score:          finalScore,
    status:               'analise_ia_concluida',
    updated_at:           new Date().toISOString(),
  }).eq('id', applicationId)

  if (saveErr) {
    console.error('[analyze] Save error:', saveErr.message)
    return { step: 'db_save', error: saveErr.message, provider: aiProvider }
  }

  console.log(`[analyze] DONE provider=${aiProvider} final=${finalScore} total=${Date.now() - t0}ms`)
  return { provider: aiProvider, score: finalScore, elapsed: Date.now() - t0 }
}
