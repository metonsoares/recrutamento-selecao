'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useRouter } from 'next/navigation'
import { Loader2, Send, Paperclip, X, FileText, ImageIcon } from 'lucide-react'
import { formatDateTime } from '@/lib/helpers'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import {
  ACCEPT_ANEXOS, MAX_ANEXO_BYTES, tamanhoLegivel, type AnexoNota,
} from '@/lib/notas-anexos'

interface Note {
  id: string
  note: string
  created_at: string
  attachments?: AnexoNota[] | null
}

function IconeDoAnexo({ type }: { type: string }) {
  const Icone = type.startsWith('image/') ? ImageIcon : FileText
  return <Icone className="w-3.5 h-3.5 shrink-0" />
}

export function CandidateNotesEditor({
  candidateId,
  applicationId,
  initialNotes,
}: {
  candidateId: string
  applicationId?: string
  initialNotes: Note[]
}) {
  const router = useRouter()
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [anexos, setAnexos] = useState<AnexoNota[]>([])
  const [enviando, setEnviando] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // O arquivo sobe assim que é escolhido: na hora de salvar a observação só vai
  // a ficha dele. Assim um anexo grande não trava o botão Salvar, e o erro de
  // tamanho aparece no momento em que a pessoa escolhe o arquivo.
  //
  // São dois passos de propósito: a API autoriza (devolve onde gravar e um
  // token) e o arquivo vai DIRETO para o Storage. Mandar o arquivo pela API
  // não funcionaria — a Vercel recusa corpo acima de ~4,5 MB, abaixo dos 5 MB
  // que o limite promete.
  async function handleEscolherArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const escolhidos = Array.from(e.target.files ?? [])
    e.target.value = '' // permite reanexar o mesmo arquivo depois de remover
    if (escolhidos.length === 0) return
    setErro(null)

    for (const file of escolhidos) {
      if (file.size > MAX_ANEXO_BYTES) {
        setErro(`"${file.name}" tem ${tamanhoLegivel(file.size)} — o limite é 5 MB por arquivo.`)
        continue
      }
      setEnviando(n => n + 1)
      try {
        const res = await fetch(`/api/admin/candidatos/${candidateId}/notes/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok || !d.token) {
          setErro(d.error || `Não foi possível anexar "${file.name}".`)
          continue
        }

        const supabase = createSupabaseBrowserClient()
        const { error } = await supabase.storage
          .from(d.bucket as string)
          .uploadToSignedUrl(d.path as string, d.token as string, file, { contentType: file.type })

        if (error) {
          setErro(`Não foi possível enviar "${file.name}". Tente de novo.`)
          continue
        }
        setAnexos(prev => [...prev, d.anexo as AnexoNota])
      } catch {
        setErro(`Não foi possível anexar "${file.name}". Verifique a conexão.`)
      } finally {
        setEnviando(n => n - 1)
      }
    }
  }

  // Tira da lista E do bucket — anexo descartado não fica ocupando espaço.
  async function removerAnexo(path: string) {
    setAnexos(prev => prev.filter(a => a.path !== path))
    await fetch(`/api/admin/candidatos/${candidateId}/notes/upload`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }).catch(() => {})
  }

  async function handleSave() {
    if (!text.trim() && anexos.length === 0) return
    setSaving(true)
    setErro(null)
    // Pela API: o insert direto dependia da policy aberta de `admin_notes`,
    // que deixava qualquer conta logada anotar na ficha de qualquer pessoa.
    const res = await fetch(`/api/admin/candidatos/${candidateId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: text.trim(),
        applicationId: applicationId || null,
        attachments: anexos,
      }),
    })
    const d = await res.json().catch(() => ({}))

    if (res.ok && d.nota) {
      setNotes(prev => [d.nota as Note, ...prev])
      setText('')
      setAnexos([])
    } else {
      setErro(d.error || 'Não foi possível salvar a observação.')
    }
    setSaving(false)
    router.refresh()
  }

  const ocupado = saving || enviando > 0
  const vazio = !text.trim() && anexos.length === 0

  return (
    <div className="space-y-4">
      {/* Editor */}
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Digite uma observação interna sobre este candidato..."
          rows={3}
          className="text-sm resize-none"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave()
          }}
        />

        {/* Anexos ainda não salvos */}
        {(anexos.length > 0 || enviando > 0) && (
          <div className="flex flex-wrap gap-2">
            {anexos.map(a => (
              <span
                key={a.path}
                className="inline-flex items-center gap-1.5 max-w-full bg-gray-100 border border-gray-200 rounded-lg pl-2 pr-1 py-1 text-xs text-gray-700"
              >
                <IconeDoAnexo type={a.type} />
                <span className="truncate max-w-[12rem] sm:max-w-[16rem]">{a.name}</span>
                <span className="text-muted-foreground shrink-0">{tamanhoLegivel(a.size)}</span>
                <button
                  type="button"
                  onClick={() => removerAnexo(a.path)}
                  aria-label={`Remover ${a.name}`}
                  className="shrink-0 p-1 rounded hover:bg-gray-200 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {enviando > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Enviando {enviando} arquivo{enviando > 1 ? 's' : ''}...
              </span>
            )}
          </div>
        )}

        {erro && <p className="text-xs text-red-600">{erro}</p>}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ANEXOS}
          onChange={handleEscolherArquivos}
          className="hidden"
        />

        {/* Celular: os botões empilham e ocupam a largura; a dica do atalho some. */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="hidden sm:block text-xs text-muted-foreground">Ctrl+Enter para salvar rápido</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={ocupado}
              className="w-full sm:w-auto"
            >
              <Paperclip className="w-3.5 h-3.5 mr-1.5" />
              Anexar arquivo
            </Button>
            <Button size="sm" onClick={handleSave} disabled={ocupado || vazio} className="w-full sm:w-auto">
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Salvando...</>
                : <><Send className="w-3.5 h-3.5 mr-1.5" />Salvar Observação</>
              }
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          PDF, imagem, Word ou Excel — até 5 MB por arquivo.
        </p>
      </div>

      {/* Notes list */}
      <div className="space-y-2">
        {notes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma observação registrada.</p>
        )}
        {notes.map(n => (
          <div key={n.id} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
            {n.note && <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.note}</p>}
            {(n.attachments ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {(n.attachments ?? []).map(a => (
                  <a
                    key={a.path}
                    href={`/api/admin/candidatos/${candidateId}/notes/anexo?path=${encodeURIComponent(a.path)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 max-w-full bg-white border border-amber-200 rounded-lg px-2 py-1 text-xs text-gray-700 hover:border-amber-300 hover:bg-amber-50/60 transition-colors"
                  >
                    <IconeDoAnexo type={a.type} />
                    <span className="truncate max-w-[12rem] sm:max-w-[18rem]">{a.name}</span>
                    <span className="text-muted-foreground shrink-0">{tamanhoLegivel(a.size)}</span>
                  </a>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">{formatDateTime(n.created_at)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
