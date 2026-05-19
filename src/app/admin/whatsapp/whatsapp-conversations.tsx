'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { formatDateTime } from '@/lib/helpers'
import { MessageSquare, Search, ExternalLink, ArrowLeft, RefreshCw, Trash2, ChevronRight } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conv {
  id: string
  phone: string
  status: string
  current_step: string
  updated_at: string
  closed_at?: string | null
  candidate_id: string | null
  candidates?: { full_name?: string } | null
}

/** 24 h idle window — must match the webhook's CONVERSATION_TTL_MS */
const TTL_MS = 24 * 60 * 60 * 1000

function isExpired(conv: Conv) {
  return Date.now() - new Date(conv.updated_at).getTime() > TTL_MS
}

interface Msg {
  id: string
  direction: 'inbound' | 'outbound'
  message_text: string
  created_at: string
  zapi_message_id: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`
  if (d.length === 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`
  return phone
}

function timeOnly(dt: string) {
  return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function dateLabel(dt: string) {
  const d = new Date(dt)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WhatsappConversations({ conversations }: { conversations: Conv[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Conv | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const filtered = conversations.filter(c =>
    [c.phone, (c.candidates as { full_name?: string } | null)?.full_name || '']
      .join(' ').toLowerCase().includes(search.toLowerCase())
  )

  async function loadMessages(conv: Conv) {
    setLoadingMsgs(true)
    setMessages([])
    const supabase = createSupabaseBrowserClient()
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('id, direction, message_text, created_at, zapi_message_id')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
    setMessages((data as Msg[]) || [])
    setLoadingMsgs(false)
  }

  async function handleSelect(conv: Conv) {
    setSelected(conv)
    await loadMessages(conv)
  }

  async function handleRefresh() {
    if (!selected) return
    setRefreshing(true)
    await loadMessages(selected)
    setRefreshing(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/whatsapp/conversation/${selected.id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Erro ao apagar conversa.')
        setDeleting(false)
        return
      }
      setConfirmDelete(false)
      setSelected(null)
      setMessages([])
      router.refresh()
    } catch {
      alert('Erro de conexão ao apagar conversa.')
    } finally {
      setDeleting(false)
    }
  }

  // Scroll to bottom when messages load
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [messages])

  const convName = (conv: Conv) =>
    (conv.candidates as { full_name?: string } | null)?.full_name || formatPhone(conv.phone)

  // ── Group messages by date for dividers ──────────────────────────────────────
  type MsgOrDivider = { type: 'msg'; msg: Msg } | { type: 'divider'; label: string }
  const grouped: MsgOrDivider[] = []
  let lastDate = ''
  for (const msg of messages) {
    const label = dateLabel(msg.created_at)
    if (label !== lastDate) {
      grouped.push({ type: 'divider', label })
      lastDate = label
    }
    grouped.push({ type: 'msg', msg })
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Left panel: conversation list ───────────────────────────────────── */}
      <div className={`flex flex-col border-r bg-white w-full md:w-80 lg:w-96 shrink-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-4 border-b space-y-3">
          <div>
            <h1 className="text-lg font-bold">Mensagens WhatsApp</h1>
            <p className="text-xs text-muted-foreground">{conversations.length} conversa{conversations.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            filtered.map(conv => {
              const isSelected = selected?.id === conv.id
              const expired = isExpired(conv)
              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelect(conv)}
                  title="Clique para ver a conversa"
                  className={`group w-full text-left px-4 py-3 border-b cursor-pointer hover:bg-primary/5 active:bg-primary/10 transition-colors flex items-center gap-3 ${isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : ''}`}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-primary font-semibold text-sm">
                    {convName(conv).charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium truncate">{convName(conv)}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(conv.updated_at).split(', ')[1]?.slice(0,5) || ''}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{formatPhone(conv.phone)}</p>
                    <Badge
                      variant={expired ? 'secondary' : 'default'}
                      className={`text-[10px] h-4 px-1.5 mt-0.5 ${expired ? 'bg-gray-200 text-gray-700' : ''}`}
                    >
                      {expired ? 'Encerrada (>24h)' : conv.current_step === 'chatting' ? 'Em conversa' : conv.current_step}
                    </Badge>
                  </div>
                  {/* Chevron — makes it clear the row opens a detail view */}
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary shrink-0" />
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right panel: chat view ───────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col bg-[#f0f2f5] ${selected ? 'flex' : 'hidden md:flex'}`}>

        {!selected ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <MessageSquare className="w-12 h-12 opacity-20" />
            <p className="text-sm">Selecione uma conversa para ver as mensagens</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
              <button
                onClick={() => setSelected(null)}
                className="md:hidden p-1.5 rounded hover:bg-muted"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                {convName(selected).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{convName(selected)}</p>
                <p className="text-xs text-muted-foreground">{formatPhone(selected.phone)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selected.candidate_id && (
                  <Link href={`/admin/candidatos/${selected.candidate_id}`}>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                      <ExternalLink className="w-3 h-3" />
                      Perfil
                    </Button>
                  </Link>
                )}
                <Button
                  size="sm" variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Atualizar mensagens"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleting}
                  title="Excluir conversa"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Delete confirmation modal */}
            {confirmDelete && (
              <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !deleting && setConfirmDelete(false)}>
                <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                      <Trash2 className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">Excluir conversa?</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Esta ação não pode ser desfeita. Todas as mensagens trocadas com <strong>{convName(selected)}</strong> ({formatPhone(selected.phone)}) serão apagadas do sistema.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      {deleting ? 'Excluindo…' : 'Sim, excluir'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {loadingMsgs ? (
                <div className="flex justify-center py-12">
                  <svg className="animate-spin w-6 h-6 text-muted-foreground" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                </div>
              ) : grouped.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nenhuma mensagem nesta conversa
                </div>
              ) : (
                grouped.map((item, i) => {
                  if (item.type === 'divider') {
                    return (
                      <div key={`d-${i}`} className="flex justify-center py-2">
                        <span className="text-xs bg-white/80 text-muted-foreground px-3 py-1 rounded-full shadow-sm">
                          {item.label}
                        </span>
                      </div>
                    )
                  }

                  const msg = item.msg
                  const isOut = msg.direction === 'outbound'

                  return (
                    <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-1`}>
                      <div
                        className={`max-w-[75%] px-3 py-2 rounded-2xl shadow-sm text-sm leading-relaxed relative ${
                          isOut
                            ? 'bg-[#d9fdd3] rounded-tr-sm text-gray-800'
                            : 'bg-white rounded-tl-sm text-gray-800'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.message_text}</p>
                        <p className={`text-[10px] mt-1 text-right ${isOut ? 'text-green-700/60' : 'text-muted-foreground'}`}>
                          {timeOnly(msg.created_at)}
                          {isOut && msg.zapi_message_id && ' ✓✓'}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Footer note */}
            <div className="bg-white border-t px-4 py-2.5 shrink-0">
              <p className="text-xs text-center text-muted-foreground">
                {isExpired(selected)
                  ? 'Conversa encerrada (sem atividade há mais de 24h). Uma nova mensagem do candidato reinicia o atendimento.'
                  : 'O assistente virtual responde automaticamente, orientando o candidato a preencher o currículo na plataforma.'}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
