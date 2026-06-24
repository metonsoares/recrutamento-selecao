'use client'
import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { FormQuestion, FormSection, CultureQuestion } from '@/types'
import { CheckCircle2, AlertCircle, Paperclip, X, Image, FileText, PartyPopper, ChevronRight } from 'lucide-react'

interface Props {
  jobs: { id: string; title: string }[]
  questions: FormQuestion[]
  sections: FormSection[]
  companyInfo: { mission: string | null; company_culture: string | null } | null
  cultureQuestions: CultureQuestion[]
  logoUrl?: string | null
  companyName?: string | null
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

interface FileInfo {
  file: File
  error: string | null
  compressing?: boolean
  uploading?: boolean
  uploadPct?: number
  uploadedUrl?: string
}

const MAX_FILE_BYTES = 5 * 1024 * 1024

function isImageFile(file: File) {
  if (file.type.startsWith('image/')) return true
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'bmp'].includes(ext)
}

function validateFile(file: File): string | null {
  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isImage = isImageFile(file)
  if (!isPDF && !isImage) return 'Apenas PDF ou imagem (JPG, PNG e outros) são permitidos.'
  if (file.size > MAX_FILE_BYTES) return 'Arquivo muito grande. Máximo 5 MB.'
  return null
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

async function compressImageSafe(file: File, maxBytes = MAX_FILE_BYTES): Promise<File> {
  return Promise.race([
    compressImage(file, maxBytes),
    new Promise<File>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 8000)
    ),
  ])
}

async function compressImage(file: File, maxBytes = MAX_FILE_BYTES): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = document.createElement('img')
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { naturalWidth: w, naturalHeight: h } = img
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
      const qualities = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]
      let idx = 0
      function tryQuality() {
        const q = qualities[idx] ?? 0.3
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('Canvas toBlob falhou')); return }
          if (blob.size <= maxBytes || idx >= qualities.length - 1) {
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

export function CurriculoForm({ jobs, questions, sections, companyInfo: _companyInfo, cultureQuestions, logoUrl, companyName }: Props) {
  // ── Currículo state ────────────────────────────────────────────────────────
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [cepStatuses, setCepStatuses] = useState<Record<string, 'idle' | 'checking' | 'valid' | 'invalid'>>({})
  const [cpfErrors, setCpfErrors] = useState<Record<string, boolean>>({})
  const [addrValues, setAddrValues] = useState<Record<string, AddrFields>>({})
  const [fileInfos, setFileInfos] = useState<Record<string, FileInfo | null>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [lgpd, setLgpd] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Flow state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<'form' | 'culture' | 'done'>('form')
  const [cultureToken, setCultureToken] = useState<string | null>(null)
  const [cultureAnswers, setCultureAnswers] = useState<Record<string, string>>({})
  const [cultureSubmitting, setCultureSubmitting] = useState(false)
  const [cultureError, setCultureError] = useState<string | null>(null)

  // ─── Helpers ───────────────────────────────────────────────────────────────

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
      setFileInfos(p => ({ ...p, [id]: { file, error: err } }))
      return
    }
    setFileInfos(p => ({ ...p, [id]: { file, error: null, uploading: true, uploadPct: 0 } }))
    let fileToUpload = file
    if (isImageFile(file)) {
      try {
        const compressed = await compressImageSafe(file, 2 * 1024 * 1024)
        fileToUpload = compressed
        setFileInfos(p => {
          const cur = p[id]; if (!cur) return p
          return { ...p, [id]: { ...cur, file: fileToUpload } }
        })
      } catch { /* upload original */ }
    }
    startUpload(id, fileToUpload)
  }

  function clearFile(id: string) {
    setFileInfos(p => ({ ...p, [id]: null }))
    if (fileRefs.current[id]) fileRefs.current[id]!.value = ''
  }

  function startUpload(id: string, file: File) {
    const fd = new FormData()
    fd.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.min(Math.round((e.loaded / e.total) * 100), 99)
        setFileInfos(p => {
          const cur = p[id]; if (!cur) return p
          return { ...p, [id]: { ...cur, uploadPct: pct } }
        })
      }
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300 && !data.error) {
          setFileInfos(p => {
            const cur = p[id]; if (!cur) return p
            return { ...p, [id]: { ...cur, uploading: false, uploadPct: 100, uploadedUrl: data.url } }
          })
        } else {
          setFileInfos(p => {
            const cur = p[id]; if (!cur) return p
            return { ...p, [id]: { ...cur, uploading: false, error: data.error || 'Erro ao enviar arquivo.' } }
          })
        }
      } catch {
        setFileInfos(p => {
          const cur = p[id]; if (!cur) return p
          return { ...p, [id]: { ...cur, uploading: false, error: 'Resposta inválida do servidor.' } }
        })
      }
    }
    xhr.onerror = () => {
      setFileInfos(p => {
        const cur = p[id]; if (!cur) return p
        return { ...p, [id]: { ...cur, uploading: false, error: 'Falha na conexão. Verifique sua internet e tente novamente.' } }
      })
    }
    xhr.open('POST', '/api/public/upload-file')
    xhr.send(fd)
  }

  // ─── Group questions by section ────────────────────────────────────────────

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

  // ─── Step 1: Submit curriculo ──────────────────────────────────────────────

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Bloqueia CPF incompleto (< 11 dígitos) OU inválido (dígito verificador)
    const badCPF = questions.find(q => {
      if (q.field_type !== 'cpf') return false
      const raw = (answers[q.id] as string) || ''
      const digits = raw.replace(/\D/g, '')
      if (!digits) return false // vazio é tratado pelo "required" do navegador
      return digits.length !== 11 || !validateCPF(raw)
    })
    if (badCPF) {
      setCpfErrors(p => ({ ...p, [badCPF.id]: true }))
      setError('CPF inválido ou incompleto. Verifique o campo e tente novamente.')
      return
    }

    for (const q of questions.filter(q => q.field_type === 'file_upload' && usedIds.has(q.id))) {
      const fi = fileInfos[q.id]
      if (fi?.error) { setError(`Erro no campo "${q.question_text}": ${fi.error}`); return }
      if (fi?.uploading) { setError(`Aguarde o upload do campo "${q.question_text}" concluir antes de continuar.`); return }
      if (q.is_required && !fi?.uploadedUrl) { setError(`O campo "${q.question_text}" é obrigatório.`); return }
    }

    if (!lgpd) { setError('Você precisa aceitar os termos de uso de dados para continuar.'); return }

    setError(null)
    setSubmitting(true)

    const finalAnswers: Record<string, string | string[]> = { ...answers }

    for (const q of questions.filter(q => q.field_type === 'address' && usedIds.has(q.id))) {
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

    for (const q of questions.filter(q => q.field_type === 'file_upload' && usedIds.has(q.id))) {
      const fi = fileInfos[q.id]
      if (fi?.uploadedUrl) finalAnswers[q.id] = fi.uploadedUrl
    }

    let full_name = ''
    let phone = ''
    let city = ''
    let email = ''
    let cpf = ''
    let job_id = ''

    for (const q of questions) {
      const val = (finalAnswers[q.id] as string) || ''
      if (!full_name && q.field_type === 'short_text' && /nome/i.test(q.question_text) && val)
        full_name = val
      if (!phone && q.field_type === 'celular' && val)
        phone = val
      if (!email && q.field_type === 'email' && val)
        email = val
      if (!cpf && q.field_type === 'cpf' && val)
        cpf = val
      if (!job_id && q.field_type === 'job_select' && val)
        job_id = val
      if (!city && q.field_type === 'address' && addrValues[q.id]?.city)
        city = addrValues[q.id].city
      if (!city && /cidade/i.test(q.question_text) && q.field_type === 'short_text' && val)
        city = val
    }

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
          cpf: cpf || undefined,
          job_id: job_id || undefined,
          lgpd_accepted: true,
          answers: finalAnswers,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Ocorreu um erro. Tente novamente.')
        setSubmitting(false); return
      }

      // Se não há perguntas culturais, vai direto para tela de sucesso
      if (!cultureQuestions || cultureQuestions.length === 0) {
        setStep('done')
        setSubmitting(false)
        return
      }

      setCultureToken(data.token)
      setStep('culture')
      setSubmitting(false)
      // Scroll para o topo
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
      setSubmitting(false)
    }
  }

  // ─── Step 2: Submit teste cultural ────────────────────────────────────────

  async function handleCultureSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (Object.keys(cultureAnswers).length < cultureQuestions.length) {
      setCultureError('Por favor, responda todas as perguntas antes de enviar.')
      return
    }

    if (!cultureToken) {
      setCultureError('Token inválido. Recarregue a página e tente novamente.')
      return
    }

    setCultureError(null)
    setCultureSubmitting(true)

    try {
      const res = await fetch('/api/public/culture-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cultureToken, answers: cultureAnswers }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setCultureError(data.error || 'Erro ao enviar o teste. Tente novamente.')
        setCultureSubmitting(false)
        return
      }
      setStep('done')
    } catch {
      setCultureError('Erro de conexão. Verifique sua internet e tente novamente.')
      setCultureSubmitting(false)
    }
  }

  // ─── Field renderer ────────────────────────────────────────────────────────

  function renderField(q: FormQuestion) {
    const sel = 'w-full border border-input rounded-lg px-3 py-2 h-11 text-base bg-background focus:outline-none focus:ring-2 focus:ring-primary/30'

    switch (q.field_type) {

      case 'celular':
        return <Input id={q.id} type="tel" inputMode="numeric" placeholder="24 99999-9999" maxLength={14} required={q.is_required} className="h-11 text-base" value={(answers[q.id] as string) || ''} onChange={e => setAnswer(q.id, maskCelular(e.target.value))} />

      case 'cpf': {
        const val = (answers[q.id] as string) || ''
        const digits = val.replace(/\D/g, '')
        const err = cpfErrors[q.id]
        return (
          <div className="space-y-1">
            <div className="relative">
              <Input id={q.id} type="text" inputMode="numeric" placeholder="000.000.000-00" maxLength={14} required={q.is_required} className={`h-11 text-base pr-9 ${err ? 'border-red-400' : ''}`} value={val}
                onChange={e => { const m = maskCPF(e.target.value); setAnswer(q.id, m); const d = m.replace(/\D/g, ''); setCpfErrors(p => ({ ...p, [q.id]: d.length === 11 ? !validateCPF(m) : false })) }}
                onBlur={() => { if (digits.length > 0 && digits.length !== 11) setCpfErrors(p => ({ ...p, [q.id]: true })) }}
              />
              {err
                ? <div className="absolute right-3 top-1/2 -translate-y-1/2"><AlertCircle className="w-4 h-4 text-red-500" /></div>
                : digits.length === 11 && <div className="absolute right-3 top-1/2 -translate-y-1/2"><CheckCircle2 className="w-4 h-4 text-green-500" /></div>}
            </div>
            {err && <p className="text-xs text-red-500">{digits.length === 11 ? 'CPF inválido.' : 'CPF incompleto.'}</p>}
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
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Endereço <span className="text-red-500">*</span></label>
              <Input type="text" placeholder="Rua, Avenida, Travessa…" required={q.is_required} readOnly={ok && !!addr.street} className={`h-11 text-base bg-white ${ok && addr.street ? 'text-gray-400' : ''}`} value={addr.street} onChange={e => setAddrField(q.id, 'street', e.target.value)} />
            </div>
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
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Cidade <span className="text-red-500">*</span></label>
              <Input type="text" placeholder="Cidade" required={q.is_required} readOnly={ok && !!addr.city} className={`h-11 text-base bg-white ${ok && addr.city ? 'text-gray-400' : ''}`} value={addr.city} onChange={e => setAddrField(q.id, 'city', e.target.value)} />
            </div>
          </div>
        )
      }

      case 'file_upload': {
        const fi = fileInfos[q.id]
        const isPDF = fi?.file?.type === 'application/pdf' || fi?.file?.name?.toLowerCase().endsWith('.pdf')
        const pct = fi?.uploadPct ?? 0
        const isUploading = fi?.uploading === true
        const uploadDone = !!fi?.uploadedUrl

        return (
          <div className="space-y-2">
            <input
              ref={el => { fileRefs.current[q.id] = el }}
              type="file"
              accept="image/*,application/pdf,.pdf,.heic,.heif"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleFileSelect(q.id, f)
                if (fileRefs.current[q.id]) fileRefs.current[q.id]!.value = ''
              }}
            />
            {!fi ? (
              <button type="button" onClick={() => fileRefs.current[q.id]?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl p-6 text-sm text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all cursor-pointer">
                <Paperclip className="w-7 h-7 opacity-40" />
                <span className="font-semibold">Toque aqui para adicionar a foto</span>
                <span className="text-xs">Tire uma foto com a câmera ou escolha da galeria</span>
                <span className="text-xs text-muted-foreground/60">JPG, PNG, PDF — máx. 5 MB</span>
              </button>
            ) : fi.error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-700">Falha no upload</p>
                    <p className="text-xs text-red-600 mt-0.5">{fi.error}</p>
                  </div>
                </div>
                <button type="button" onClick={() => fileRefs.current[q.id]?.click()}
                  className="w-full py-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium transition-colors">
                  Tentar novamente
                </button>
              </div>
            ) : isUploading ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  {isPDF ? <FileText className="w-8 h-8 text-blue-500 shrink-0" /> : <Image className="w-8 h-8 text-blue-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-blue-800 truncate">{fi.file.name}</p>
                    <p className="text-xs text-blue-600">{formatBytes(fi.file.size)}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-blue-600 font-medium">
                    <span>Enviando arquivo…</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="w-full bg-blue-100 rounded-full h-3 overflow-hidden">
                    <div className="h-3 rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            ) : uploadDone ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-green-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-green-800">Upload concluído! ✅</p>
                    <p className="text-xs text-green-700 truncate">{fi.file.name}</p>
                    <p className="text-xs text-green-600">{formatBytes(fi.file.size)}</p>
                  </div>
                  <button type="button" onClick={() => clearFile(q.id)}
                    className="p-1.5 text-green-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Remover arquivo">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <button type="button" onClick={() => fileRefs.current[q.id]?.click()}
                  className="text-xs text-green-700 hover:text-green-900 underline underline-offset-2">
                  Trocar arquivo
                </button>
              </div>
            ) : null}
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

  // ─── Success screen ────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-3xl border border-green-100 shadow-xl p-8 max-w-sm w-full text-center space-y-5 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-11 h-11 text-green-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-900">Currículo enviado com sucesso! 🎉</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Recebemos seu currículo e suas respostas com sucesso! Nossa equipe de RH vai analisar seu perfil e entrará em contato em breve. 😊
            </p>
          </div>
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            <PartyPopper className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
            Boa sorte no processo seletivo!
          </div>
        </div>
      </div>
    )
  }

  // ─── Step 2: Teste Cultural ────────────────────────────────────────────────

  if (step === 'culture') {
    const totalQ = cultureQuestions.length
    const answeredQ = Object.keys(cultureAnswers).length
    const progress = totalQ > 0 ? Math.round((answeredQ / totalQ) * 100) : 0

    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 py-6 sm:py-8 px-4">
        <div className="max-w-xl mx-auto space-y-4 sm:space-y-5">

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <CheckCircle2 className="w-3 h-3 text-white" />
              </div>
              <span className="text-green-700 font-medium">Dados pessoais</span>
            </div>
            <div className="w-8 h-px bg-gray-300" />
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-xs">2</div>
              <span className="text-amber-700 font-semibold">Teste Cultural</span>
            </div>
          </div>

          {/* Header */}
          <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 space-y-3">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Teste Cultural</h1>
            <p className="text-sm text-muted-foreground">
              Responda com sinceridade — não existe resposta certa ou errada. Queremos conhecer você de verdade.
            </p>
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{answeredQ}/{totalQ} respondidas</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          {/* Questions */}
          <form onSubmit={handleCultureSubmit} className="space-y-3">
            {cultureQuestions.map((q, idx) => (
              <div key={q.id} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                <p className="text-sm font-medium">
                  <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                  {q.question_text}
                </p>
                <div className="space-y-2">
                  {(q.options || []).map((opt, i) => {
                    const letter = ['A', 'B', 'C', 'D'][i]
                    const selected = cultureAnswers[q.id] === letter
                    return (
                      <label key={letter}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors w-full ${selected ? 'border-amber-400 bg-amber-50' : 'border-border hover:bg-muted/30'}`}>
                        <input type="radio" name={q.id} value={letter} checked={selected}
                          onChange={() => setCultureAnswers(prev => ({ ...prev, [q.id]: letter }))}
                          className="mt-0.5 shrink-0 accent-amber-500" />
                        <span className="text-sm leading-snug">{opt}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Error */}
            {cultureError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{cultureError}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold rounded-xl bg-amber-600 hover:bg-amber-700"
              disabled={cultureSubmitting || answeredQ < totalQ}
            >
              {cultureSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Enviando…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Enviar Currículo
                  <ChevronRight className="w-4 h-4" />
                </span>
              )}
            </Button>

            {answeredQ < totalQ && (
              <p className="text-center text-xs text-muted-foreground pb-2">
                Responda todas as {totalQ} perguntas para enviar.
              </p>
            )}
          </form>
        </div>
      </div>
    )
  }

  // ─── Step 1: Formulário ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 py-6 sm:py-8 px-4">
      <div className="max-w-xl mx-auto space-y-4 sm:space-y-5">

        {/* Step indicator */}
        {cultureQuestions.length > 0 && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xs">1</div>
              <span className="text-primary font-semibold">Dados pessoais</span>
            </div>
            <div className="w-8 h-px bg-gray-300" />
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold text-xs">2</div>
              <span className="text-gray-400">Teste Cultural</span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-3">
          {logoUrl && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt={companyName || 'Logo'}
                className="h-14 w-auto object-contain"
              />
            </div>
          )}
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Cadastre seu Currículo</h1>
          {companyName && !logoUrl && (
            <p className="text-sm text-muted-foreground">{companyName}</p>
          )}
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4">

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

          {/* Upload hint */}
          {Object.values(fileInfos).some(f => f?.uploading) && (
            <p className="text-center text-xs text-blue-600 font-medium flex items-center justify-center gap-1.5">
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Aguarde o upload da foto concluir…
            </p>
          )}

          {/* Button */}
          <Button
            type="submit"
            className="w-full h-12 text-base font-semibold rounded-xl"
            disabled={submitting || !lgpd || Object.values(fileInfos).some(f => f?.uploading)}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Salvando dados…
              </span>
            ) : cultureQuestions.length > 0 ? (
              <span className="flex items-center gap-2">
                Próxima etapa
                <ChevronRight className="w-4 h-4" />
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
