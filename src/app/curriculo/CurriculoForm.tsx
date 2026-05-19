'use client'
import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { FormQuestion, FormSection } from '@/types'
import { CheckCircle2, AlertCircle, Paperclip, X, Image, FileText, PartyPopper } from 'lucide-react'

interface Props {
  jobs: { id: string; title: string }[]
  questions: FormQuestion[]
  sections: FormSection[]
  companyInfo: { mission: string | null; company_culture: string | null } | null
}

// ─── Masks ────────────────────────────────────────────────────────────────────

function maskCelular(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `${d.slice(0, 2)} ${d.slice(2)}`
  return `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`
}

function maskCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function maskCEP(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`
}

function validateCPF(cpf: string) {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i)
  let r1 = (s * 10) % 11; if (r1 >= 10) r1 = 0
  if (r1 !== +d[9]) return false
  s = 0
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i)
  let r2 = (s * 10) % 11; if (r2 >= 10) r2 = 0
  return r2 === +d[10]
}

// ─── Address ──────────────────────────────────────────────────────────────────

interface AddrFields { cep: string; street: string; number: string; neighborhood: string; city: string; status: 'idle' | 'checking' | 'valid' | 'invalid' }
const emptyAddr = (): AddrFields => ({ cep: '', street: '', number: '', neighborhood: '', city: '', status: 'idle' })

// ─── File info ────────────────────────────────────────────────────────────────

interface FileInfo { file: File; error: string | null; compressing?: boolean }

const MAX_FILE_BYTES = 2 * 1024 * 1024

/** Accepts any image/* type (JPEG, PNG, HEIC, WebP…) plus PDF */
function isImageFile(file: File) {
  if (file.type.startsWith('image/')) return true
  // Some mobile browsers return empty MIME type for camera photos — infer from extension
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'bmp'].includes(ext)
}

function validateFile(file: File): string | null {
  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isImage = isImageFile(file)
  if (!isPDF && !isImage) return 'Apenas PDF ou imagem (JPG, PNG) são permitidos.'
  // Images are compressed automatically — only PDFs are hard-limited
  if (isPDF && file.size > MAX_FILE_BYTES) return 'PDF muito grande. Máximo 2 MB.'
  return null
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Wraps compressImage with a timeout so it never hangs indefinitely
 * on mobile browsers that can't decode certain image formats (e.g. HEIC on Android).
 */
async function compressImageSafe(file: File, maxBytes = MAX_FILE_BYTES): Promise<File> {
  return Promise.race([
    compressImage(file, maxBytes),
    new Promise<File>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 8000)
    ),
  ])
}

/** Compress an image File to JPEG, targeting under maxBytes. */
async function compressImage(file: File, maxBytes = MAX_FILE_BYTES): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = document.createElement('img')
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')

      // Start at original dimensions; scale down if needed
      let { naturalWidth: w, naturalHeight: h } = img

      // Max dimension cap to keep file size manageable
      const MAX_DIM = 1920
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }

      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)

      // Try decreasing quality until under maxBytes
      const qualities = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]
      let idx = 0

      function tryQuality() {
        const q = qualities[idx] ?? 0.3
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('Canvas toBlob falhou')); return }

          if (blob.size <= maxBytes || idx >= qualities.length - 1) {
            // If still too large, scale dimensions down 20% and retry once
            if (blob.size > maxBytes && (w > 200 || h > 200)) {
              w = Math.round(w * 0.75)
              h = Math.round(h * 0.75)
              canvas.width = w
              canvas.height = h
              ctx.drawImage(img, 0, 0, w, h)
              idx = 0
              tryQuality()
              return
            }
            const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
            resolve(new File([blob], name, { type: 'image/jpeg' }))
          } else {
            idx++
            tryQuality()
          }
        }, 'image/jpeg', q)
      }

      tryQuality()
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Erro ao carregar imagem')) }
    img.src = url
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CurriculoForm({ jobs, questions, sections, companyInfo }: Props) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [cepStatuses, setCepStatuses] = useState<Record<string, 'idle' | 'checking' | 'valid' | 'invalid'>>({})
  const [cpfErrors, setCpfErrors] = useState<Record<string, boolean>>({})
  const [addrValues, setAddrValues] = useState<Record<string, AddrFields>>({})
  const [fileInfos, setFileInfos] = useState<Record<string, FileInfo | null>>({})
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({}) // 0-100, -1 = done
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [lgpd, setLgpd] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const setAnswer = (id: string, v: string | string[]) =>
    setAnswers(p => ({ ...p, [id]: v }))

  const toggleMulti = (id: string, opt: string) =>
    setAnswers(p => {
      const cur = (p[id] as string[]) || []
      return { ...p, [id]: cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt] }
    })

  async function lookupCEP(id: string, masked: string) {
    const digits = masked.replace(/\D/g, '')
    if (digits.length < 8) { setCepStatuses(p => ({ ...p, [id]: 'idle' })); return }
    setCepStatuses(p => ({ ...p, [id]: 'checking' }))
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      setCepStatuses(p => ({ ...p, [id]: data.erro ? 'invalid' : 'valid' }))
    } catch { setCepStatuses(p => ({ ...p, [id]: 'invalid' })) }
  }

  function getAddr(id: string) { return addrValues[id] || emptyAddr() }
  function setAddrField(id: string, field: keyof AddrFields, val: string) {
    setAddrValues(p => ({ ...p, [id]: { ...(p[id] || emptyAddr()), [field]: val } }))
  }

  async function handleAddrCEP(id: string, raw: string) {
    const masked = maskCEP(raw)
    setAddrValues(p => ({ ...p, [id]: { ...(p[id] || emptyAddr()), cep: masked, status: 'idle' } }))
    const digits = masked.replace(/\D/g, '')
    if (digits.length < 8) return
    setAddrValues(p => ({ ...p, [id]: { ...(p[id] || emptyAddr()), cep: masked, status: 'checking' } }))
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) {
        setAddrValues(p => ({ ...p, [id]: { ...(p[id] || emptyAddr()), cep: masked, status: 'invalid' } }))
      } else {
        setAddrValues(p => ({
          ...p,
          [id]: { ...(p[id] || emptyAddr()), cep: masked, status: 'valid', number: '', street: data.logradouro || '', neighborhood: data.bairro || '', city: data.localidade || '' },
        }))
      }
    } catch {
      setAddrValues(p => ({ ...p, [id]: { ...(p[id] || emptyAddr()), cep: masked, status: 'invalid' } }))
    }
  }

  async function handleFileSelect(id: string, file: File) {
    const err = validateFile(file)
    if (err) {
      setFileInfos(p => ({ ...p, [id]: { file, error: err, compressing: false } }))
      return
    }

    // ✅ Store the file immediately — the user can see the preview and submit right away
    setFileInfos(p => ({ ...p, [id]: { file, error: null, compressing: false } }))

    // Large images: try to compress in the background (non-blocking)
    // If compression fails or times out we simply keep the original — never block the user.
    if (isImageFile(file) && file.size > MAX_FILE_BYTES) {
      setFileInfos(p => ({ ...p, [id]: { file, error: null, compressing: true } }))
      try {
        const compressed = await compressImageSafe(file)
        setFileInfos(p => ({ ...p, [id]: { file: compressed, error: null, compressing: false } }))
      } catch {
        // Compression failed or timed out — keep the original, never block the user
        setFileInfos(p => ({ ...p, [id]: { file, error: null, compressing: false } }))
      }
    }
  }

  function clearFile(id: string) {
    setFileInfos(p => ({ ...p, [id]: null }))
    setUploadProgress(p => { const n = { ...p }; delete n[id]; return n })
    if (fileRefs.current[id]) fileRefs.current[id]!.value = ''
  }

  /** Upload using XHR so we can track progress per question id. */
  function uploadFileWithProgress(id: string, file: File): Promise<{ url: string }> {
    return new Promise((resolve, reject) => {
      const fd = new FormData()
      fd.append('file', file)

      const xhr = new XMLHttpRequest()

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          setUploadProgress(p => ({ ...p, [id]: pct }))
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText)
          if (data.error) { reject(new Error(data.error)); return }
          setUploadProgress(p => ({ ...p, [id]: 100 }))
          resolve(data)
        } else {
          try {
            const data = JSON.parse(xhr.responseText)
            reject(new Error(data.error || 'Erro ao enviar arquivo.'))
          } catch {
            reject(new Error('Erro ao enviar arquivo.'))
          }
        }
      }

      xhr.onerror = () => reject(new Error('Falha na conexão ao enviar arquivo.'))

      xhr.open('POST', '/api/public/upload-file')
      xhr.send(fd)
    })
  }

  // ─── Group questions by section ───────────────────────────────────────────

  const sortedSections = [...sections].sort((a, b) => a.sort_order - b.sort_order)
  const usedIds = new Set<string>()

  const sectionGroups = sortedSections
    .map(section => {
      const key = section.category || section.id
      const qs = [...questions].filter(q => q.category === key).sort((a, b) => a.sort_order - b.sort_order)
      qs.forEach(q => usedIds.add(q.id))
      return { section, qs }
    })
    .filter(g => g.qs.length > 0)

  // ─── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validate CPF
    const badCPF = questions.find(q => q.field_type === 'cpf' && cpfErrors[q.id])
    if (badCPF) { setError('CPF inválido. Verifique o campo e tente novamente.'); return }

    // Validate files
    for (const q of questions.filter(q => q.field_type === 'file_upload')) {
      const fi = fileInfos[q.id]
      if (fi?.error) { setError(fi.error); return }
      if (q.is_required && !fi?.file) { setError(`O campo "${q.question_text}" é obrigatório.`); return }
    }

    if (!lgpd) { setError('Você precisa aceitar os termos de uso de dados para continuar.'); return }

    setError(null)
    setSubmitting(true)

    // Build final answers
    const finalAnswers: Record<string, string | string[]> = { ...answers }

    // Serialize address fields
    for (const q of questions.filter(q => q.field_type === 'address')) {
      const addr = addrValues[q.id] || emptyAddr()
      if (q.is_required && (!addr.cep || !addr.number || !addr.city)) {
        setError('Preencha todos os campos do endereço (CEP, Número e Cidade).')
        setSubmitting(false); return
      }
      if (addr.status === 'invalid') {
        setError('CEP inválido no campo de endereço.'); setSubmitting(false); return
      }
      finalAnswers[q.id] = [addr.street, addr.number, addr.neighborhood, addr.city, addr.cep]
        .filter(Boolean).join(' - ')
    }

    // Upload files (with progress tracking via XHR)
    for (const q of questions.filter(q => q.field_type === 'file_upload')) {
      const fi = fileInfos[q.id]
      if (!fi?.file) continue
      setUploadProgress(p => ({ ...p, [q.id]: 0 }))
      try {
        const data = await uploadFileWithProgress(q.id, fi.file)
        finalAnswers[q.id] = data.url
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao enviar arquivo.')
        setUploadProgress(p => { const n = { ...p }; delete n[q.id]; return n })
        setSubmitting(false)
        return
      }
    }

    // Auto-detect candidate identity from dynamic answers
    let full_name = ''
    let phone = ''
    let city = ''
    let email = ''

    for (const q of questions) {
      const val = (finalAnswers[q.id] as string) || ''
      if (!full_name && q.field_type === 'short_text' && /nome/i.test(q.question_text) && val)
        full_name = val
      if (!phone && q.field_type === 'celular' && val)
        phone = val
      if (!email && q.field_type === 'email' && val)
        email = val
      if (!city && q.field_type === 'address' && addrValues[q.id]?.city)
        city = addrValues[q.id].city
      if (!city && /cidade/i.test(q.question_text) && q.field_type === 'short_text' && val)
        city = val
    }

    // Fallbacks
    if (!full_name) {
      const first = questions.find(q => q.field_type === 'short_text' && finalAnswers[q.id])
      if (first) full_name = (finalAnswers[first.id] as string) || ''
    }

    try {
      const res = await fetch('/api/public/curriculo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: full_name || 'Não informado',
          phone: phone || 'Não informado',
          city: city || 'Não informado',
          email: email || undefined,
          lgpd_accepted: true,
          answers: finalAnswers,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Ocorreu um erro. Tente novamente.')
        setSubmitting(false); return
      }
      // Show success popup on the same page
      setSuccess(true)
      setSubmitting(false)
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
      setSubmitting(false)
    }
  }

  // ─── Field renderer ───────────────────────────────────────────────────────

  function renderField(q: FormQuestion) {
    const sel = 'w-full border border-input rounded-lg px-3 py-2 h-11 text-base bg-background focus:outline-none focus:ring-2 focus:ring-primary/30'

    switch (q.field_type) {

      case 'celular':
        return <Input id={q.id} type="tel" inputMode="numeric" placeholder="24 99999-9999" maxLength={14} required={q.is_required} className="h-11 text-base" value={(answers[q.id] as string) || ''} onChange={e => setAnswer(q.id, maskCelular(e.target.value))} />

      case 'cpf': {
        const val = (answers[q.id] as string) || ''
        const err = cpfErrors[q.id]
        return (
          <div className="space-y-1">
            <div className="relative">
              <Input id={q.id} type="text" inputMode="numeric" placeholder="000.000.000-00" maxLength={14} required={q.is_required} className={`h-11 text-base pr-9 ${err ? 'border-red-400' : ''}`} value={val}
                onChange={e => { const m = maskCPF(e.target.value); setAnswer(q.id, m); if (m.replace(/\D/g, '').length === 11) setCpfErrors(p => ({ ...p, [q.id]: !validateCPF(m) })) }}
              />
              {val.replace(/\D/g, '').length === 11 && <div className="absolute right-3 top-1/2 -translate-y-1/2">{err ? <AlertCircle className="w-4 h-4 text-red-500" /> : <CheckCircle2 className="w-4 h-4 text-green-500" />}</div>}
            </div>
            {err && <p className="text-xs text-red-500">CPF inválido.</p>}
          </div>
        )
      }

      case 'cep': {
        const val = (answers[q.id] as string) || ''
        const st = cepStatuses[q.id] || 'idle'
        return (
          <div className="space-y-1">
            <div className="relative">
              <Input id={q.id} type="text" inputMode="numeric" placeholder="25000-000" maxLength={9} required={q.is_required} className={`h-11 text-base pr-9 ${st === 'invalid' ? 'border-red-400' : ''}`} value={val}
                onChange={e => { const m = maskCEP(e.target.value); setAnswer(q.id, m); lookupCEP(q.id, m) }}
              />
              {st === 'checking' && <div className="absolute right-3 top-1/2 -translate-y-1/2"><svg className="animate-spin w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg></div>}
              {st === 'valid' && <div className="absolute right-3 top-1/2 -translate-y-1/2"><CheckCircle2 className="w-4 h-4 text-green-500" /></div>}
              {st === 'invalid' && <div className="absolute right-3 top-1/2 -translate-y-1/2"><AlertCircle className="w-4 h-4 text-red-500" /></div>}
            </div>
            {st === 'invalid' && <p className="text-xs text-red-500">CEP não encontrado.</p>}
          </div>
        )
      }

      case 'address': {
        const addr = getAddr(q.id)
        const ok = addr.status === 'valid'
        const err = addr.status === 'invalid'
        const checking = addr.status === 'checking'
        return (
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            {/* CEP */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">CEP <span className="text-red-500">*</span></label>
              <div className="relative">
                <Input type="text" inputMode="numeric" placeholder="25000-000" maxLength={9} required={q.is_required} className={`h-11 text-base pr-9 bg-white ${err ? 'border-red-400' : ''}`} value={addr.cep} onChange={e => handleAddrCEP(q.id, e.target.value)} />
                {checking && <div className="absolute right-3 top-1/2 -translate-y-1/2"><svg className="animate-spin w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg></div>}
                {ok && <div className="absolute right-3 top-1/2 -translate-y-1/2"><CheckCircle2 className="w-4 h-4 text-green-500" /></div>}
                {err && <div className="absolute right-3 top-1/2 -translate-y-1/2"><AlertCircle className="w-4 h-4 text-red-500" /></div>}
              </div>
              {err && <p className="text-xs text-red-500">CEP não encontrado.</p>}
            </div>
            {/* Endereço */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Endereço <span className="text-red-500">*</span></label>
              <Input type="text" placeholder="Rua, Avenida, Travessa…" required={q.is_required} readOnly={ok && !!addr.street} className={`h-11 text-base bg-white ${ok && addr.street ? 'text-gray-400' : ''}`} value={addr.street} onChange={e => setAddrField(q.id, 'street', e.target.value)} />
            </div>
            {/* Número + Bairro */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Número <span className="text-red-500">*</span></label>
                <Input type="text" inputMode="numeric" placeholder="Digite o número" required={q.is_required} className="h-11 text-base bg-white" value={addr.number} onChange={e => setAddrField(q.id, 'number', e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Bairro</label>
                <Input type="text" placeholder="Bairro" readOnly={ok && !!addr.neighborhood} className={`h-11 text-base bg-white ${ok && addr.neighborhood ? 'text-gray-400' : ''}`} value={addr.neighborhood} onChange={e => setAddrField(q.id, 'neighborhood', e.target.value)} />
              </div>
            </div>
            {/* Cidade */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Cidade <span className="text-red-500">*</span></label>
              <Input type="text" placeholder="Cidade" required={q.is_required} readOnly={ok && !!addr.city} className={`h-11 text-base bg-white ${ok && addr.city ? 'text-gray-400' : ''}`} value={addr.city} onChange={e => setAddrField(q.id, 'city', e.target.value)} />
            </div>
          </div>
        )
      }

      case 'file_upload': {
        const fi = fileInfos[q.id]
        const isPDF = fi?.file?.type === 'application/pdf'
        return (
          <div className="space-y-2">
            {/* Hidden file input */}
            <input
              ref={el => { fileRefs.current[q.id] = el }}
              type="file"
              accept="image/*,application/pdf,.pdf,.heic,.heif"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(q.id, f) }}
            />

            {!fi ? (
              /* Upload button */
              <button
                type="button"
                onClick={() => fileRefs.current[q.id]?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl p-6 text-sm text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all cursor-pointer"
              >
                <Paperclip className="w-6 h-6 opacity-50" />
                <span className="font-medium">Toque para selecionar arquivo</span>
                <span className="text-xs">PDF ou foto (JPG, PNG e outros)</span>
                <span className="text-xs text-muted-foreground/70">📷 Tire uma foto ou escolha da galeria</span>
              </button>
            ) : fi.compressing ? (
              /* Compressing state — file is already stored; compression is just optimization */
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-800">✅ Arquivo recebido!</p>
                    <p className="text-xs text-green-700 truncate">{fi.file.name}</p>
                  </div>
                  <button type="button" onClick={() => clearFile(q.id)} className="p-1 text-muted-foreground hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-blue-600">
                  <svg className="animate-spin w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Otimizando imagem em segundo plano…
                </div>
              </div>
            ) : (
              /* File preview */
              (() => {
                const pct = uploadProgress[q.id]
                const isUploading = pct !== undefined && pct < 100
                const uploadDone = pct === 100
                return (
                  <div className={`rounded-xl border p-3 space-y-2 ${fi.error ? 'border-red-300 bg-red-50' : isUploading || uploadDone ? 'border-blue-200 bg-blue-50' : 'border-green-200 bg-green-50'}`}>
                    {/* Confirmation banner */}
                    {!fi.error && !isUploading && !uploadDone && (
                      <div className="flex items-center gap-1.5 text-green-700 text-xs font-semibold mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Arquivo confirmado — pronto para envio!
                      </div>
                    )}
                    {/* Top row: icon + name + actions */}
                    <div className="flex items-center gap-3">
                      <div className="shrink-0">
                        {isPDF
                          ? <FileText className={`w-8 h-8 ${fi.error ? 'text-red-400' : isUploading || uploadDone ? 'text-blue-500' : 'text-green-600'}`} />
                          : <Image className={`w-8 h-8 ${fi.error ? 'text-red-400' : isUploading || uploadDone ? 'text-blue-500' : 'text-green-600'}`} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{fi.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {isUploading ? `Enviando… ${pct}%` : uploadDone ? 'Enviado ✓' : formatBytes(fi.file.size)}
                        </p>
                        {fi.error && <p className="text-xs text-red-600 mt-0.5">{fi.error}</p>}
                      </div>
                      {!isUploading && !uploadDone && (
                        <div className="flex gap-1 shrink-0">
                          <button type="button" onClick={() => fileRefs.current[q.id]?.click()} className="text-xs text-primary hover:underline px-2 py-1">Trocar</button>
                          <button type="button" onClick={() => clearFile(q.id)} className="p-1 text-muted-foreground hover:text-red-500">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Progress bar */}
                    {(isUploading || uploadDone) && (
                      <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full transition-all duration-200"
                          style={{
                            width: `${pct}%`,
                            background: uploadDone ? '#22c55e' : '#3b82f6',
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              })()
            )}
          </div>
        )
      }

      case 'long_text':
        return <Textarea id={q.id} placeholder="Escreva sua resposta aqui..." rows={4} required={q.is_required} className="resize-none text-base" value={(answers[q.id] as string) || ''} onChange={e => setAnswer(q.id, e.target.value)} />

      case 'yes_no':
        return (
          <div className="flex gap-4">
            {['Sim', 'Não'].map(opt => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name={q.id} value={opt} checked={answers[q.id] === opt} onChange={() => setAnswer(q.id, opt)} required={q.is_required && !answers[q.id]} className="accent-primary w-4 h-4" />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        )

      case 'select':
        return (
          <select id={q.id} className={sel} required={q.is_required} value={(answers[q.id] as string) || ''} onChange={e => setAnswer(q.id, e.target.value)}>
            <option value="">Selecionar...</option>
            {(q.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )

      case 'job_select':
        return (
          <select id={q.id} className={sel} required={q.is_required} value={(answers[q.id] as string) || ''} onChange={e => setAnswer(q.id, e.target.value)}>
            <option value="">Selecionar vaga…</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        )

      case 'multiple_choice':
        return (
          <div className="space-y-2">
            {(q.options || []).map(opt => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={((answers[q.id] as string[]) || []).includes(opt)} onChange={() => toggleMulti(q.id, opt)} className="accent-primary w-4 h-4" />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        )

      case 'number':
        return <Input id={q.id} type="number" placeholder="0" required={q.is_required} className="h-11 text-base" value={(answers[q.id] as string) || ''} onChange={e => setAnswer(q.id, e.target.value)} />

      case 'date':
        return <Input id={q.id} type="date" required={q.is_required} className="h-11 text-base" value={(answers[q.id] as string) || ''} onChange={e => setAnswer(q.id, e.target.value)} />

      case 'scale': {
        const cur = answers[q.id] as string
        return (
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => setAnswer(q.id, String(n))}
                className={`w-11 h-11 rounded-lg border text-sm font-semibold transition-all ${cur === String(n) ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:border-primary/50'}`}
              >{n}</button>
            ))}
          </div>
        )
      }

      case 'email':
        return <Input id={q.id} type="email" inputMode="email" placeholder="seu@email.com" autoComplete="email" required={q.is_required} className="h-11 text-base" value={(answers[q.id] as string) || ''} onChange={e => setAnswer(q.id, e.target.value)} />

      default:
        return <Input id={q.id} type="text" placeholder="Sua resposta..." required={q.is_required} className="h-11 text-base" value={(answers[q.id] as string) || ''} onChange={e => setAnswer(q.id, e.target.value)} />
    }
  }

  function renderQuestions(qs: FormQuestion[]) {
    return qs.map(q => (
      <div key={q.id} className="space-y-1.5">
        <Label htmlFor={q.id} className="text-sm font-medium">
          {q.question_text}
          {q.is_required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        {q.description && <p className="text-xs text-muted-foreground">{q.description}</p>}
        {renderField(q)}
      </div>
    ))
  }

  // ─── Success overlay ──────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-3xl border border-green-100 shadow-xl p-8 max-w-sm w-full text-center space-y-5 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-11 h-11 text-green-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-900">Currículo enviado com sucesso! 🎉</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Recebemos seu currículo com sucesso! Nossa equipe de RH vai analisar seu perfil e entrará em contato em breve. 😊
            </p>
          </div>
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            <PartyPopper className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
            Boa sorte no processo seletivo!
          </div>
          <button
            type="button"
            onClick={() => {
              setSuccess(false)
              setAnswers({})
              setAddrValues({})
              setFileInfos({})
              setUploadProgress({})
              setLgpd(false)
              setError(null)
            }}
            className="text-sm text-muted-foreground hover:text-gray-700 underline underline-offset-2"
          >
            Enviar outro currículo
          </button>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 py-6 sm:py-8 px-4">
      <div className="max-w-xl mx-auto space-y-4 sm:space-y-5">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Cadastre seu Currículo</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Sections */}
          {sectionGroups.map(({ section, qs }) => (
            <div key={section.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 space-y-4 sm:space-y-5">
              <div>
                <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">{section.name}</h2>
                {section.description && <p className="text-sm text-muted-foreground mt-0.5">{section.description}</p>}
              </div>
              {renderQuestions(qs)}
            </div>
          ))}

          {/* LGPD */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={lgpd} onChange={e => setLgpd(e.target.checked)} className="accent-primary w-4 h-4 mt-0.5 flex-shrink-0" required />
              <span className="text-sm text-muted-foreground leading-relaxed">
                Li e aceito que meus dados sejam utilizados para fins de recrutamento pela{' '}
                <strong className="text-gray-700">Brownie do Ton</strong>.
              </span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          {/* Submit */}
          <Button type="submit" className="w-full h-12 text-base font-semibold rounded-xl" disabled={submitting || !lgpd}>
            {submitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Enviando...
              </span>
            ) : 'Enviar Currículo'}
          </Button>

          <p className="text-center text-xs text-muted-foreground pb-4">
            Seus dados são protegidos e utilizados apenas para fins de recrutamento.
          </p>
        </form>
      </div>
    </div>
  )
}
