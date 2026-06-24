'use client'
import { useEffect } from 'react'

export function AutoPrint() {
  useEffect(() => {
    let done = false
    const fire = () => { if (!done) { done = true; window.print() } }

    // Espera as imagens (ex.: foto do candidato) carregarem antes de imprimir,
    // com um fallback para não travar caso alguma falhe.
    const pending = Array.from(document.images).filter(img => !img.complete)
    if (pending.length === 0) {
      const t = setTimeout(fire, 500)
      return () => clearTimeout(t)
    }
    let loaded = 0
    const onDone = () => { loaded++; if (loaded >= pending.length) fire() }
    pending.forEach(img => { img.addEventListener('load', onDone); img.addEventListener('error', onDone) })
    const fallback = setTimeout(fire, 3000)
    return () => {
      clearTimeout(fallback)
      pending.forEach(img => { img.removeEventListener('load', onDone); img.removeEventListener('error', onDone) })
    }
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
