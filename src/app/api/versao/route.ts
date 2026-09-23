import { NextResponse } from 'next/server'
import { versaoAtual } from '@/lib/versao'

export const dynamic = 'force-dynamic'

/**
 * GET /api/versao — qual versão está no ar agora.
 *
 * A tela guarda a versão com que foi carregada e pergunta aqui de tempos em
 * tempos. Quando as duas diferem, é porque saiu uma publicação nova e a aba
 * aberta está rodando código velho.
 *
 * Rota pública de propósito (não expõe nada além do hash do commit) e sem
 * cache: uma resposta guardada faria a aba nunca perceber a atualização.
 */
export async function GET() {
  return NextResponse.json(
    { versao: versaoAtual() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
