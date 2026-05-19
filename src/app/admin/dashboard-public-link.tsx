'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Check, ExternalLink } from 'lucide-react'

export function DashboardPublicLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select text
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <code className="text-xs bg-[#f4f4f4] border rounded px-2 py-1 text-[#333] break-all">
        {url}
      </code>
      <Button
        size="sm"
        variant="outline"
        onClick={handleCopy}
        className={`shrink-0 transition-all ${copied ? 'border-emerald-400 text-emerald-600' : ''}`}
      >
        {copied
          ? <><Check className="w-3.5 h-3.5 mr-1" />Copiado!</>
          : <><Copy className="w-3.5 h-3.5 mr-1" />Copiar link</>
        }
      </Button>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <Button size="sm" variant="ghost" className="text-muted-foreground">
          <ExternalLink className="w-3.5 h-3.5 mr-1" />Abrir
        </Button>
      </a>
    </div>
  )
}
