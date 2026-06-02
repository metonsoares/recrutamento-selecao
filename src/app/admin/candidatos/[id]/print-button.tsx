'use client'
import { FileDown } from 'lucide-react'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
    >
      <FileDown className="w-4 h-4" />
      Exportar PDF
    </button>
  )
}
