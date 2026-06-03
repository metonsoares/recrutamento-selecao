import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/helpers'
import {
  CalendarClock, User, Plane, AlertTriangle, Briefcase,
  Building2, Phone, Mail, MapPin, CalendarCheck, ShieldAlert, CheckCircle2,
} from 'lucide-react'

interface Props {
  fullName: string
  jobTitle: string | null
  companyName: string | null
  statusLabel: string
  cpf: string | null
  phone: string | null
  email: string | null
  city: string | null
  age: number | null
  admissionDate: string | null   // ISO yyyy-mm-dd
  salary: string | null
  registeredAt: string           // created_at
  warningsCount: number
}

// ─── Helpers de tempo ─────────────────────────────────────────────────────────

function diffMonths(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
    - (to.getDate() < from.getDate() ? 1 : 0)
}

function humanDuration(months: number): string {
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts: string[] = []
  if (y > 0) parts.push(`${y} ano${y !== 1 ? 's' : ''}`)
  if (m > 0) parts.push(`${m} ${m !== 1 ? 'meses' : 'mês'}`)
  return parts.length ? parts.join(' e ') : 'menos de 1 mês'
}

function addMonths(d: Date, months: number): Date {
  const r = new Date(d); r.setMonth(r.getMonth() + months); return r
}

export function ResumoColaborador({
  fullName, jobTitle, companyName, statusLabel,
  cpf, phone, email, city, age,
  admissionDate, salary, registeredAt, warningsCount,
}: Props) {
  const now = new Date()
  const admission = admissionDate ? new Date(admissionDate + 'T00:00:00') : null
  const monthsWorked = admission ? diffMonths(admission, now) : null

  // ── Cálculo de férias (CLT) ──────────────────────────────────────────────
  // Período aquisitivo: 12 meses. Período concessivo: deve tirar até 24 meses.
  let vacationStatus: { tone: 'ok' | 'warn' | 'danger'; title: string; detail: string } | null = null
  if (admission && monthsWorked != null) {
    if (monthsWorked < 12) {
      const acquireDate = addMonths(admission, 12)
      vacationStatus = {
        tone: 'ok',
        title: 'Ainda não adquiriu direito',
        detail: `Completará o 1º período aquisitivo em ${formatDate(acquireDate.toISOString())} (${12 - monthsWorked} ${12 - monthsWorked !== 1 ? 'meses' : 'mês'} restantes).`,
      }
    } else {
      // Já adquiriu ao menos um período. Limite para gozo = 24 meses após admissão (por período).
      const periodsAcquired = Math.floor(monthsWorked / 12)
      const limitDate = addMonths(admission, periodsAcquired * 12 + 12) // limite concessivo do período atual
      const monthsUntilLimit = diffMonths(now, limitDate)
      if (monthsUntilLimit <= 0) {
        vacationStatus = {
          tone: 'danger',
          title: '⚠️ Férias vencidas!',
          detail: `O prazo para concessão expirou em ${formatDate(limitDate.toISOString())}. Risco de pagamento em dobro. Agende as férias com urgência.`,
        }
      } else if (monthsUntilLimit <= 3) {
        vacationStatus = {
          tone: 'warn',
          title: 'Férias a vencer em breve',
          detail: `Conceder até ${formatDate(limitDate.toISOString())} (${monthsUntilLimit} ${monthsUntilLimit !== 1 ? 'meses' : 'mês'}). Programe o período de gozo.`,
        }
      } else {
        vacationStatus = {
          tone: 'ok',
          title: 'Direito a férias adquirido',
          detail: `${periodsAcquired} período${periodsAcquired !== 1 ? 's' : ''} adquirido${periodsAcquired !== 1 ? 's' : ''}. Conceder até ${formatDate(limitDate.toISOString())}.`,
        }
      }
    }
  }

  const toneStyles = {
    ok:     { box: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-600', Icon: CheckCircle2 },
    warn:   { box: 'bg-amber-50 border-amber-200',     icon: 'text-amber-600',   Icon: AlertTriangle },
    danger: { box: 'bg-red-50 border-red-300',         icon: 'text-red-600',     Icon: ShieldAlert },
  }

  return (
    <div className="space-y-4">

      {/* ── Faixa de destaque ── */}
      <div className="rounded-2xl border bg-gradient-to-br from-[#1a5c38] to-[#2d7a4f] text-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-emerald-100/80 font-semibold">Colaborador</p>
            <h2 className="text-2xl font-bold leading-tight mt-0.5">{fullName}</h2>
            <div className="flex items-center gap-3 mt-2 text-sm text-emerald-50 flex-wrap">
              {jobTitle && <span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" />{jobTitle}</span>}
              {companyName && <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{companyName}</span>}
            </div>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 text-white text-xs font-semibold backdrop-blur">
            {statusLabel}
          </span>
        </div>

        {/* Métricas rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="bg-white/10 rounded-xl px-3 py-2.5 backdrop-blur">
            <p className="text-[10px] uppercase tracking-wide text-emerald-100/70">Admissão</p>
            <p className="text-sm font-bold mt-0.5">{admission ? formatDate(admission.toISOString()) : '—'}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2.5 backdrop-blur">
            <p className="text-[10px] uppercase tracking-wide text-emerald-100/70">Tempo de casa</p>
            <p className="text-sm font-bold mt-0.5">{monthsWorked != null ? humanDuration(monthsWorked) : '—'}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2.5 backdrop-blur">
            <p className="text-[10px] uppercase tracking-wide text-emerald-100/70">Advertências</p>
            <p className="text-sm font-bold mt-0.5">{warningsCount}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2.5 backdrop-blur">
            <p className="text-[10px] uppercase tracking-wide text-emerald-100/70">Salário</p>
            <p className="text-sm font-bold mt-0.5">{salary || '—'}</p>
          </div>
        </div>
      </div>

      {/* ── Aviso de férias ── */}
      {vacationStatus && (() => {
        const s = toneStyles[vacationStatus.tone]
        const Icon = s.Icon
        return (
          <div className={`rounded-xl border p-4 flex items-start gap-3 ${s.box}`}>
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${s.icon}`} />
            <div>
              <p className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                <Plane className="w-4 h-4" />{vacationStatus.title}
              </p>
              <p className="text-sm text-gray-600 mt-0.5">{vacationStatus.detail}</p>
            </div>
          </div>
        )
      })()}

      {/* ── Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Dados Pessoais */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" />Dados Pessoais</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow icon={User} label="Idade" value={age != null ? `${age} anos` : '—'} />
            <InfoRow label="CPF" value={cpf || '—'} />
            <InfoRow icon={Phone} label="Telefone" value={phone || '—'} />
            <InfoRow icon={Mail} label="E-mail" value={email || '—'} />
            <InfoRow icon={MapPin} label="Cidade" value={city || '—'} />
          </CardContent>
        </Card>

        {/* Histórico */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="w-4 h-4 text-muted-foreground" />Histórico</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Timeline
              items={[
                { date: registeredAt, label: 'Cadastro no sistema', icon: User },
                ...(admission ? [{ date: admission.toISOString(), label: 'Admissão / contratação', icon: CalendarCheck }] : []),
              ]}
            />
            {monthsWorked != null && (
              <p className="text-[12px] text-muted-foreground pt-2 border-t">
                Na empresa há <strong className="text-gray-700">{humanDuration(monthsWorked)}</strong>.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon?: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 opacity-60" />}{label}
      </span>
      <span className="font-medium text-gray-800 text-right">{value}</span>
    </div>
  )
}

function Timeline({ items }: { items: { date: string; label: string; icon: React.ElementType }[] }) {
  const sorted = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  return (
    <div className="space-y-3">
      {sorted.map((it, i) => {
        const Icon = it.icon
        return (
          <div key={i} className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="w-3 h-3 text-emerald-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800 leading-tight">{it.label}</p>
              <p className="text-[11px] text-muted-foreground">{formatDate(it.date)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
