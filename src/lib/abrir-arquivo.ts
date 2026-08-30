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
): Promise<string | null> {
  e.preventDefault()
  e.stopPropagation()

  if (!file) return 'Arquivo não encontrado.'

  if (!file.path) {
    if (file.url) { window.open(file.url, '_blank', 'noopener'); return null }
    return 'Arquivo sem caminho salvo.'
  }

  // Abre a aba agora, com o gesto ainda "quente".
  const aba = window.open('', '_blank')
  if (aba) aba.opener = null

  try {
    const res = await fetch('/api/admin/arquivos/assinar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket, path: file.path }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d.url) throw new Error(d.error || 'Não foi possível abrir o arquivo.')
    if (aba) aba.location.replace(d.url)
    else window.open(d.url, '_blank', 'noopener')
    return null
  } catch (err) {
    aba?.close()
    return (err as Error).message
  }
}
