import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'

const FIELD_INSTRUCTIONS: Record<string, string> = {
  mission: 'Reescreva a Missão da empresa de forma clara, inspiradora e objetiva (1-2 frases). Deve comunicar o propósito central do negócio.',
  vision: 'Reescreva a Visão da empresa de forma ambiciosa, clara e orientada ao futuro (1-2 frases). Deve indicar onde a empresa quer chegar.',
  company_culture: 'Reescreva a descrição da Cultura da Empresa de forma envolvente e autêntica. Descreva os valores, o ambiente de trabalho e o que torna essa empresa especial (3-5 frases).',
  ideal_candidate_profile: 'Reescreva o Perfil Ideal do Colaborador de forma atrativa e específica. Descreva características, atitudes e habilidades valorizadas (3-5 frases).',
  desired_behaviors: 'Reescreva esta lista de Comportamentos Desejados. Mantenha um item por linha. Torne cada item claro, positivo e acionável.',
  alert_behaviors: 'Reescreva esta lista de Comportamentos de Alerta. Mantenha um item por linha. Torne cada item claro e objetivo, sem julgamentos negativos excessivos.',
  whatsapp_agent_prompt: 'Melhore este prompt do agente de WhatsApp. Mantenha o tom simpático e profissional. Inclua instruções claras sobre como conduzir o candidato pelo processo seletivo.',
  analysis_prompt: 'Melhore este prompt de análise de candidatos. Torne as instruções mais claras, objetivas e alinhadas com boas práticas de RH.',
}

export async function POST(req: NextRequest) {
  try {
    const { field, value } = await req.json()

    if (!field || !value?.trim()) {
      return NextResponse.json({ error: 'Campo e valor são obrigatórios' }, { status: 400 })
    }

    const instruction = FIELD_INSTRUCTIONS[field]
    if (!instruction) {
      return NextResponse.json({ error: 'Campo não reconhecido' }, { status: 400 })
    }

    const anthropicKey = await getAnthropicKey()
    const openaiKey = await getOpenAIKey()

    if (!anthropicKey && !openaiKey) {
      return NextResponse.json({
        error: 'Chave de IA não configurada. Adicione sua ANTHROPIC_API_KEY na seção "Configuração da IA" em Dados da Empresa.',
      }, { status: 500 })
    }

    // Busca contexto da empresa para enriquecer a resposta
    const supabase = await createSupabaseServiceClient()
    const { data: settings } = await supabase
      .from('ai_settings')
      .select('mission, vision, company_culture')
      .limit(1)
      .single()

    const contextLines = [
      settings?.mission ? `Missão: ${settings.mission}` : null,
      settings?.vision ? `Visão: ${settings.vision}` : null,
      settings?.company_culture ? `Cultura: ${settings.company_culture}` : null,
    ].filter(Boolean).join('\n')

    const prompt = `Você é um especialista em Recursos Humanos e comunicação empresarial, ajudando uma empresa de confeitaria artesanal chamada "Brownie do Ton".
${contextLines ? `\nContexto da empresa:\n${contextLines}\n` : ''}
Texto atual:
"""
${value}
"""

Tarefa: ${instruction}

Retorne APENAS o texto melhorado, sem aspas, sem explicações, sem comentários adicionais. Escreva em português brasileiro, tom profissional mas acolhedor.`

    let improved = ''

    if (anthropicKey) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
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
      })
      const data = await response.json()
      if (data.error) {
        console.error('[improve-text Anthropic error]', data.error)
        return NextResponse.json({ error: `Erro da IA: ${data.error.message || 'Verifique sua chave de API.'}` }, { status: 500 })
      }
      improved = data.content?.[0]?.text?.trim() || ''
    } else if (openaiKey) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
        }),
      })
      const data = await response.json()
      improved = data.choices?.[0]?.message?.content?.trim() || ''
    }

    if (!improved) {
      return NextResponse.json({ error: 'IA não retornou resultado. Tente novamente.' }, { status: 500 })
    }

    return NextResponse.json({ improved })
  } catch (err) {
    console.error('[improve-text]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
