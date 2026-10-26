import type { MetadataRoute } from 'next'
import { publicAppUrl } from '@/lib/helpers'

/**
 * Sitemap do Banco de Talentos — uma URL só, de propósito.
 *
 * O sistema tem exatamente uma superfície pública: o formulário de currículo.
 * Tudo mais é painel interno ou link por token, que não pode ser anunciado ao
 * buscador. Um sitemap com uma entrada parece pouco, mas é o que faz o Google
 * descobrir o formulário sem depender de alguém linkar para ele por fora —
 * hoje o candidato só chega pelo link que a empresa divulga.
 *
 * Sem `lastModified`: a página é um formulário, não conteúdo editorial; data
 * inventada aqui só ensinaria o buscador a desconfiar das outras.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicAppUrl()
  return [
    {
      url: `${base}/curriculo`,
      changeFrequency: 'monthly',
      priority: 1,
    },
  ]
}
