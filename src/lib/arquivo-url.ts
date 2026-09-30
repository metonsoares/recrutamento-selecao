/**
 * Arquivos do bucket `candidatos-arquivos` (foto e anexos do currículo).
 *
 * O que o banco guarda é a URL PÚBLICA devolvida no envio do formulário —
 * e é justamente ela que precisa deixar de funcionar quando o bucket fechar.
 * O caminho dentro do bucket está embutido nessa URL, então dá para servir o
 * arquivo pela rota protegida SEM migrar dado nenhum: registro antigo e novo
 * seguem o mesmo caminho.
 *
 * `<img>` não pode "assinar no clique" como os anexos do admissional, por isso
 * a rota `/api/admin/arquivos/ver` existe: ela confere o perfil e redireciona
 * para uma URL assinada de vida curta.
 */

export const BUCKET_CANDIDATOS = 'candidatos-arquivos'

/**
 * Caminho dentro do bucket a partir da URL pública guardada no registro.
 * Devolve null quando o valor não é uma URL deste bucket (texto livre, link
 * externo colado pelo candidato, valor vazio).
 */
export function caminhoNoBucket(
  valor: string | null | undefined,
  bucket: string = BUCKET_CANDIDATOS,
): string | null {
  if (!valor) return null
  const marca = `/storage/v1/object/public/${bucket}/`
  const i = valor.indexOf(marca)
  if (i === -1) return null
  const caminho = valor.slice(i + marca.length).split('?')[0]
  if (!caminho || caminho.includes('..')) return null
  try {
    return decodeURIComponent(caminho)
  } catch {
    return caminho
  }
}

/**
 * URL a usar em `<img src>`: passa pela rota `/api/img`, que confere o perfil e
 * lê o arquivo com a service role. Vale para qualquer bucket do Storage; se o
 * valor não for um arquivo nosso (link externo), devolve ele mesmo.
 */
export function urlProtegida(valor: string | null | undefined): string | null {
  if (!valor) return null
  if (!/\/storage\/v1\/object\/public\//.test(valor)) return valor
  return `/api/img?u=${encodeURIComponent(valor)}`
}
