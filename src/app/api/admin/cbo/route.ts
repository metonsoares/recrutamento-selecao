import { NextRequest, NextResponse } from 'next/server'

// Busca informações de um cargo pelo código CBO (Classificação Brasileira de Ocupações)
// Usa a IA para identificar o cargo com precisão
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json()
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Código CBO obrigatório' }, { status: 400 })
    }

    const cleanCode = code.replace(/\D/g, '').replace(/^(\d{4})(\d{2})$/, '$1-$2').trim()

    if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Nenhuma chave de IA configurada' }, { status: 500 })
    }

    const prompt = `Você é um especialista em CBO (Classificação Brasileira de Ocupações) do Ministério do Trabalho do Brasil.

O usuário digitou o código CBO: ${cleanCode}

Responda APENAS com um JSON válido (sem markdown, sem texto antes ou depois) com a seguinte estrutura:
{
  "codigo": "XXXX-XX",
  "titulo": "Nome oficial do cargo conforme CBO 2002",
  "descricao": "Descrição resumida das principais atividades e responsabilidades deste cargo (2-4 frases em português)",
  "encontrado": true
}

Se o código não existir ou for inválido, retorne:
{
  "codigo": "${cleanCode}",
  "titulo": "",
  "descricao": "",
  "encontrado": false
}`

    let result: { codigo: string; titulo: string; descricao: string; encontrado: boolean } | null = null

    if (process.env.ANTHROPIC_API_KEY) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await response.json()
      const text: string = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) result = JSON.parse(jsonMatch[0])
    } else if (process.env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 512,
        }),
      })
      const data = await response.json()
      const text: string = data.choices?.[0]?.message?.content || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) result = JSON.parse(jsonMatch[0])
    }

    if (!result) {
      return NextResponse.json({ error: 'Não foi possível consultar o CBO' }, { status: 500 })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[CBO search]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
