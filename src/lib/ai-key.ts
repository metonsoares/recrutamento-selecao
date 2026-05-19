/**
 * Resolve chaves de API de IA:
 * 1ª prioridade: variável de ambiente
 * 2ª prioridade: chave criptografada salva na tabela ai_settings
 */
import { createSupabaseServiceClient } from './supabase-server'
import { decryptToken } from './helpers'

export async function getAnthropicKey(): Promise<string | null> {
  // Prioridade 1: variável de ambiente
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY

  // Prioridade 2: banco de dados (criptografado)
  try {
    const supabase = await createSupabaseServiceClient()
    const { data } = await supabase
      .from('ai_settings')
      .select('anthropic_api_key_encrypted')
      .limit(1)
      .single()

    const encrypted = data?.anthropic_api_key_encrypted
    if (encrypted) return decryptToken(encrypted)
  } catch {
    // Falha silenciosa
  }

  return null
}

export async function getOpenAIKey(): Promise<string | null> {
  // Prioridade 1: variável de ambiente
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY

  // Prioridade 2: banco de dados (criptografado)
  try {
    const supabase = await createSupabaseServiceClient()
    const { data } = await supabase
      .from('ai_settings')
      .select('openai_api_key_encrypted')
      .limit(1)
      .single()

    const encrypted = data?.openai_api_key_encrypted
    if (encrypted) return decryptToken(encrypted)
  } catch {
    // Falha silenciosa
  }

  return null
}
