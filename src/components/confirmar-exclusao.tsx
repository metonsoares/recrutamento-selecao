'use client'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Confirmação de exclusão em modal.
 *
 * Modal e não `confirm()` do navegador: o nativo é suprimido em alguns
 * contextos (e no app embutido em tablet), e ali a exclusão aconteceria sem
 * ninguém confirmar nada.
 *
 * Uso: `const { ask, dialog } = useConfirmarExclusao()`, `if (!(await
 * ask('Remover este arquivo?'))) return`, e renderize `{dialog}` no componente.
 */
export function useConfirmarExclusao() {
  const [pending, setPending] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null)

  const ask = (message: string) => new Promise<boolean>(resolve => setPending({ message, resolve }))
  const close = (v: boolean) => { pending?.resolve(v); setPending(null) }

  const dialog = pending ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => close(false)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b">
          <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-red-600" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">Confirmar exclusão</h2>
        </div>
        <div className="px-5 py-4 text-sm text-gray-600">
          {pending.message}
          <span className="block mt-1 text-gray-500">Tem certeza? Esta ação não pode ser desfeita.</span>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
          <Button variant="outline" onClick={() => close(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={() => close(true)} className="gap-1.5">
            <Trash2 className="w-3.5 h-3.5" />Excluir
          </Button>
        </div>
      </div>
    </div>
  ) : null

  return { ask, dialog }
}
