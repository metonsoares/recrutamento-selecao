import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/helpers'
import {
  CalendarClock, User, Plane, AlertTriangle, Briefcase,
  Building2, Phone, Mail, MapPin, CalendarCheck, ShieldAlert, CheckCircle2,
  ClipboardList, FolderArchive, Stethoscope, UserMinus, TrendingUp, ArrowRightLeft, LifeBuoy,
} from 'lucide-react'
import { EditContact } from './edit-contact'
import { SalaryRaise } from './salary-raises-panel'
import { ContatoEmergencia } from '@/lib/contatos-emergencia'
import {
  situacaoFerias, FeriasRegistro, formatarData, paraData, hoje, diasEntre, somarDias,
} from '@/lib/ferias'

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
  /** Contatos de emergência, como estão na Ficha de Admissão. */
  emergencyContacts?: ContatoEmergencia[]
  /** Férias já lançadas (gozadas ou agendadas) — é o que diz se há pendência. */
  vacations?: { start_date: string; end_date: string; kind: string }[]
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

function fmtBRL(num: number): string {
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ResumoColaborador({
  fullName, jobTitle, companyName, statusLabel,
  cpf, phone, email, city, age,
  admissionDate, salary, registeredAt, warningsCount,
  minimal = false, candidateId, fichaPending = 0, companyDocsPending = 0, timeline = [], isMaster = false,
  salaryRaises = [],
  emergencyContacts = [], vacations = [],
}: Props) {
  const now = new Date()
  const admission = admissionDate ? new Date(admissionDate + 'T00:00:00') : null
  const monthsWorked = admission ? diffMonths(admission, now) : null

  // ── Aviso de férias (CLT) ────────────────────────────────────────────────
  // A conta é a de `@/lib/ferias`, a MESMA da aba Férias e do relatório de RH
  // — e ela olha as férias JÁ LANÇADAS. A conta que vivia aqui só conhecia a
  // data de admissão: quem já tinha férias agendadas dentro do prazo aparecia
  // como "vencidas", e o prazo era medido em meses inteiros, o que disparava
  // o alarme com até um mês de antecedência (e com data no futuro).
  const registrosFerias: FeriasRegistro[] = vacations.map(v => ({
    candidate_id: candidateId ?? '',
    inicio: v.start_date,
    fim: v.end_date,
    tipo: v.kind === 'historico' ? 'historico' : 'solicitacao',
  }))

  const vacationStatus: { tone: 'ok' | 'warn' | 'danger'; title: string; detail: string } | null = (() => {
    if (!admissionDate) return null
    const hj = hoje()
    const hojeIso = `${hj.getFullYear()}-${String(hj.getMonth() + 1).padStart(2, '0')}-${String(hj.getDate()).padStart(2, '0')}`

    // Em férias AGORA vem antes de qualquer prazo: é o que está acontecendo.
    const emFerias = registrosFerias.find(v => v.inicio <= hojeIso && hojeIso <= v.fim)
    if (emFerias) {
      return {
        tone: 'ok',
        title: 'Em férias',
        detail: `De ${formatarData(emFerias.inicio)} a ${formatarData(emFerias.fim)}. Volta em ${formatarData(somarDias(emFerias.fim, 1))}.`,
      }
    }

    const sit = situacaoFerias(admissionDate, registrosFerias)
    switch (sit.status) {
      case 'sem_admissao':
        return null
      case 'agendada':
        return {
          tone: 'ok',
          title: 'Férias agendadas',
          detail: `Já tem férias marcadas — ${sit.prazo}.`
            + (sit.pagarAte ? ` Pagamento até ${formatarData(sit.pagarAte)}.` : '')
            + (sit.avisoInicio ? ` Atenção: ${sit.avisoInicio}.` : ''),
        }
      case 'vencida':
        return {
          tone: 'danger',
          title: '⚠️ Férias vencidas!',
          detail: `Há período aquisitivo em aberto e o prazo para agendar venceu em ${formatarData(sit.limite!)}.`
            + ' Risco de pagamento em dobro. Agende as férias com urgência.',
        }
      case 'agendar': {
        const dias = sit.limite ? diasEntre(hj, paraData(sit.limite)) : 999
        const inicioAte = sit.inicioLimite ? ` As férias precisam começar até ${formatarData(sit.inicioLimite)}.` : ''
        return dias <= 90
          ? {
              tone: 'warn',
              title: 'Férias a vencer em breve',
              detail: `Período aquisitivo em aberto: agendar até ${formatarData(sit.limite!)} (${dias} dia${dias !== 1 ? 's' : ''}).${inicioAte}`,
            }
          : {
              tone: 'ok',
              title: 'Direito a férias adquirido',
              detail: `Período aquisitivo em aberto: agendar até ${formatarData(sit.limite!)}.${inicioAte}`,
            }
      }
      case 'aguardando':
        return {
          tone: 'ok',
          title: monthsWorked != null && monthsWorked < 12 ? 'Ainda não adquiriu direito' : 'Férias em dia',
          detail: `Nenhum período em aberto — ${sit.prazo}.`,
        }
    }
  })()

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
            <p className="text-sm font-bold mt-0.5">{formatDate(admissionDate)}</p>
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
            {/* Quem avisar se acontecer alguma coisa. Vem da Ficha de
                Admissão; só aparece quando está preenchido, para não virar
                mais um traço no card. */}
            {emergencyContacts.map((c, i) => (
              <InfoRow
                key={i}
                icon={LifeBuoy}
                label={emergencyContacts.length > 1 ? `Emergência ${i + 1}` : 'Emergência'}
                value={[c.name, c.phone].filter(Boolean).join(' · ')}
              />
            ))}
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
  funcao:       { icon: Briefcase,     bg: 'bg-indigo-100',  fg: 'text-indigo-700' },
  transferencia:{ icon: ArrowRightLeft, bg: 'bg-teal-100',    fg: 'text-teal-700' },
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
