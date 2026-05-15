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
  const secret = process.env.ENCRYPTION_SECRET || 'default-secret-change-me'
  const [ivHex, encryptedText] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const key = crypto.scryptSync(secret, 'salt', 32)
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
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
  return new Date(date).toLocaleDateString('pt-BR')
}

export function formatDateTime(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleString('pt-BR')
}
