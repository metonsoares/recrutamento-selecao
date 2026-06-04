import crypto from 'crypto'

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/** Código curto (base36, ~6 chars) para links encurtados. */
export function generateShortCode(): string {
  return crypto.randomBytes(5).toString('hex').slice(0, 6)
}

/** Base pública da aplicação (domínio próprio), evitando URLs de preview da Vercel. */
export function publicAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://recrutamento.browniedoton.com'
}

export function maskToken(token: string): string {
  if (!token || token.length < 8) return '••••••••'
  return '••••••••••••' + token.slice(-4)
}

export function encryptToken(text: string): string {
  const secret = process.env.ENCRYPTION_SECRET || 'default-secret-change-me'
  const iv = crypto.randomBytes(16)
  const key = crypto.scryptSync(secret, 'salt', 32)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

export function decryptToken(encrypted: string): string {
  try {
    const secret = process.env.ENCRYPTION_SECRET || 'default-secret-change-me'
    const colonIdx = encrypted.indexOf(':')
    if (colonIdx === -1) throw new Error('Invalid encrypted format — missing colon separator')
    const ivHex = encrypted.slice(0, colonIdx)
    const encryptedText = encrypted.slice(colonIdx + 1)
    const iv = Buffer.from(ivHex, 'hex')
    const key = crypto.scryptSync(secret, 'salt', 32)
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (err) {
    console.error('[decryptToken] Failed to decrypt:', err)
    throw err
  }
}

export function calculateCultureScore(
  answers: Array<{ score: number | null; weight: number }>
): number {
  if (!answers.length) return 0
  const totalWeight = answers.reduce((sum, a) => sum + (a.weight ?? 1), 0)
  const weightedScore = answers.reduce(
    (sum, a) => sum + (a.score ?? 0) * (a.weight ?? 1),
    0
  )
  const maxPossible = totalWeight * 10
  return maxPossible > 0 ? Math.round((weightedScore / maxPossible) * 100) : 0
}

export function calculateFinalScore(
  cultureScore: number,
  experienceScore: number,
  availabilityScore: number,
  weights = { culture: 0.5, experience: 0.35, availability: 0.15 }
): number {
  return Math.round(
    cultureScore * weights.culture +
    experienceScore * weights.experience +
    availabilityScore * weights.availability
  )
}

export function formatDate(date: string | null): string {
  if (!date) return '-'
  // Data pura (YYYY-MM-DD) — formata sem conversão de fuso (evita recuar 1 dia)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return new Date(date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function formatDateTime(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
