'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/helpers'
import { MessageSquare, Search, ExternalLink } from 'lucide-react'

interface Conv {
  id: string
  phone: string
  status: string
  current_step: string
  updated_at: string
  candidate_id: string | null
  candidates?: { full_name?: string } | null
}

export function WhatsappConversations({ conversations }: { conversations: Conv[] }) {
  const [search, setSearch] = useState('')

  const filtered = conversations.filter(c =>
    [c.phone, (c.candidates as { full_name?: string } | null)?.full_name || ''].join(' ').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Mensagens WhatsApp</h1>
        <p className="text-muted-foreground text-sm mt-1">{conversations.length} conversas</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-2">
        {filtered.map(conv => (
          <div key={conv.id} className="bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{(conv.candidates as { full_name?: string } | null)?.full_name || conv.phone}</p>
                <p className="text-xs text-muted-foreground">{conv.phone}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant={conv.status === 'active' ? 'default' : 'secondary'} className="text-xs">{conv.status}</Badge>
                  <span className="text-xs text-muted-foreground">Etapa: {conv.current_step}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-muted-foreground hidden md:block">{formatDateTime(conv.updated_at)}</span>
              {conv.candidate_id && (
                <Link href={`/admin/candidatos/${conv.candidate_id}`}>
                  <Button size="sm" variant="outline"><ExternalLink className="w-3 h-3 mr-1" />Perfil</Button>
                </Link>
              )}
            </div>
          </div>
        ))}
        {!filtered.length && (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Nenhuma conversa encontrada</p>
          </div>
        )}
      </div>
    </div>
  )
}
