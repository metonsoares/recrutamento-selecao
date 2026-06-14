import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { decryptToken } from '@/lib/helpers'

export const maxDuration = 60

// Status que compõem a coluna "Novo Currículo" no quadro de candidatos.
const NOVO_STATUSES = [
  'novo', 'pre_cadastro_whatsapp',
  'aguardando_formulario_experiencia', 'experiencia_preenchida',
  'aguardando_teste_cultural', 'teste_cultural_preenchido',
  'analise_ia_concluida',
]

// Campos do formulário que NÃO descrevem o perfil (contato/endereço) — ocultados.
const HIDE_TYPES = new Set(['date', 'celular', 'email', 'job_select', 'address', 'file_upload', 'cpf', 'cep'])
const HIDE_WORDS = ['nome completo', 'endereço', 'bairro', 'cidade', 'telefone', 'e-mail', 'email', 'vaga de interesse', 'anexe']

function parseAnswer(text: string | null | undefined): string {
  if (!text) return ''
  try {
    const p = JSON.parse(text)
    if (typeof p === 'string') return p
    if (Array.isArray(p)) return p.join(', ')
    if (typeof p === 'object' && p !== null) {
      const a = p as Record<string, string>
      return [a.street, a.number, a.neighborhood, a.city, a.state].filter(Boolean).join(', ')
    }
    return String(p)
  } catch { return text }
}

interface Match { idx: number; score: number; reason: string }

export async function POST(req: NextRequest) {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    let description = ''
    try { description = String((await req.json())?.description || '').trim() } catch { /* ignore */ }
    if (!description || description.length < 3) {
      return NextResponse.json({ error: 'Descreva o perfil desejado para buscar.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()

    // ── Resolve chave de IA ───────────────────────────────────────────────────
    const { data: aiSettings } = await supabase.from('ai_settings').select('*').limit(1).maybeSingle()
    const s = aiSettings as Record<string, unknown> | null
    const resolveKey = (enc: unknown): string | null => {
      if (!enc) return null
      try { return decryptToken(enc as string) } catch { return null }
    }
    const anthropicKey = process.env.ANTHROPIC_API_KEY || resolveKey(s?.anthropic_api_key_encrypted)
    const openaiKey = process.env.OPENAI_API_KEY || resolveKey(s?.openai_api_key_encrypted)
    const provider = (s?.analysis_provider as string | null) ?? null
    const useAnthropic = provider === 'openai' ? null : anthropicKey
    const useOpenAI = provider === 'anthropic' ? null : (!useAnthropic ? openaiKey : null)

    if (!useAnthropic && !useOpenAI) {
      return NextResponse.json({ error: 'Chave de IA não configurada. Acesse Configurações → Configuração IA.' }, { status: 400 })
    }

    // ── Candidatos da coluna "Novo Currículo" ─────────────────────────────────
    const { data: apps } = await supabase
      .from('applications')
      .select('id, candidate_id, status, ai_summary, candidates(full_name)')
      .in('status', NOVO_STATUSES)

    const appList = (apps || []) as Array<Record<string, unknown>>
    if (appList.length === 0) {
      return NextResponse.json({ matches: [], total: 0 })
    }

    const appIds = appList.map(a => a.id as string)

    // ── Respostas do formulário (currículo) de todos de uma vez ───────────────
    const { data: faRows } = await supabase
      .from('form_answers')
      .select('application_id, answer_text, form_questions(question_text, field_type)')
      .in('application_id', appIds)

    const faByApp = new Map<string, Array<Record<string, unknown>>>()
    for (const row of (faRows || []) as Array<Record<string, unknown>>) {
      const aid = row.application_id as string
      if (!faByApp.has(aid)) faByApp.set(aid, [])
      faByApp.get(aid)!.push(row)
    }

    // ── Monta perfil textual compacto por candidato ───────────────────────────
    const profiles: { candidateId: string; name: string; text: string }[] = []
    for (const app of appList) {
      const candidateId = app.candidate_id as string | null
      if (!candidateId) continue
      const candRel = app.candidates as { full_name?: string } | { full_name?: string }[] | null
      const name = (Array.isArray(candRel) ? candRel[0]?.full_name : candRel?.full_name) || 'Sem nome'

      const fa = faByApp.get(app.id as string) || []
      const formText = fa
        .filter(a => {
          const q = a.form_questions as { field_type?: string; question_text?: string } | null
          if (!q || HIDE_TYPES.has(q.field_type ?? '')) return false
          return !HIDE_WORDS.some(w => (q.question_text ?? '').toLowerCase().includes(w))
        })
        .map(a => {
          const q = a.form_questions as { question_text?: string } | null
          const v = parseAnswer(a.answer_text as string | null)
          return v ? `${q?.question_text}: ${v}` : ''
        })
        .filter(Boolean)
        .join(' | ')

      const summary = (app.ai_summary as string | null) || ''
      let text = formText
      if (summary && summary !== 'Análise em andamento...') text += (text ? ' || ' : '') + `Resumo: ${summary}`
      text = text.slice(0, 800) // limita tamanho por candidato

      profiles.push({ candidateId, name, text: text || '(sem informações de currículo preenchidas)' })
    }

    // ── Prompt para a IA ──────────────────────────────────────────────────────
    const candidatesBlock = profiles
      .map((p, i) => `[${i + 1}] ${p.name}\n${p.text}`)
      .join('\n\n')

    const systemPrompt = `Você é um recrutador especialista. Sua tarefa é filtrar uma lista de currículos e identificar quais candidatos correspondem a um perfil desejado descrito em linguagem natural. Avalie SOMENTE com base nas informações fornecidas de cada candidato. Não invente dados. Seja criterioso: só inclua quem realmente tem aderência ao que foi pedido.`

    const userPrompt = `PERFIL/REQUISITOS DESEJADOS NO CURRÍCULO:
"${description}"

LISTA DE CANDIDATOS (cada um precedido por seu número entre colchetes):
${candidatesBlock}

INSTRUÇÕES:
- Selecione apenas os candidatos cujo currículo tem aderência real ao perfil desejado.
- Atribua um score de 0 a 100 indicando o grau de aderência (100 = encaixe perfeito).
- Inclua na resposta SOMENTE candidatos com score >= 50.
- Ordene do maior para o menor score.
- "motivo" deve ser curto (máx. 12 palavras), citando a evidência do currículo.

Retorne APENAS JSON válido, sem markdown, no formato:
{"matches":[{"n":1,"score":85,"motivo":"experiência de 2 anos como cozinheira"}]}
Se nenhum candidato corresponder, retorne {"matches":[]}.`

    // ── Chama IA ──────────────────────────────────────────────────────────────
    let rawMatches: Match[] | null = null

    if (useAnthropic) {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 45000)
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: ctrl.signal,
          headers: { 'x-api-key': useAnthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096, temperature: 0,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        })
        clearTimeout(t)
        if (res.ok) {
          const txt = (await res.json()).content?.[0]?.text || ''
          const m = txt.match(/\{[\s\S]*\}/)
          if (m) { try { rawMatches = (JSON.parse(m[0]).matches || []).map((x: Record<string, unknown>) => ({ idx: Number(x.n), score: Number(x.score), reason: String(x.motivo || '') })) } catch { /* ignore */ } }
        } else {
          console.error('[search-curriculos] Anthropic', res.status, (await res.text()).slice(0, 200))
        }
      } catch (e) { console.error('[search-curriculos] Anthropic error', String(e)) }
    }

    if (!rawMatches && useOpenAI) {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 45000)
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Authorization': `Bearer ${useOpenAI}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini', temperature: 0, max_tokens: 4096,
            response_format: { type: 'json_object' },
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          }),
        })
        clearTimeout(t)
        if (res.ok) {
          const txt = (await res.json()).choices?.[0]?.message?.content || ''
          try { rawMatches = (JSON.parse(txt).matches || []).map((x: Record<string, unknown>) => ({ idx: Number(x.n), score: Number(x.score), reason: String(x.motivo || '') })) } catch { /* ignore */ }
        }
      } catch (e) { console.error('[search-curriculos] OpenAI error', String(e)) }
    }

    if (!rawMatches) {
      return NextResponse.json({ error: 'A IA não retornou uma resposta válida. Tente novamente.' }, { status: 502 })
    }

    // ── Mapeia índices → candidateId e ordena ─────────────────────────────────
    const matches = rawMatches
      .filter(m => Number.isInteger(m.idx) && m.idx >= 1 && m.idx <= profiles.length && m.score >= 50)
      .map(m => ({
        candidateId: profiles[m.idx - 1].candidateId,
        name: profiles[m.idx - 1].name,
        score: Math.max(0, Math.min(100, Math.round(m.score))),
        reason: m.reason.slice(0, 120),
      }))
      .sort((a, b) => b.score - a.score)

    return NextResponse.json({ matches, total: profiles.length })
  } catch (err) {
    console.error('[search-curriculos]', err)
    return NextResponse.json({ error: 'Erro interno na busca.' }, { status: 500 })
  }
}
