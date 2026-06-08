'use client'
import { useState } from 'react'
import { X } from 'lucide-react'

export function PhotoViewer({ src, name }: { src: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)

  if (failed) return <PhotoPlaceholder />

  return (
    <>
      {/* Miniatura 3x4 — clicável */}
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 w-[72px] h-[96px] rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shadow-sm hover:border-primary hover:shadow-md transition-all cursor-zoom-in focus:outline-none"
        title="Clique para ampliar a foto"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Foto de ${name}`}
          className="w-full h-full object-cover"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </button>

      {/* Modal ampliado */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute -top-3 -right-3 z-10 bg-white rounded-full p-1 shadow-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-700" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Foto de ${name}`}
              className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]"
            />
            <p className="text-center text-white text-sm mt-3 font-medium">{name}</p>
          </div>
        </div>
      )}
    </>
  )
}

export function PhotoPlaceholder() {
  return (
    <div className="shrink-0 w-[72px] h-[96px] rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 flex items-center justify-center shadow-sm">
      <span className="text-[10px] text-muted-foreground text-center px-1">Sem foto</span>
    </div>
  )
}
