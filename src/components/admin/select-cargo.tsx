'use client'

/**
 * Escolha de cargo a partir da lista oficial (Configurações → Empresa → Cadastro de cargos).
 *
 * Duas garantias que o <select> puro não dá:
 *
 * 1. O cargo que já está na ficha NUNCA se perde. Se ele não estiver mais na
 *    lista (alguém removeu o cargo depois da admissão), ele entra como opção
 *    própria, marcada, em vez de a ficha abrir vazia e salvar em branco.
 * 2. Diferença de maiúscula não desalinha: "Auxiliar Administrativo" casa com
 *    "Auxiliar administrativo" da lista e passa a gravar a grafia oficial — era
 *    assim que nasciam os cargos repetidos com grafias diferentes.
 */
export function SelectCargo({
  value, cargos, onChange, id, disabled,
}: {
  value: string
  cargos: string[]
  onChange: (v: string) => void
  id?: string
  disabled?: boolean
}) {
  const atual = (value ?? '').trim()
  const oficial = cargos.find(c => c.toLowerCase() === atual.toLowerCase())
  const foraDaLista = atual && !oficial

  return (
    <select
      id={id}
      disabled={disabled}
      value={oficial ?? atual}
      onChange={e => onChange(e.target.value)}
      className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white"
    >
      <option value="">Selecionar...</option>
      {foraDaLista && <option value={atual}>{atual} (fora da lista)</option>}
      {cargos.map(c => <option key={c} value={c}>{c}</option>)}
    </select>
  )
}
