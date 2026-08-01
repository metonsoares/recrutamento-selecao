import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/helpers'
import {
  CalendarClock, User, Plane, AlertTriangle, Briefcase,
  Building2, Phone, Mail, MapPin, CalendarCheck, ShieldAlert, CheckCircle2,
  ClipboardList, FolderArchive, Stethoscope, UserMinus, TrendingUp,
} from 'lucide-react'
import { EditContact } from './edit-contact'
import { SalaryRaise } from './salary-raises-panel'

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
  /** Versão enxuta (freelancer/intermitente): oculta cargo, admissão, tempo de casa, advertências, salário */
  minimal?: boolean
  candidateId?: string
  fichaPending?: number          // pendências na Ficha de Admissão
  companyDocsPending?: number    // pendências em Documentos
  timeline?: { date: string; label: string; type: string }[]
  /** Master pode editar telefone/e-mail do colaborador */
  isMaster?: boolean
  /** Histórico de aumentos de salário (mais recente primeiro) */
  salaryRaises?: SalaryRaise[]
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

function fmtBRL(num: number): string {
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ResumoColaborador({
  fullName, jobTitle, companyName, statusLabel,
  cpf, phone, email, city, age,
  admissionDate, salary, registeredAt, warningsCount,
  minimal = false, candidateId, fichaPending = 0, companyDocsPending = 0, timeline = [], isMaster = false,
  salaryRaises = [],
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
              {!minimal && jobTitle && <span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" />{jobTitle}</span>}
              {companyName && <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{companyName}</span>}
            </div>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 text-white text-xs font-semibold backdrop-blur">
            {statusLabel}
          </span>
        </div>

        {/* Métricas rápidas */}
        {!minimal && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
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
        </div>}
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

      {/* ── Pendências de documentos ── */}
      {(fichaPending > 0 || companyDocsPending > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-sm text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Pendências de documentos
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {fichaPending > 0 && (
              <a href={candidateId ? `/admin/candidatos/${candidateId}?tab=ficha` : '#'}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors">
                <ClipboardList className="w-3.5 h-3.5" />
                Ficha de Admissão — {fichaPending} pendente{fichaPending !== 1 ? 's' : ''}
              </a>
            )}
            {companyDocsPending > 0 && (
              <a href={candidateId ? `/admin/candidatos/${candidateId}?tab=documentos` : '#'}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors">
                <FolderArchive className="w-3.5 h-3.5" />
                Documentos — {companyDocsPending} pendente{companyDocsPending !== 1 ? 's' : ''}
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Dados Pessoais */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" />Dados Pessoais</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow icon={User} label="Idade" value={age != null ? `${age} anos` : '—'} />
            {!(isMaster && candidateId) && <InfoRow label="CPF" value={cpf || '—'} />}
            {isMaster && candidateId ? (
              <EditContact candidateId={candidateId} initialPhone={phone} initialEmail={email} initialCpf={cpf} withIcons />
            ) : (
              <>
                <InfoRow icon={Phone} label="Telefone" value={phone || '—'} />
                <InfoRow icon={Mail} label="E-mail" value={email || '—'} />
              </>
            )}
            <InfoRow icon={MapPin} label="Cidade" value={city || '—'} />
          </CardContent>
        </Card>

        {/* Histórico / Linha cronológica */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="w-4 h-4 text-muted-foreground" />Histórico na empresa</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="max-h-80 overflow-y-auto pr-1">
              <RichTimeline events={timeline.length ? timeline : [{ date: registeredAt, label: 'Cadastro no sistema', type: 'cadastro' }]} />
            </div>
            {monthsWorked != null && (
              <p className="text-[12px] text-muted-foreground pt-2 border-t">
                Na empresa há <strong className="text-gray-700">{humanDuration(monthsWorked)}</strong>.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Aumentos de salário (somente leitura) */}
        {salaryRaises.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-muted-foreground" />Aumentos de salário</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {salaryRaises.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{formatDate(r.raise_date)}</span>
                  <span className="font-semibold text-emerald-700">{fmtBRL(Number(r.new_value))}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
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

const TIMELINE_STYLE: Record<string, { icon: React.ElementType; bg: string; fg: string }> = {
  cadastro:     { icon: User,          bg: 'bg-gray-100',    fg: 'text-gray-600' },
  admissao:     { icon: CalendarCheck, bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  ferias:       { icon: Plane,         bg: 'bg-sky-100',     fg: 'text-sky-700' },
  falta:        { icon: AlertTriangle, bg: 'bg-amber-100',   fg: 'text-amber-700' },
  advertencia:  { icon: ShieldAlert,   bg: 'bg-orange-100',  fg: 'text-orange-700' },
  atestado:     { icon: Stethoscope,   bg: 'bg-blue-100',    fg: 'text-blue-700' },
  desligamento: { icon: UserMinus,     bg: 'bg-rose-100',    fg: 'text-rose-700' },
  aumento:      { icon: TrendingUp,    bg: 'bg-teal-100',    fg: 'text-teal-700' },
}

function RichTimeline({ events }: { events: { date: string; label: string; type: string }[] }) {
  return (
    <div className="relative space-y-3 before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-px before:bg-gray-200">
      {events.map((it, i) => {
        const s = TIMELINE_STYLE[it.type] ?? TIMELINE_STYLE.cadastro
        const Icon = s.icon
        return (
          <div key={i} className="relative flex items-start gap-2.5">
            <div className={`w-6 h-6 rounded-full ${s.bg} flex items-center justify-center shrink-0 z-10`}>
              <Icon className={`w-3 h-3 ${s.fg}`} />
            </div>
            <div className="pt-0.5">
              <p className="text-[13px] font-medium text-gray-800 leading-tight">{it.label}</p>
              <p className="text-[11px] text-muted-foreground">{formatDate(it.date)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
