/**
 * Rota de diagnóstico — verifica se as chaves de IA estão acessíveis.
 * GET /api/admin/ai/test-key
 * Remover após confirmar que tudo funciona.
 */
import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'
import { decryptToken } from '@/lib/helpers'

export async function GET() {
  const results: Record<string, unknown> = {}

  // 1. Verificar variáveis de ambiente
  results.env = {
    ENCRYPTION_SECRET: process.env.ENCRYPTION_SECRET
      ? `✅ definido (${process.env.ENCRYPTION_SECRET.length} chars)`
      : '❌ NÃO definido — descriptografia vai falhar!',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
      ? `✅ definido via env (${process.env.ANTHROPIC_API_KEY.length} chars)`
      : '⚠️ vazio — usará banco de dados',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
      ? `✅ definido via env (${process.env.OPENAI_API_KEY.length} chars)`
      : '⚠️ vazio — usará banco de dados',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? `✅ definido (${process.env.SUPABASE_SERVICE_ROLE_KEY.length} chars)`
      : '❌ NÃO definido',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '❌ NÃO definido',
  }

  // 2. Verificar raw do banco + testar descriptografia
  try {
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('ai_settings')
      .select('anthropic_api_key_encrypted, openai_api_key_encrypted, analysis_provider')
      .limit(1)
      .single()

    if (error) {
      results.db = { error: error.message }
    } else {
      const anthropicRaw = data?.anthropic_api_key_encrypted
      const openaiRaw    = data?.openai_api_key_encrypted

      let anthropicDecrypt = '—'
      let openaiDecrypt    = '—'

      if (anthropicRaw) {
        try {
          const dec = decryptToken(anthropicRaw)
          anthropicDecrypt = dec
            ? `✅ descriptografado OK — começa com "${dec.slice(0, 7)}..." (${dec.length} chars)`
            : '❌ descriptografia retornou vazio'
        } catch (e) {
          anthropicDecrypt = `❌ ERRO na descriptografia: ${String(e)}`
        }
      } else {
        anthropicDecrypt = '❌ campo vazio no banco'
      }

      if (openaiRaw) {
        try {
          const dec = decryptToken(openaiRaw)
          openaiDecrypt = dec
            ? `✅ descriptografado OK — começa com "${dec.slice(0, 7)}..." (${dec.length} chars)`
            : '❌ descriptografia retornou vazio'
        } catch (e) {
          openaiDecrypt = `❌ ERRO na descriptografia: ${String(e)}`
        }
      } else {
        openaiDecrypt = '❌ campo vazio no banco'
      }

      results.db = {
        analysis_provider: data?.analysis_provider ?? '(auto)',
        anthropic_raw_len: anthropicRaw ? `${anthropicRaw.length} chars` : 'vazio',
        anthropic_has_colon: anthropicRaw ? anthropicRaw.includes(':') : false,
        anthropic_decrypt: anthropicDecrypt,
        openai_raw_len: openaiRaw ? `${openaiRaw.length} chars` : 'vazio',
        openai_decrypt: openaiDecrypt,
      }
    }
  } catch (e) {
    results.db = { exception: String(e) }
  }

  // 3. Testar getAnthropicKey() e getOpenAIKey() (função completa)
  try {
    const [anthropicKey, openaiKey] = await Promise.all([getAnthropicKey(), getOpenAIKey()])
    results.resolved_keys = {
      anthropic: anthropicKey
        ? `✅ chave resolvida OK — começa com "${anthropicKey.slice(0, 7)}..." (${anthropicKey.length} chars)`
        : '❌ NULL — análise vai usar fallback',
      openai: openaiKey
        ? `✅ chave resolvida OK — começa com "${openaiKey.slice(0, 7)}..." (${openaiKey.length} chars)`
        : '❌ NULL — análise vai usar fallback',
    }

    // 4. Teste real de ping na API da Anthropic (sem gerar resposta longa)
    if (anthropicKey) {
      try {
        const ctrl = new AbortController()
        setTimeout(() => ctrl.abort(), 5000)
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Responda apenas: OK' }],
          }),
        })
        const body = await res.json().catch(() => ({}))
        results.anthropic_api_ping = res.ok
          ? `✅ API respondeu OK (status ${res.status}) — "${(body as {content?: Array<{text?: string}>}).content?.[0]?.text ?? '?'}"`
          : `❌ API erro status ${res.status}: ${JSON.stringify(body).slice(0, 200)}`
      } catch (e) {
        results.anthropic_api_ping = `❌ Falha na conexão com Anthropic: ${String(e)}`
      }
    } else {
      results.anthropic_api_ping = '⚠️ pulado — chave não resolvida'
    }

  } catch (e) {
    results.resolved_keys = { exception: String(e) }
  }

  return NextResponse.json(results, { status: 200 })
}
