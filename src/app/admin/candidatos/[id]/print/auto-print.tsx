'use client'
import { useEffect } from 'react'

export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 700)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', top: 16, right: 16, zIndex: 9999,
        display: 'flex', gap: 8,
      }}
    >
      <button
        onClick={() => window.print()}
        style={{
          background: '#1a5c38', color: '#fff', border: 'none',
          borderRadius: 8, padding: '8px 18px', cursor: 'pointer',
          fontWeight: 600, fontSize: 13,
        }}
      >
        🖨️ Imprimir / Salvar PDF
      </button>
      <button
        onClick={() => window.close()}
        style={{
          background: '#6b7280', color: '#fff', border: 'none',
          borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
          fontSize: 13,
        }}
      >
        ✕ Fechar
      </button>
    </div>
  )
}
