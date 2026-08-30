'use client'
import { useState, useMemo, useRef } from 'react'
import {
  Plane, Plus, History, Pencil, Trash2, Loader2, X, CheckCircle2, AlertCircle,
  Upload, FileText, CalendarDays, CalendarCheck, CalendarClock, DollarSign, Clock, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'
import { abrirArquivoAssinado } from '@/lib/abrir-arquivo'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FileRef { url: string; name: string; path: string }

interface Vacation {
  id: string
  start_date: string
  end_date: string
  days: number
  abono: boolean
  abono_days: number
  adiantamento_13: boolean
  comment: string | null
  kind: 'solicitacao' | 'historico'
  notificacao_file: FileRef | null
  recibo_file: FileRef | null
  created_at: string
}

interface Absence {
  id: string
  absence_date: string
  days: number
  kind: 'injustificada' | 'afastamento'
  comment: string | null
  created_at: string
}

interface Props {
  candidateId: string
  admissionDate: string | null
  initialVacations: Vacation[]
  initialAbsences: Absence[]
}

// ─── Tabela CLT Art. 130 — desconto de férias por faltas injustificadas ──────
// faltas → dias de direito a férias
function descontoPorFaltas(faltas: number): number {
  if (faltas <= 5) return 0
  if (faltas <= 14) return 6
  if (faltas <= 23) return 12
  if (faltas <= 32) return 18
  return 30
}

const TABELA_DESCONTO = [
  { faixa: 'Até 5 faltas não justificadas', desconto: '0 dias', ref: 'Data de admissão', frac: 'Permitido' },
  { faixa: '6 a 14 faltas não justificadas', desconto: '6 dias corridos', ref: 'Data de admissão', frac: 'Permitido' },
  { faixa: '15 a 23 faltas não justificadas', desconto: '12 dias corridos', ref: 'Data de admissão', frac: 'Não permitido' },
  { faixa: '24 a 32 faltas não justificadas', desconto: '18 dias corridos', ref: 'Data de admissão', frac: 'Não permitido' },
  { faixa: 'Mais de 32 faltas não justificadas', desconto: '30 dias corridos', ref: 'Data de admissão', frac: 'Não permitido' },
  { faixa: 'Mais de 180 dias afastado por acidente ou doença', desconto: '30 dias corridos', ref: 'Data de retorno após último afastamento', frac: 'Não permitido' },
  { faixa: 'Licença não remunerada', desconto: '—', ref: 'Período aquisitivo é retomado após a volta do colaborador', frac: 'Permitido' },
]

// ─── Helpers de data ──────────────────────────────────────────────────────────

const TOTAL_DIAS_PERIODO = 30

function parse(d: string): Date { return new Date(d + 'T00:00:00') }
/**
 * Hoje em São Paulo. `toISOString()` devolve a data em UTC: depois das 21h em
 * Brasília isso vira o dia SEGUINTE, e o campo de data abria já no amanhã.
 */
function todayISO(): string {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
}

/**
 * Situação real das férias. `kind` diz só COMO o registro entrou (solicitação
 * ou histórico lançado a mão) e nunca muda depois — por isso uma solicitação
 * continuava marcada como "Solicitação" mesmo com a pessoa já em férias.
 * A situação vem das DATAS, comparadas como string pura (yyyy-mm-dd), que é
 * comparável na ordem certa e não sofre deslocamento de fuso.
 */
type SituacaoFerias = 'em_ferias' | 'agendada' | 'concluida' | 'historico'

function situacaoDeFerias(v: { start_date: string; end_date: string; kind: string }, hoje: string): SituacaoFerias {
  if (v.start_date <= hoje && hoje <= v.end_date) return 'em_ferias'
  if (hoje < v.start_date) return 'agendada'
  return v.kind === 'historico' ? 'historico' : 'concluida'
}

const SELO_FERIAS: Record<SituacaoFerias, { texto: string; classe: string }> = {
  em_ferias:  { texto: 'Em férias',  classe: 'bg-blue-100 text-blue-800 border border-blue-300 font-semibold' },
  agendada:   { texto: 'Agendada',   classe: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  concluida:  { texto: 'Concluída',  classe: 'bg-gray-100 text-gray-600' },
  historico:  { texto: 'Histórico',  classe: 'bg-gray-100 text-gray-600' },
}

function diffDaysInclusive(start: string, end: string): number {
  if (!start || !end) return 0
  const s = parse(start), e = parse(end)
  if (e < s) return 0
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1
}

function diffMonths(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
    - (to.getDate() < from.getDate() ? 1 : 0)
}

function addMonths(d: Date, m: number): Date { const r = new Date(d); r.setMonth(r.getMonth() + m); return r }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }

// ─── Modal genérico (drawer à direita) ────────────────────────────────────────

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-3xl h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Form de férias (usado por Solicitar e Adicionar histórico) ───────────────

interface VacForm {
  start_date: string
  end_date: string
  abono: boolean
  adiantamento_13: boolean
  comment: string
}

function VacationFormDrawer({
  title, mode, saldoDisponivel, periodInfo, onSave, onClose, initial, isEdit = false,
}: {
  title: string
  mode: 'solicitacao' | 'historico'
  saldoDisponivel: number
  periodInfo: { admission: string | null; limite: string | null; aquisitivo: string | null }
  onSave: (f: VacForm & { days: number; abono_days: number }) => Promise<void>
  onClose: () => void
  initial?: VacForm
  isEdit?: boolean
}) {
  const [form, setForm] = useState<VacForm>(initial ?? {
    start_date: '', end_date: '', abono: false, adiantamento_13: false, comment: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const diasSelecionados = diffDaysInclusive(form.start_date, form.end_date)
  const diasAbonados = form.abono ? 10 : 0
  const saldoRestante = saldoDisponivel - diasSelecionados - diasAbonados

  const today = todayISO()

  function set<K extends keyof VacForm>(k: K, v: VacForm[K]) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit() {
    setError('')
    if (!form.start_date || !form.end_date) { setError('Informe início e término do período.'); return }
    if (parse(form.end_date) < parse(form.start_date)) { setError('A data de término deve ser após o início.'); return }
    if (!isEdit && mode === 'historico' && parse(form.start_date) > new Date()) {
      setError('No histórico só é permitido datas retroativas.'); return
    }
    if (!isEdit && mode === 'solicitacao' && parse(form.start_date) < new Date(today + 'T00:00:00')) {
      setError('Para solicitar férias, use datas futuras (ou registre como histórico).'); return
    }
    if (saldoRestante < 0) { setError('Saldo insuficiente para esse período.'); return }
    setSaving(true)
    try {
      await onSave({ ...form, days: diasSelecionados, abono_days: diasAbonados })
    } catch (e) {
      setError((e as Error).message || 'Erro ao salvar.')
    } finally { setSaving(false) }
  }

  return (
    <Drawer title={title} onClose={onClose}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 p-6">

        {/* ── Coluna esquerda: formulário ── */}
        <div className="space-y-5">
          {mode === 'historico' && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-700">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              Durante a adição de um histórico de férias é permitido apenas a seleção de datas retroativas.
            </div>
          )}

          {/* Período */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Período</h3>
            <p className="text-[12px] text-muted-foreground mb-2">Indique os dias de início e término do período de férias.</p>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={form.start_date}
                max={mode === 'historico' && !isEdit ? today : undefined}
                min={mode === 'solicitacao' && !isEdit ? today : undefined}
                onChange={e => set('start_date', e.target.value)} />
              <Input type="date" value={form.end_date}
                max={mode === 'historico' && !isEdit ? today : undefined}
                min={form.start_date || (mode === 'solicitacao' && !isEdit ? today : undefined)}
                onChange={e => set('end_date', e.target.value)} />
            </div>
          </div>

          {/* Abono */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Abono pecuniário</h3>
            <p className="text-[12px] text-muted-foreground mb-2">Venda de 1/3 das férias (limitado a 10 dias)</p>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" checked={form.abono === true} onChange={() => set('abono', true)} className="accent-primary" />Sim
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" checked={form.abono === false} onChange={() => set('abono', false)} className="accent-primary" />Não
              </label>
            </div>
          </div>

          {/* Adiantamento 13º */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Adiantamento da primeira parcela do 13º</h3>
            <div className="flex flex-col gap-1.5 mt-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" checked={form.adiantamento_13 === true} onChange={() => set('adiantamento_13', true)} className="accent-primary" />Sim
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" checked={form.adiantamento_13 === false} onChange={() => set('adiantamento_13', false)} className="accent-primary" />Não
              </label>
            </div>
          </div>

          {/* Comentário */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Comentário</h3>
            <textarea value={form.comment} onChange={e => set('comment', e.target.value)} rows={3}
              placeholder="Comentário (opcional)"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><CheckCircle2 className="w-4 h-4" />{isEdit ? 'Salvar alterações' : mode === 'historico' ? 'Adicionar histórico' : 'Solicitar férias'}</>}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          </div>
        </div>

        {/* ── Coluna direita: detalhes ── */}
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Detalhes da seleção</h3>
            <div className="space-y-2">
              <DetailRow icon={CalendarDays} iconBg="bg-emerald-100 text-emerald-700" label="Saldo disponível" value={saldoDisponivel} />
              <DetailRow icon={CheckCircle2} iconBg="bg-emerald-100 text-emerald-700" label="Dias selecionados" value={diasSelecionados} />
              <DetailRow icon={DollarSign} iconBg="bg-gray-100 text-gray-600" label="Dias abonados" value={diasAbonados} />
              <DetailRow icon={Clock} iconBg="bg-amber-100 text-amber-700" label="Saldo restante" value={saldoRestante} danger={saldoRestante < 0} />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Período aquisitivo</h3>
            <div className="space-y-2 text-[12px]">
              <PeriodRow label="Data de admissão" value={periodInfo.admission} />
              <PeriodRow label="Limite para início das férias" value={periodInfo.limite} />
              <PeriodRow label="Período aquisitivo concluído" value={periodInfo.aquisitivo} />
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  )
}

function DetailRow({ icon: Icon, iconBg, label, value, danger }: { icon: React.ElementType; iconBg: string; label: string; value: number; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px] text-gray-600">{label}</span>
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm font-bold ${danger ? 'bg-red-100 text-red-700' : iconBg}`}>
        <Icon className="w-3.5 h-3.5" />{value}
      </span>
    </div>
  )
}

function PeriodRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium text-gray-800 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 opacity-50" />{value || '—'}</p>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function FeriasTab({ candidateId, admissionDate, initialVacations, initialAbsences }: Props) {
  const [vacations, setVacations] = useState<Vacation[]>(initialVacations)
  const [absences, setAbsences] = useState<Absence[]>(initialAbsences)
  const [drawer, setDrawer] = useState<'solicitar' | 'historico' | 'editar' | null>(null)
  const [editingVac, setEditingVac] = useState<Vacation | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [tabelaOpen, setTabelaOpen] = useState(false)
  const [faltaModal, setFaltaModal] = useState(false)

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

  // ── Descontos por faltas (CLT Art. 130) ───────────────────────────────────
  const faltasInjustificadas = useMemo(
    () => absences.filter(a => a.kind === 'injustificada').reduce((s, a) => s + (a.days || 0), 0),
    [absences])
  const diasAfastamento = useMemo(
    () => absences.filter(a => a.kind === 'afastamento').reduce((s, a) => s + (a.days || 0), 0),
    [absences])
  const descontoFaltas = descontoPorFaltas(faltasInjustificadas)
  const descontoAfastamento = diasAfastamento > 180 ? 30 : 0
  const totalDesconto = descontoFaltas + descontoAfastamento

  // ── Cálculo CLT ───────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    if (!admissionDate) {
      return { periodos: 0, totalDireito: 0, usados: 0, disponivel: 0, limite: null as string | null, aquisitivo: null as string | null }
    }
    const adm = parse(admissionDate)
    const now = new Date()
    const monthsWorked = diffMonths(adm, now)
    const periodos = Math.max(0, Math.floor(monthsWorked / 12))
    const totalDireito = periodos * TOTAL_DIAS_PERIODO
    const usados = vacations.reduce((sum, v) => sum + (v.days || 0) + (v.abono_days || 0), 0)
    const disponivel = Math.max(0, totalDireito - usados - totalDesconto)

    // Período aquisitivo concluído mais recente
    let aquisitivo: string | null = null
    let limite: string | null = null
    if (periodos >= 1) {
      const aqStart = addMonths(adm, (periodos - 1) * 12)
      const aqEnd = addDays(addMonths(adm, periodos * 12), -1)
      aquisitivo = `${formatDate(aqStart.toISOString())} - ${formatDate(aqEnd.toISOString())}`
      // Concessivo termina 12 meses após fim do aquisitivo; limite p/ início = fim - 30 dias
      const concessivoEnd = addDays(addMonths(adm, (periodos + 1) * 12), -1)
      limite = formatDate(addDays(concessivoEnd, -TOTAL_DIAS_PERIODO).toISOString())
    } else {
      // ainda no 1º período aquisitivo
      limite = formatDate(addDays(addMonths(adm, 24), -TOTAL_DIAS_PERIODO).toISOString())
    }

    return { periodos, totalDireito, usados, disponivel, limite, aquisitivo }
  }, [admissionDate, vacations, totalDesconto])

  const periodInfo = {
    admission: admissionDate ? formatDate(admissionDate) : null,
    limite: calc.limite,
    aquisitivo: calc.aquisitivo,
  }

  async function handleSave(kind: 'solicitacao' | 'historico', f: VacForm & { days: number; abono_days: number }) {
    const res = await fetch(`/api/admin/candidatos/${candidateId}/vacations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, kind }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    setVacations(prev => [json.vacation, ...prev].sort((a, b) => b.start_date.localeCompare(a.start_date)))
    setDrawer(null)
    showToast('ok', kind === 'historico' ? 'Histórico adicionado.' : 'Férias solicitadas.')
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este registro de férias?')) return
    setDeletingId(id)
    const res = await fetch(`/api/admin/candidatos/${candidateId}/vacations/${id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeletingId(null)
    if (!res.ok) { showToast('err', json.error || 'Erro ao remover.'); return }
    setVacations(prev => prev.filter(v => v.id !== id))
    showToast('ok', 'Registro removido.')
  }

  function openEdit(v: Vacation) { setEditingVac(v); setDrawer('editar') }

  async function handleEditSave(f: VacForm & { days: number; abono_days: number }) {
    if (!editingVac) return
    const res = await fetch(`/api/admin/candidatos/${candidateId}/vacations/${editingVac.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_date: f.start_date, end_date: f.end_date, days: f.days,
        abono: f.abono, abono_days: f.abono_days, adiantamento_13: f.adiantamento_13, comment: f.comment,
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    setVacations(prev => prev.map(v => v.id === editingVac.id ? json.vacation : v).sort((a, b) => b.start_date.localeCompare(a.start_date)))
    setDrawer(null); setEditingVac(null)
    showToast('ok', 'Férias atualizadas.')
  }

  // Salva/remove um anexo (Notificação ou Recibo) do lançamento e atualiza a linha.
  async function saveVacationFile(id: string, field: 'notificacao_file' | 'recibo_file', fileRef: FileRef | null) {
    const res = await fetch(`/api/admin/candidatos/${candidateId}/vacations/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: fileRef }),
    })
    const json = await res.json()
    if (!res.ok) { showToast('err', json.error || 'Erro ao salvar anexo.'); throw new Error(json.error) }
    setVacations(prev => prev.map(v => v.id === id ? { ...v, [field]: fileRef } : v))
    showToast('ok', fileRef ? 'Anexo salvo.' : 'Anexo removido.')
  }

  async function handleAddFalta(f: { absence_date: string; days: number; kind: string; comment: string }) {
    const res = await fetch(`/api/admin/candidatos/${candidateId}/absences`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    setAbsences(prev => [json.absence, ...prev].sort((a, b) => b.absence_date.localeCompare(a.absence_date)))
    setFaltaModal(false)
    showToast('ok', 'Falta registrada.')
  }

  async function handleDeleteFalta(id: string) {
    if (!confirm('Remover esta falta?')) return
    const res = await fetch(`/api/admin/candidatos/${candidateId}/absences/${id}`, { method: 'DELETE' })
    if (res.ok) { setAbsences(prev => prev.filter(a => a.id !== id)); showToast('ok', 'Falta removida.') }
  }

  return (
    <div className="max-w-4xl space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Aviso sem admissão */}
      {!admissionDate && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          Defina a <strong>Data de Admissão</strong> na aba <em>Ficha Admissão</em> para calcular os períodos de férias.
        </div>
      )}

      {/* Quadro de saldos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SaldoCard icon={CalendarDays} tone="emerald" label="Saldo disponível" value={`${calc.disponivel} dias`} />
        <SaldoCard icon={CalendarCheck} tone="gray" label="Dias gozados" value={`${calc.usados} dias`} />
        <SaldoCard icon={CalendarClock} tone="blue" label="Períodos adquiridos" value={`${calc.periodos}`} />
        <SaldoCard icon={Clock} tone="amber" label="Limite p/ pedir férias" value={calc.limite || '—'} />
      </div>

      {/* Período aquisitivo + ações */}
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm">
            <p className="text-muted-foreground text-[12px]">Período aquisitivo concluído</p>
            <p className="font-semibold text-gray-900">{calc.aquisitivo || '—'}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDrawer('historico')} className="gap-1.5">
              <History className="w-4 h-4" />Adicionar histórico
            </Button>
            <Button onClick={() => setDrawer('solicitar')} className="gap-1.5" disabled={!admissionDate}>
              <Plus className="w-4 h-4" />Solicitar férias
            </Button>
          </div>
        </div>
      </div>

      {/* Tabela de férias */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Início</th>
              <th className="px-4 py-3 text-left font-medium">Término</th>
              <th className="px-4 py-3 text-center font-medium">Dias</th>
              <th className="px-4 py-3 text-center font-medium">Abono</th>
              <th className="px-4 py-3 text-left font-medium">Tipo</th>
              <th className="px-4 py-3 text-left font-medium">Documentos</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vacations.map(v => (
              <VacationRow key={v.id} v={v} candidateId={candidateId}
                deleting={deletingId === v.id}
                onEdit={openEdit} onDelete={handleDelete} onSaveFile={saveVacationFile} />
            ))}
            {vacations.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                <Plane className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                Nenhum registro de férias.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Seus descontos ── */}
      <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-base font-bold text-gray-900">Seus descontos</h3>
          <Button variant="outline" size="sm" onClick={() => setFaltaModal(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />Registrar falta / afastamento
          </Button>
        </div>

        <div className="space-y-1.5 text-sm">
          <p className="text-gray-600">Total de dias descontados: <strong className="text-gray-900">{totalDesconto} dia{totalDesconto !== 1 ? 's' : ''}</strong></p>
          <p className="text-gray-600">Descontos de ausências injustificadas: <strong className="text-gray-900">{descontoFaltas} dia{descontoFaltas !== 1 ? 's' : ''}</strong> <span className="text-[12px] text-muted-foreground">({faltasInjustificadas} falta{faltasInjustificadas !== 1 ? 's' : ''})</span></p>
          <p className="text-gray-600">Descontos de afastamentos: <strong className="text-gray-900">{descontoAfastamento} dias</strong> <span className="text-[12px] text-muted-foreground">({diasAfastamento} dia{diasAfastamento !== 1 ? 's' : ''} afastado)</span></p>
          <p className="text-gray-600 pt-1">Saldo disponível de férias: <strong className="text-emerald-700">{calc.disponivel} dias</strong></p>
        </div>

        {/* Lista de faltas */}
        {absences.length > 0 && (
          <div className="border-t pt-3 space-y-1.5">
            {absences.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-[13px]">
                <span className="text-gray-500 w-24 shrink-0">{formatDate(a.absence_date)}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${a.kind === 'afastamento' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                  {a.kind === 'afastamento' ? 'Afastamento' : 'Falta injust.'}
                </span>
                <span className="text-gray-700">{a.days} dia{a.days !== 1 ? 's' : ''}</span>
                {a.comment && <span className="text-muted-foreground truncate flex-1">— {a.comment}</span>}
                <button onClick={() => handleDeleteFalta(a.id)} className="ml-auto text-gray-300 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {/* Tabela de cálculo de descontos (referência) */}
        <div className="border-t pt-3">
          <button onClick={() => setTabelaOpen(o => !o)} className="flex items-center justify-between w-full text-left">
            <div>
              <p className="text-sm font-bold text-gray-900">Tabela de cálculo de descontos</p>
              <p className="text-[12px] text-muted-foreground">Regras de desconto do saldo de férias de acordo com as ausências.</p>
            </div>
            <span className="text-gray-400 text-xs">{tabelaOpen ? '▲' : '▼'}</span>
          </button>
          {tabelaOpen && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[12px] border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Quantidade de dias</th>
                    <th className="px-3 py-2 text-left font-medium">Desconto no saldo de férias</th>
                    <th className="px-3 py-2 text-left font-medium">Referência do período aquisitivo</th>
                    <th className="px-3 py-2 text-left font-medium">Fracionamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {TABELA_DESCONTO.map((r, i) => (
                    <tr key={i} className="text-gray-700">
                      <td className="px-3 py-2">{r.faixa}</td>
                      <td className="px-3 py-2">{r.desconto}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.ref}</td>
                      <td className="px-3 py-2"><span className={r.frac === 'Permitido' ? 'text-emerald-700' : 'text-gray-500'}>{r.frac}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal registrar falta */}
      {faltaModal && <FaltaModal onSave={handleAddFalta} onClose={() => setFaltaModal(false)} />}

      {/* Drawers */}
      {drawer === 'solicitar' && (
        <VacationFormDrawer
          title="Solicitar férias para colaborador"
          mode="solicitacao"
          saldoDisponivel={calc.disponivel}
          periodInfo={periodInfo}
          onSave={f => handleSave('solicitacao', f)}
          onClose={() => setDrawer(null)}
        />
      )}
      {drawer === 'historico' && (
        <VacationFormDrawer
          title="Adicionar histórico"
          mode="historico"
          saldoDisponivel={calc.disponivel}
          periodInfo={periodInfo}
          onSave={f => handleSave('historico', f)}
          onClose={() => setDrawer(null)}
        />
      )}
      {drawer === 'editar' && editingVac && (
        <VacationFormDrawer
          title="Editar férias"
          mode={editingVac.kind === 'historico' ? 'historico' : 'solicitacao'}
          isEdit
          initial={{
            start_date: editingVac.start_date, end_date: editingVac.end_date,
            abono: editingVac.abono, adiantamento_13: editingVac.adiantamento_13, comment: editingVac.comment || '',
          }}
          saldoDisponivel={calc.disponivel + (editingVac.days || 0) + (editingVac.abono_days || 0)}
          periodInfo={periodInfo}
          onSave={handleEditSave}
          onClose={() => { setDrawer(null); setEditingVac(null) }}
        />
      )}
    </div>
  )
}

// ─── Linha da tabela de férias (com anexos: Notificação + Recibo) ─────────────

function VacationRow({ v, candidateId, deleting, onEdit, onDelete, onSaveFile }: {
  v: Vacation
  candidateId: string
  deleting: boolean
  onEdit: (v: Vacation) => void
  onDelete: (id: string) => void
  onSaveFile: (id: string, field: 'notificacao_file' | 'recibo_file', f: FileRef | null) => Promise<void>
}) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(v.start_date)}</td>
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(v.end_date)}</td>
      <td className="px-4 py-3 text-center font-semibold">{v.days}</td>
      <td className="px-4 py-3 text-center">{v.abono ? `${v.abono_days} dias` : '—'}</td>
      <td className="px-4 py-3">
        {(() => {
          const selo = SELO_FERIAS[situacaoDeFerias(v, todayISO())]
          return (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${selo.classe}`}>
              {selo.texto}
            </span>
          )
        })()}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <VacFileSlot label="Notificação" candidateId={candidateId} value={v.notificacao_file}
            onSaved={f => onSaveFile(v.id, 'notificacao_file', f)} />
          <VacFileSlot label="Recibo" candidateId={candidateId} value={v.recibo_file}
            onSaved={f => onSaveFile(v.id, 'recibo_file', f)} />
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <button onClick={() => onEdit(v)} title="Editar"
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(v.id)} disabled={deleting} title="Remover"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Slot de anexo (upload/ver/remover) usado por lançamento ──────────────────

function VacFileSlot({ label, candidateId, value, onSaved }: {
  label: string
  candidateId: string
  value: FileRef | null
  onSaved: (f: FileRef | null) => Promise<void>
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { alert('Arquivo excede 4 MB'); if (e.target) e.target.value = ''; return }
    setBusy(true)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('docKey', 'ferias')
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      await onSaved({ url: d.url, name: file.name, path: d.path })
    } catch { /* toast tratado no onSaved */ }
    finally { setBusy(false); if (e.target) e.target.value = '' }
  }

  async function remove() { setBusy(true); try { await onSaved(null) } catch { /* toast no onSaved */ } finally { setBusy(false) } }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-400 w-[70px] shrink-0">{label}</span>
      {value?.url ? (
        <div className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 max-w-[160px]">
          <FileText className="w-3 h-3 text-red-500 shrink-0" />
          <a href={value.url} onClick={e => abrirArquivoAssinado(e, value)} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-700 hover:underline truncate">{value.name}</a>
          <button onClick={remove} disabled={busy} className="text-gray-400 hover:text-red-500 shrink-0">
            {busy ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <X className="w-2.5 h-2.5" />}
          </button>
        </div>
      ) : (
        <button onClick={() => ref.current?.click()} disabled={busy}
          className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
          {busy ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Upload className="w-2.5 h-2.5" />}Anexar
        </button>
      )}
      <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={upload} />
    </div>
  )
}

// ─── Modal de registro de falta/afastamento ───────────────────────────────────

function FaltaModal({ onSave, onClose }: { onSave: (f: { absence_date: string; days: number; kind: string; comment: string }) => Promise<void>; onClose: () => void }) {
  const [absence_date, setDate] = useState('')
  const [days, setDays] = useState('1')
  const [kind, setKind] = useState('injustificada')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!absence_date) { setError('Informe a data.'); return }
    setSaving(true); setError('')
    try {
      await onSave({ absence_date, days: Number(days) || 1, kind, comment })
    } catch (e) { setError((e as Error).message || 'Erro ao salvar.') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">Registrar falta / afastamento</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Tipo</label>
            <select value={kind} onChange={e => setKind(e.target.value)} className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
              <option value="injustificada">Falta não justificada</option>
              <option value="afastamento">Afastamento (acidente/doença)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Data {kind === 'afastamento' ? 'de início' : ''} *</label>
              <Input type="date" value={absence_date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Qtd. de dias</label>
              <Input type="number" min={1} value={days} onChange={e => setDays(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Observação (opcional)</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="gap-1.5">
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : <><CheckCircle2 className="w-3.5 h-3.5" />Registrar</>}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SaldoCard({ icon: Icon, tone, label, value }: { icon: React.ElementType; tone: 'emerald' | 'gray' | 'blue' | 'amber'; label: string; value: string }) {
  const tones = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  }
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <Icon className="w-4 h-4 mb-1.5 opacity-70" />
      <p className="text-[10px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-base font-bold mt-0.5 leading-tight">{value}</p>
    </div>
  )
}
