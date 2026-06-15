'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CalendarX, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

interface ContratadoRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  city: string | null
  created_at: string
  appId: string | null
  appStatus: string | null
  finalScore: number | null
  jobTitle: string
  companyName: string | null
  photoUrl: string | null
  pendencia: 'ok' | 'pendente'
}

interface Props {
  rows: ContratadoRow[]
  companyOptions: string[]
}

export function ContratadosTable({ rows, companyOptions }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [faltaOpen, setFaltaOpen] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  const filtered = useMemo(() => {
    return rows
      .filter(r => {
        if (!search.trim()) return true
        return r.full_name.toLowerCase().includes(search.toLowerCase())
      })
      .filter(r => {
        if (companyFilter === 'all') return true
        return r.companyName === companyFilter
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
  }, [rows, search, companyFilter])

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={companyFilter} onValueChange={v => v && setCompanyFilter(v)}>
          <SelectTrigger className="w-[200px]">
            <span className="line-clamp-1 text-left flex-1">{companyFilter === 'all' ? 'Empresa' : companyFilter}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {companyOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setFaltaOpen(true)} className="gap-1.5 shrink-0">
          <CalendarX className="w-4 h-4" />
          Inserir faltas
        </Button>
      </div>

      {/* Contador */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} contratado{filtered.length !== 1 ? 's' : ''}
        {(search || companyFilter !== 'all') ? ' encontrado' + (filtered.length !== 1 ? 's' : '') : ''}
      </p>

      {/* Tabela */}
      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Nome</th>
              <th className="px-4 py-3 text-left font-medium">Empresa</th>
              <th className="px-4 py-3 text-left font-medium">Cargo</th>
              <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Contato</th>
              <th className="px-4 py-3 text-center font-medium">Pendências</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(c => (
              <tr
                key={c.id}
                className="hover:bg-gray-50 transition-colors cursor-pointer group"
                onClick={() => router.push(`/admin/candidatos/${c.id}`)}
              >
                {/* Nome + foto */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {c.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.photoUrl} alt={c.full_name}
                        className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-emerald-700">{c.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                      </div>
                    )}
                    <p className="font-medium text-gray-900 group-hover:text-emerald-700 transition-colors">{c.full_name}</p>
                  </div>
                </td>

                {/* Empresa */}
                <td className="px-4 py-3">
                  {c.companyName ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                      {c.companyName}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>

                {/* Cargo (vaga) */}
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {c.jobTitle}
                  </span>
                </td>

                {/* Contato */}
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                  <p>{c.phone || '—'}</p>
                  {c.email && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{c.email}</p>}
                </td>

                {/* Pendências */}
                <td className="px-4 py-3 text-center">
                  {c.pendencia === 'ok' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                      <CheckCircle2 className="w-3 h-3" />Ok
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                      <AlertCircle className="w-3 h-3" />Pendente
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhum contratado encontrado com os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Inserir faltas */}
      {faltaOpen && (
        <InserirFaltasModal
          rows={rows}
          companyOptions={companyOptions}
          onClose={() => setFaltaOpen(false)}
          onDone={(n) => { setFaltaOpen(false); setToast({ type: 'ok', msg: `${n} falta${n !== 1 ? 's' : ''} registrada${n !== 1 ? 's' : ''}.` }); setTimeout(() => setToast(null), 4000) }}
          onError={(m) => { setToast({ type: 'err', msg: m }); setTimeout(() => setToast(null), 4000) }}
        />
      )}
    </div>
  )
}

// ─── Modal de lançamento de faltas em lote ────────────────────────────────────

function InserirFaltasModal({
  rows, companyOptions, onClose, onDone, onError,
}: {
  rows: ContratadoRow[]
  companyOptions: string[]
  onClose: () => void
  onDone: (count: number) => void
  onError: (msg: string) => void
}) {
  const [company, setCompany] = useState('')
  const [date, setDate] = useState('')
  const [kind, setKind] = useState('injustificada')
  const [days, setDays] = useState('1')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const funcionarios = useMemo(() => {
    return rows
      .filter(r => company ? r.companyName === company : false)
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
  }, [rows, company])

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function handleSubmit() {
    setError('')
    if (!company) { setError('Selecione a empresa.'); return }
    if (!date) { setError('Informe a data da falta.'); return }
    if (selected.size === 0) { setError('Selecione ao menos um funcionário.'); return }
    setSaving(true)
    try {
      const ids = Array.from(selected)
      const results = await Promise.all(ids.map(id =>
        fetch(`/api/admin/candidatos/${id}/absences`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ absence_date: date, days: Number(days) || 1, kind }),
        }).then(r => r.ok)
      ))
      const ok = results.filter(Boolean).length
      if (ok === 0) throw new Error('Falha ao registrar.')
      onDone(ok)
    } catch (e) {
      onError((e as Error).message || 'Erro ao registrar faltas.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">Inserir faltas</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          {/* Empresa */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Empresa *</label>
            <select value={company} onChange={e => { setCompany(e.target.value); setSelected(new Set()) }}
              className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
              <option value="">Selecionar empresa...</option>
              {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Data + tipo + dias */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Data da falta *</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Tipo</label>
              <select value={kind} onChange={e => setKind(e.target.value)}
                className="h-9 w-full border border-gray-300 rounded-md px-2 text-sm bg-white">
                <option value="injustificada">Injustificada</option>
                <option value="afastamento">Afastamento</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Qtd. dias</label>
              <Input type="number" min={1} value={days} onChange={e => setDays(e.target.value)} />
            </div>
          </div>

          {/* Lista de funcionários */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">
              Funcionários contratados {company && `(${funcionarios.length})`}
            </label>
            {!company ? (
              <p className="text-sm text-muted-foreground text-center py-6 border rounded-lg bg-gray-50">
                Selecione uma empresa para listar os funcionários.
              </p>
            ) : funcionarios.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6 border rounded-lg bg-gray-50">
                Nenhum funcionário contratado nesta empresa.
              </p>
            ) : (
              <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                {funcionarios.map(f => (
                  <label key={f.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="accent-primary" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{f.full_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{f.jobTitle}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
        </div>

        <div className="flex justify-between items-center gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
          <span className="text-xs text-muted-foreground">{selected.size} selecionado{selected.size !== 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Inserindo...</> : <><CalendarX className="w-3.5 h-3.5" />Inserir falta</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
