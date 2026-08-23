import Image from 'next/image'

/**
 * Avatar do colaborador nas listas.
 *
 * As fotos no Storage são os arquivos originais do celular — média 316 KB,
 * até 1,4 MB — e eram servidas cruas em `<img>` para desenhar 40×40 px: a
 * tela de Contratados baixava ~14,5 MB só de avatar. Com `next/image` a
 * Vercel redimensiona antes de mandar (≈2 KB em WebP por foto). O domínio do
 * Storage já está liberado em `next.config.ts` → `images.remotePatterns`.
 *
 * `corFallback` são as classes do círculo com a inicial, que muda de cor por
 * tela (contratados verde, desligados rosa, em contrato azul-petróleo…).
 */
export function FotoColaborador({
  url, nome, corFallback = 'bg-emerald-100', corTexto = 'text-emerald-700', tamanho = 40,
}: {
  url?: string | null
  nome?: string | null
  corFallback?: string
  corTexto?: string
  tamanho?: number
}) {
  const inicial = nome?.trim()?.charAt(0)?.toUpperCase() || '?'

  if (!url) {
    return (
      <div
        style={{ width: tamanho, height: tamanho }}
        className={`rounded-full flex items-center justify-center shrink-0 ${corFallback}`}
      >
        <span className={`text-sm font-bold ${corTexto}`}>{inicial}</span>
      </div>
    )
  }

  return (
    <Image
      src={url}
      alt={nome || 'Foto do colaborador'}
      width={tamanho}
      height={tamanho}
      // A foto real é bem maior que o quadro; o corte é o mesmo do object-cover.
      className="rounded-full object-cover shrink-0 border border-gray-200"
      style={{ width: tamanho, height: tamanho }}
    />
  )
}
