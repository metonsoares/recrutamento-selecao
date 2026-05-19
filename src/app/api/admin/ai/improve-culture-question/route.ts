import { NextRequest, NextResponse } from 'next/server'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'

interface QuestionInput {
  question_text: string
  options: string[]
  scores: Record<string, number>
  ideal_answer: string | null
  culture_value: string | null
  weight: number
}

interface AiSuggestion {
  question_text: string
  options: string[]
  scores: Record<string, number>
  ideal_answer: string
  culture_value: string
  explanation: string
}

export async function POST(req: NextRequest) {
  try {
    const { question, userRequest } = await req.json() as {
      question: QuestionInput
      userRequest: string
    }

    if (!question || !userRequest?.trim()) {
      return NextResponse.json({ error: 'Pergunta e descrição da melhoria são obrigatórios' }, { status: 400 })
    }

    const anthropicKey = await getAnthropicKey()
    const openaiKey = await getOpenAIKey()

    if (!anthropicKey && !openaiKey) {
      return NextResponse.json({
        error: 'Chave de IA não configurada. Acesse Configurações Plataforma → Configuração IA para adicionar sua chave.',
      }, { status: 500 })
    }

    const opts = question.options || []
    const scores = question.scores || {}
    const letters = ['A', 'B', 'C', 'D']

    const optionsText = letters
      .map((l, i) => opts[i] ? `${l}) ${opts[i].replace(/^[A-D][.)]\s*/, '')} — pontuação: ${scores[l] ?? 0}/10` : null)
      .filter(Boolean)
      .join('\n')

    const prompt = `Você é um especialista em recrutamento e cultura organizacional, auxiliando na criação do teste cultural de recrutamento da Brownie do Ton (confeitaria artesanal em Petrópolis, RJ).

PERGUNTA ATUAL:
Texto: ${question.question_text || '(sem texto)'}
Valor cultural avaliado: ${question.culture_value || '(não definido)'}
Resposta ideal: ${question.ideal_answer || '(não definido)'}
Alternativas e pontuações:
${optionsText || '(sem alternativas)'}

SOLICITAÇÃO DO USUÁRIO:
${userRequest}

INSTRUÇÕES:
- Melhore a pergunta conforme o que o usuário pediu
- O valor cultural avaliado deve ser claro e refletir os valores da empresa (hospitalidade, comprometimento, honestidade, respeito, qualidade, trabalho em equipe, etc.)
- As pontuações devem ir de 0 a 10, onde 10 = perfeitamente alinhado com a cultura da empresa e 0 = totalmente desalinhado
- As alternativas devem cobrir diferentes perfis comportamentais realistas
- A pergunta deve ser simples e acessível para qualquer candidato
- Mantenha o formato das alternativas: "A. texto da alternativa"
- Retorne o campo "explanation" explicando BREVEMENTE o que foi melhorado e por quê (máx. 2 frases)

Responda APENAS com JSON válido, sem markdown, sem texto extra:
{
  "question_text": "Texto melhorado da pergunta",
  "options": ["A. primeira opção", "B. segunda opção", "C. terceira opção", "D. quarta opção"],
  "scores": {"A": 0, "B": 10, "C": 5, "D": 2},
  "ideal_answer": "B",
  "culture_value": "valor cultural",
  "explanation": "Explicação breve das melhorias"
}`

    let result: AiSuggestion | null = null

    if (anthropicKey) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(30000),
      })
      const d = await r.json()
      if (d.error) {
        console.error('[improve-culture-question Anthropic]', d.error)
        return NextResponse.json({ error: `Erro da IA: ${d.error.message || 'Verifique sua chave.'}` }, { status: 500 })
      }
      const text: string = d.content?.[0]?.text?.trim() || ''
      const m = text.match(/\{[\s\S]*\}/)
      if (m) result = JSON.parse(m[0]) as AiSuggestion

    } else if (openaiKey) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(30000),
      })
      const d = await r.json()
      const text: string = d.choices?.[0]?.message?.content || ''
      if (text) result = JSON.parse(text) as AiSuggestion
    }

    if (!result) {
      return NextResponse.json({ error: 'A IA não retornou uma sugestão. Tente novamente.' }, { status: 500 })
    }

    // Normaliza e valida os scores (garante 0-10)
    const normalizedScores: Record<string, number> = {}
    ;['A', 'B', 'C', 'D'].forEach(l => {
      const v = Number(result!.scores?.[l] ?? 0)
      normalizedScores[l] = Math.min(10, Math.max(0, v))
    })

    return NextResponse.json({
      improved: {
        ...result,
        scores: normalizedScores,
        ideal_answer: result.ideal_answer?.toUpperCase() || 'A',
      },
    })

  } catch (err) {
    console.error('[improve-culture-question]', err)
    return NextResponse.json({ error: 'Erro interno ao processar a solicitação.' }, { status: 500 })
  }
}
