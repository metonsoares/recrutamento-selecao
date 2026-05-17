import { NextRequest, NextResponse } from 'next/server'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'

interface CboResult {
  codigo: string
  titulo: string
  descricao: string
  encontrado: boolean
}

// Formata código para XXXX-XX
function formatCode(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6)
  if (digits.length >= 5) return digits.slice(0, 4) + '-' + digits.slice(4)
  return digits
}

// Tenta a BrasilAPI (endpoint CBO, caso exista)
async function tryBrasilApi(digits: string): Promise<CboResult | null> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cbo/v1/${digits}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || !data.title) return null
    return {
      codigo: formatCode(digits),
      titulo: data.title,
      descricao: data.description || '',
      encontrado: true,
    }
  } catch {
    return null
  }
}

// Prompt de IA muito detalhado sobre CBO 2002
function buildPrompt(code: string): string {
  return `Você é um especialista no CBO 2002 (Classificação Brasileira de Ocupações) do Ministério do Trabalho e Emprego do Brasil. Sua tarefa é identificar o cargo correspondente ao código CBO fornecido.

Estrutura do CBO:
- Formato: XXXX-XX (4 dígitos + hífen + 2 dígitos)
- Os primeiros dígitos identificam o Grande Grupo e Família Ocupacional
- Os 2 últimos identificam a ocupação específica

Exemplos de códigos e títulos (para sua referência):
- 4221-05: Operador de caixa
- 4221-10: Bilheteiro (exceto transportes)
- 4110-05: Auxiliar administrativo
- 4110-10: Assistente de secretaria
- 5141-05: Atendente de bar
- 5141-10: Barman
- 5212-05: Demonstrador de mercadorias
- 5211-05: Vendedor de comércio varejista
- 1421-05: Gerente de loja
- 7771-10: Padeiro e confeiteiro
- 5131-05: Garçom
- 5131-10: Cumim
- 8485-10: Embalador a mão
- 9111-05: Faxineiro

Código consultado: ${code}

REGRA IMPORTANTE: Se o código tiver 6 dígitos com formato válido (XXXX-XX), retorne SEMPRE uma resposta com "encontrado": true, mesmo que seja uma estimativa baseada na família ocupacional (primeiros 4 dígitos). Só retorne "encontrado": false se o código tiver menos de 5 dígitos ou formato claramente inválido.

Responda SOMENTE com JSON válido, sem markdown, sem explicações:
{
  "codigo": "${code}",
  "titulo": "Título oficial ou mais provável do cargo conforme CBO 2002",
  "descricao": "Descreva em 2-3 frases as principais atividades deste cargo em português",
  "encontrado": true
}`
}

async function tryAI(code: string): Promise<CboResult | null> {
  const prompt = buildPrompt(code)
  const anthropicKey = await getAnthropicKey()
  const openaiKey = await getOpenAIKey()

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
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await response.json()
      if (data.error) {
        console.error('[CBO AI error]', data.error)
        return null
      }
      const text: string = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*?\}/)
      if (jsonMatch) return JSON.parse(jsonMatch[0]) as CboResult
    } catch (e) {
      console.error('[CBO Anthropic error]', e)
    }
  }

  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Você é um especialista em CBO 2002 (Classificação Brasileira de Ocupações). Responda sempre em JSON válido.',
            },
            { role: 'user', content: prompt },
          ],
          max_tokens: 600,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await response.json()
      const text: string = data.choices?.[0]?.message?.content || ''
      if (text) return JSON.parse(text) as CboResult
    } catch (e) {
      console.error('[CBO OpenAI error]', e)
    }
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json()
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Código CBO obrigatório' }, { status: 400 })
    }

    const digits = code.replace(/\D/g, '')
    const formattedCode = formatCode(digits)

    // Validação mínima: precisa ter pelo menos 5 dígitos
    if (digits.length < 5) {
      return NextResponse.json({
        codigo: formattedCode,
        titulo: '',
        descricao: '',
        encontrado: false,
      })
    }

    const anthropicKey = await getAnthropicKey()
    const openaiKey = await getOpenAIKey()
    if (!anthropicKey && !openaiKey) {
      return NextResponse.json({ error: 'Chave de IA não configurada. Adicione em Dados da Empresa > Configuração da IA.' }, { status: 500 })
    }

    // 1ª tentativa: BrasilAPI
    const brasilResult = await tryBrasilApi(digits)
    if (brasilResult) return NextResponse.json(brasilResult)

    // 2ª tentativa: IA
    const aiResult = await tryAI(formattedCode)
    if (aiResult) return NextResponse.json(aiResult)

    // Fallback: retorna não encontrado
    return NextResponse.json({
      codigo: formattedCode,
      titulo: '',
      descricao: '',
      encontrado: false,
    })
  } catch (err) {
    console.error('[CBO search]', err)
    return NextResponse.json({ error: 'Erro interno ao consultar CBO' }, { status: 500 })
  }
}
