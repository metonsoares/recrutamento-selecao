'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserMinus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export function DesligarFuncionarioButton({ applicationId }: { applicationId?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleDesligar() {
    if (!applicationId) return
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('applications')
      .update({ status: 'desligado', terminated_at: now, updated_at: now })
      .eq('id', applicationId)
    setSaving(false)
    if (!error) { setOpen(false); router.refresh() }
  }

  if (!applicationId) return null

  return (
    <div className="mt-6 border-t pt-5">
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"
      >
        <UserMinus className="w-4 h-4" />
        Desligar funcionário
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              <UserMinus className="w-5 h-5 text-rose-600" />
              <h2 className="text-base font-semibold text-gray-900">Desligar funcionário</h2>
            </div>
            <p className="text-sm text-gray-600">
              Confirmar o desligamento deste funcionário? O status passará para <strong>Desligado</strong> e ele será listado em <em>Colaboradores → Desligados</em>.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDesligar} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                Desligar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
