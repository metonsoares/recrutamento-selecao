'use client'
import { useEffect, useState } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Confirmação em modal — o padrão da casa para "tem certeza?".
 *
 * Modal e não `confirm()` do navegador: o nativo sai fora do visual do
 * sistema, é suprimido em alguns contextos (e no app embutido em tablet) e,
 * quando some, a pergunta simplesmente não é feita.
 *
 * Duas formas de usar, pela mesma janela:
 *
 *  - `await confirmarExclusao('Remover este atestado?')` — a mais simples, não
 *    precisa de nada no JSX. Funciona porque o painel monta o
 *    `<ConfirmarExclusaoHost />` uma única vez (admin/layout.tsx).
 *  - `const { ask, dialog } = useConfirmarExclusao()` + `{dialog}` no JSX —
 *    forma antiga, mantida para quem já usa.
 */

export interface OpcoesConfirmacao {
  /** Título da janela. Padrão: "Confirmar exclusão". */
  titulo?: string
  /** Texto do botão que confirma. Padrão: "Excluir". */
  confirmar?: string
  /**
   * `false` quando não é exclusão (bloquear, restaurar…): tira o vermelho, o
   * ícone de lixeira e o aviso de "não pode ser desfeita".
   */
  destrutivo?: boolean
}

interface Pedido extends OpcoesConfirmacao {
  mensagem: string
  resolve: (v: boolean) => void
}

function Janela({ pedido, fechar }: { pedido: Pedido; fechar: (v: boolean) => void }) {
  const destrutivo = pedido.destrutivo !== false
  const Icone = destrutivo ? Trash2 : AlertTriangle

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => fechar(false)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${destrutivo ? 'bg-red-50' : 'bg-amber-50'}`}>
            <Icone className={`w-4 h-4 ${destrutivo ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <h2 className="text-base font-semibold text-gray-900">
            {pedido.titulo ?? 'Confirmar exclusão'}
          </h2>
        </div>
        <div className="px-5 py-4 text-sm text-gray-600">
          {pedido.mensagem}
          {destrutivo && (
            <span className="block mt-1 text-gray-500">Tem certeza? Esta ação não pode ser desfeita.</span>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
          <Button variant="outline" onClick={() => fechar(false)}>Cancelar</Button>
          <Button variant={destrutivo ? 'destructive' : 'default'} onClick={() => fechar(true)} className="gap-1.5">
            {destrutivo && <Trash2 className="w-3.5 h-3.5" />}
            {pedido.confirmar ?? 'Excluir'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Forma simples: uma janela só, montada pelo layout do painel ─────────────

/** Preenchido pelo host enquanto ele está na tela. */
let abrirJanela: ((pedido: Omit<Pedido, 'resolve'> & { resolve: (v: boolean) => void }) => void) | null = null

/**
 * Pergunta e devolve true/false. Sem o host na tela (página pública, teste),
 * cai no `confirm()` do navegador — perguntar de um jeito feio é melhor do que
 * não perguntar.
 */
export function confirmarExclusao(mensagem: string, opcoes: OpcoesConfirmacao = {}): Promise<boolean> {
  if (!abrirJanela) {
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(mensagem) : false)
  }
  return new Promise<boolean>(resolve => abrirJanela!({ mensagem, ...opcoes, resolve }))
}

/** Monte uma vez (admin/layout.tsx). É ele que desenha a janela. */
export function ConfirmarExclusaoHost() {
  const [pedido, setPedido] = useState<Pedido | null>(null)

  useEffect(() => {
    abrirJanela = p => setPedido(p as Pedido)
    return () => { abrirJanela = null }
  }, [])

  if (!pedido) return null
  const fechar = (v: boolean) => { pedido.resolve(v); setPedido(null) }
  return <Janela pedido={pedido} fechar={fechar} />
}

// ─── Forma antiga: hook + {dialog} no JSX ────────────────────────────────────

export function useConfirmarExclusao() {
  const [pending, setPending] = useState<Pedido | null>(null)

  const ask = (message: string, opcoes: OpcoesConfirmacao = {}) =>
    new Promise<boolean>(resolve => setPending({ mensagem: message, ...opcoes, resolve }))
  const close = (v: boolean) => { pending?.resolve(v); setPending(null) }

  const dialog = pending ? <Janela pedido={pending} fechar={close} /> : null

  return { ask, dialog }
}
