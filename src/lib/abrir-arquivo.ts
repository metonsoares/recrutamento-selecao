export interface ArquivoRef {
  url?: string | null
  /** Caminho dentro do bucket — é ele que permite assinar na hora do clique. */
  path?: string | null
  name?: string | null
}

export type BucketArquivo = 'admission-docs' | 'candidatos-arquivos' | 'folhas-analiticas'

/**
 * Abre um arquivo do Storage assinando a URL NO CLIQUE.
 *
 * Usado no `onClick` dos links que antes apontavam direto para `file.url` —
 * o que só funcionava porque o bucket era público. Com o bucket fechado, o que
 * vale é o `path` guardado no registro.
 *
 * Dois cuidados que já custaram caro neste projeto:
 *  - a aba é aberta ANTES do await; abrir depois é bloqueado como popup;
 *  - `window.open(..., 'noopener')` devolve null por especificação, então a
 *    proteção vira `aba.opener = null`.
 *
 * Registro antigo sem `path` continua abrindo pela `url` guardada, então nada
 * quebra enquanto houver arquivo legado.
 *
 * Devolve `null` em caso de sucesso ou a mensagem de erro — quem chama decide
 * como avisar. Falhar calado seria pior: o usuário clicaria de novo sem
 * entender por quê.
 */
export async function abrirArquivoAssinado(
  e: { preventDefault: () => void; stopPropagation: () => void },
  file: ArquivoRef | null | undefined,
  bucket: BucketArquivo = 'admission-docs',
  /**
   * `envolverUrl` transforma a URL assinada na URL a abrir — existe para o
   * visualizador do Office (.docx), que recebe o arquivo por parâmetro. Passar
   * `envolverUrl` significa VISUALIZAR; sem ele, o arquivo é BAIXADO, que é o
   * que se espera de um anexo.
   */
  opcoes: { envolverUrl?: (assinada: string) => string } = {},
): Promise<string | null> {
  e.preventDefault()
  e.stopPropagation()

  if (!file) return 'Arquivo não encontrado.'

  const visualizar = !!opcoes.envolverUrl

  if (!file.path) {
    if (file.url) { window.open(file.url, '_blank', 'noopener'); return null }
    return 'Arquivo sem caminho salvo.'
  }

  // Só a visualização precisa de aba, e ela abre AGORA, com o gesto ainda
  // "quente" — abrir depois do await seria bloqueado como popup. O download
  // não abre aba nenhuma: o Storage devolve o arquivo como anexo e o
  // navegador baixa sem tirar o usuário da tela.
  const aba = visualizar ? window.open('', '_blank') : null
  if (aba) aba.opener = null

  try {
    const res = await fetch('/api/admin/arquivos/assinar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket, path: file.path, download: visualizar ? undefined : (file.name ?? true) }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d.url) throw new Error(d.error || 'Não foi possível abrir o arquivo.')

    if (visualizar) {
      const destino = opcoes.envolverUrl!(d.url as string)
      if (aba) aba.location.replace(destino)
      else window.open(destino, '_blank', 'noopener')
      return null
    }

    baixar(d.url as string, file.name ?? undefined)
    return null
  } catch (err) {
    aba?.close()
    return (err as Error).message
  }
}

/**
 * Dispara o download. O nome vem do atributo `download` quando a origem é a
 * mesma, e do Content-Disposition que o Storage devolve quando não é — por
 * isso a URL assinada já pede `download` na API.
 */
function baixar(url: string, nome?: string) {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  if (nome) a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
}
