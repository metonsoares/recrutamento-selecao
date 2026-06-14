import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { decryptToken } from '@/lib/helpers'
import { inferSex } from '@/lib/infer-sex'

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

/** Idade a partir de 'YYYY-MM-DD' ou 'DD/MM/YYYY'. */
function ageFrom(birth?: string | null): number | null {
  if (!birth) return null
  let y = 0, m = 0, d = 0
  const iso = birth.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3] }
  else {
    const br = birth.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (!br) return null
    d = +br[1]; m = +br[2]; y = +br[3]
  }
  const t = new Date()
  let age = t.getFullYear() - y
  const mo = t.getMonth() + 1
  if (mo < m || (mo === m && t.getDate() < d)) age--
  return age >= 0 && age < 120 ? age : null
}

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
      .select('id, candidate_id, status, ai_summary, candidates(full_name, city, neighborhood)')
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
    type CandRel = { full_name?: string; city?: string | null; neighborhood?: string | null }
    const profiles: { candidateId: string; name: string; text: string }[] = []
    for (const app of appList) {
      const candidateId = app.candidate_id as string | null
      if (!candidateId) continue
      const candRelRaw = app.candidates as CandRel | CandRel[] | null
      const cand = (Array.isArray(candRelRaw) ? candRelRaw[0] : candRelRaw) || {}
      const name = cand.full_name || 'Sem nome'

      const fa = faByApp.get(app.id as string) || []

      // Idade: a data de nascimento vem da resposta do tipo "date" no formulário
      const dateAnswer = fa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'date')
      const birth = parseAnswer(dateAnswer?.answer_text as string | null) || null
      const age = ageFrom(birth)
      const sex = inferSex(name)

      // Dados estruturados (sexo/idade/cidade) — necessários para filtros demográficos
      const demo: string[] = []
      demo.push(`Sexo: ${sex === 'M' ? 'Masculino' : sex === 'F' ? 'Feminino' : 'Indefinido'}`)
      if (age != null) demo.push(`Idade: ${age} anos`)
      if (cand.city) demo.push(`Cidade: ${cand.city}`)
      if (cand.neighborhood) demo.push(`Bairro: ${cand.neighborhood}`)

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
      let text = demo.join(' | ')
      if (formText) text += `\nExperiência/perfil: ${formText.slice(0, 700)}`
      if (summary && summary !== 'Análise em andamento...') text += `\nResumo: ${summary.slice(0, 300)}`

      profiles.push({ candidateId, name, text })
    }

    // ── Prompt para a IA ──────────────────────────────────────────────────────
    const candidatesBlock = profiles
      .map((p, i) => `[${i + 1}] ${p.name}\n${p.text}`)
      .join('\n\n')

    const systemPrompt = `Você é um recrutador especialista. Sua tarefa é filtrar uma lista de candidatos e identificar quais atendem a um pedido descrito em linguagem natural. Cada candidato traz campos estruturados confiáveis (Sexo, Idade, Cidade, Bairro) e texto de experiência/perfil. Avalie SOMENTE com base nessas informações. Não invente dados.`

    const userPrompt = `PEDIDO DO RECRUTADOR (o que ele procura nos candidatos):
"${description}"

LISTA DE CANDIDATOS (cada um precedido por seu número entre colchetes):
${candidatesBlock}

COMO FILTRAR:
- O pedido pode ser um filtro OBJETIVO (ex.: "homens com mais de 30 anos", "mulheres de Fortaleza") e/ou de EXPERIÊNCIA/PERFIL (ex.: "experiência como cozinheiro").
- Para critérios objetivos use os campos estruturados: Sexo (Masculino/Feminino), Idade (em anos), Cidade, Bairro. Aplique os operadores exatamente como pedido ("mais de 30" = idade > 30; "entre 25 e 40" = 25..40; etc.).
- Para critérios de experiência/perfil, use o texto de experiência/perfil e o resumo.
- INCLUA TODOS os candidatos que satisfazem o pedido — não limite a quantidade. Se o pedido for puramente objetivo (ex.: sexo/idade), todo candidato que satisfaz deve entrar.
- EXCLUA quem claramente não satisfaz. Em caso de critério objetivo, exclua quem não bate (ex.: idade desconhecida quando o pedido exige idade específica).

SCORE (0 a 100):
- Para filtros objetivos: 100 se satisfaz plenamente.
- Para perfil/experiência: quanto maior a aderência, maior o score.
- Inclua candidatos com score >= 50. Ordene do maior para o menor.
- "motivo" curto (máx. 12 palavras) citando a evidência (ex.: "Masculino, 34 anos" ou "2 anos como cozinheira").

Retorne APENAS JSON válido, sem markdown:
{"matches":[{"n":1,"score":100,"motivo":"Masculino, 34 anos"}]}
Se ninguém atender, retorne {"matches":[]}.`

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
            max_tokens: 8192, temperature: 0,
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
            model: 'gpt-4o-mini', temperature: 0, max_tokens: 8192,
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
