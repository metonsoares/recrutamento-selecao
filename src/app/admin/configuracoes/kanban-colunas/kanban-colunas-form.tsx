'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import {
  GripVertical, ChevronUp, ChevronDown,
  CheckCircle2, Loader2, RotateCcw, Columns3,
} from 'lucide-react'

interface ColDef {
  key: string
  label: string
  dot: string
}

interface Props {
  columns: readonly ColDef[]
  settingsId: string | null
}

export function KanbanColunasForm({ columns: initial, settingsId }: Props) {
  const router = useRouter()
  const [cols, setCols] = useState<ColDef[]>([...initial])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // ── Drag state ────────────────────────────────────────────────────────────
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  function move(from: number, to: number) {
    if (to < 0 || to >= cols.length) return
    setCols(prev => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
    setSaved(false)
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, idx: number) {
    dragIdx.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOver(idx)
  }

  function onDrop(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragIdx.current !== null && dragIdx.current !== idx) {
      move(dragIdx.current, idx)
    }
    dragIdx.current = null
    setDragOver(null)
  }

  function onDragEnd() {
    dragIdx.current = null
    setDragOver(null)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const supabase = createSupabaseBrowserClient()
    const order = cols.map(c => c.key)
    if (settingsId) {
      await supabase
        .from('ai_settings')
        .update({ kanban_column_order: order, updated_at: new Date().toISOString() })
        .eq('id', settingsId)
    } else {
      await supabase
        .from('ai_settings')
        .insert({ kanban_column_order: order })
    }
    setSaving(false)
    setSaved(true)
    router.refresh()
  }

  // ── Reset to default ──────────────────────────────────────────────────────
  async function handleReset() {
    if (!confirm('Restaurar a ordem padrão das colunas?')) return
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    if (settingsId) {
      await supabase
        .from('ai_settings')
        .update({ kanban_column_order: null, updated_at: new Date().toISOString() })
        .eq('id', settingsId)
    }
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="p-4 sm:p-6 max-w-xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Columns3 className="w-6 h-6 text-[#333]" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ordenar Colunas do Kanban</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Arraste ou use os botões ↑↓ para definir a ordem das colunas.
          </p>
        </div>
      </div>

      {/* Column list */}
      <div className="space-y-1.5">
        {cols.map((col, idx) => (
          <div
            key={col.key}
            draggable
            onDragStart={e => onDragStart(e, idx)}
            onDragOver={e => onDragOver(e, idx)}
            onDrop={e => onDrop(e, idx)}
            onDragEnd={onDragEnd}
            className={[
              'flex items-center gap-3 px-4 py-3 bg-white border rounded-xl shadow-sm',
              'transition-all duration-150 select-none cursor-grab active:cursor-grabbing',
              dragOver === idx ? 'border-primary/60 ring-1 ring-primary/30 scale-[1.01]' : 'border-gray-200 hover:border-gray-300',
            ].join(' ')}
          >
            {/* Drag handle */}
            <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />

            {/* Dot + label */}
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${col.dot}`} />
            <span className="flex-1 text-[15px] font-medium text-[#1a1a1a]">{col.label}</span>

            {/* Position badge */}
            <span className="text-[11px] font-mono text-muted-foreground bg-gray-100 rounded px-1.5 py-0.5">
              {idx + 1}
            </span>

            {/* Up / Down buttons */}
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => move(idx, idx - 1)}
                disabled={idx === 0}
                className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 transition-colors"
                title="Mover para cima"
              >
                <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
              </button>
              <button
                onClick={() => move(idx, idx + 1)}
                disabled={idx === cols.length - 1}
                className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 transition-colors"
                title="Mover para baixo"
              >
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</>
            : 'Salvar ordem'
          }
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={saving}
          className="gap-1.5 text-gray-600"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restaurar padrão
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
            Ordem salva! Recarregue o Kanban para ver.
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground border-t pt-3">
        🔒 Apenas administradores do sistema podem alterar a ordem das colunas.
      </p>
    </div>
  )
}
