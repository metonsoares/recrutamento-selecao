/**
 * Versão publicada: o commit que a Vercel construiu.
 *
 * A tela guarda a versão com que foi carregada e compara com a que /api/versao
 * devolve; quando diferem, saiu publicação nova e a aba aberta está rodando
 * código velho. Fora da Vercel não há publicação para comparar, então 'dev'
 * desliga o aviso.
 */
export function versaoAtual(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.VERCEL_DEPLOYMENT_ID
    || 'dev'
}
