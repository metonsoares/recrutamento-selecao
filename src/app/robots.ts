import type { MetadataRoute } from 'next'
import { publicAppUrl } from '@/lib/helpers'

/**
 * robots.txt do Banco de Talentos.
 *
 * Antes disto o endereço respondia 404 — o sistema não dava nenhuma orientação
 * ao buscador. Isso importa porque aqui quase tudo é privado: o ÚNICO lugar que
 * deve aparecer na busca é `/curriculo`, o formulário por onde o candidato se
 * cadastra. Todo o resto é painel interno ou link por token com dado pessoal.
 *
 * ATENÇÃO ao editar: não bloquear `/_next/static`. São o JavaScript e as fontes
 * que o Google precisa buscar para RENDERIZAR a página; bloquear faria o
 * formulário ser lido pela metade. Eles aparecem no Search Console como
 * "rastreada, mas não indexada", o que é o comportamento correto para arquivo
 * — não é defeito e não se conserta pelo robots.
 *
 * E lembrar: robots.txt controla RASTREAMENTO, não indexação. Uma URL que o
 * Google descobre por link externo pode entrar no índice mesmo bloqueada aqui.
 * Por isso as páginas de token também declaram `noindex` no próprio metadata —
 * as duas camadas juntas é que protegem o dado do candidato.
 */
const PRIVADO = [
  '/admin',
  '/api',
  '/login',
  '/candidato',
  '/documento',
  '/documentos',
  '/entrevista',
  '/pesquisa',
  '/d',
  '/e',
  '/curriculo/obrigado',
]

export default function robots(): MetadataRoute.Robots {
  const base = publicAppUrl()
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVADO }],
    sitemap: `${base}/sitemap.xml`,
  }
}
