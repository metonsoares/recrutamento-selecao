'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Plus, Pencil, Trash2, Loader2, X, AlertCircle, CheckCircle2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { contemBusca } from '@/lib/helpers'

export interface CargoLinha { id: string; nome: string; pessoas: number }

/**
 * Lista oficial de cargos.
 *
 * O número de pessoas vem das fichas: é ele que mostra o peso de cada cargo e
 * avisa antes de remover um que está em uso. Renomear corrige também as fichas
 * que usam o nome antigo — sem isso o cadastro e a ficha discordariam.
 */
export function CargosClient({
  linhas, foraDaLista,
}: {
  linhas: CargoLinha[]
  foraDaLista: { nome: string; pessoas: number }[]
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState('')
  const [editando, setEditando] = useState<CargoLinha | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')
  const [removendo, setRemovendo] = useState<CargoLinha | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const filtradas = linhas.filter(l => !busca.trim() || contemBusca(l.nome, busca))

  async function chamar(metodo: 'POST' | 'PUT' | 'DELETE', corpo: Record<string, unknown>) {
    setSalvando(true); setErro(''); setAviso('')
    try {
      const res = await fetch('/api/admin/cargos', {
        method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Não consegui salvar.')
      router.refresh()
      return d as { fichas?: number; emUso?: number }
    } finally { setSalvando(false) }
  }

  async function adicionar() {
    try {
      await chamar('POST', { nome: novo })
      setNovo(''); setAviso('Cargo adicionado.')
    } catch (e) { setErro((e as Error).message) }
  }

  async function salvarEdicao() {
    if (!editando) return
    try {
      const d = await chamar('PUT', { id: editando.id, nome: nomeEdit })
      setAviso(d.fichas ? `Cargo renomeado — ${d.fichas} ficha(s) atualizada(s).` : 'Cargo renomeado.')
      setEditando(null)
    } catch (e) { setErro((e as Error).message) }
  }

  async function confirmarRemocao() {
    if (!removendo) return
    try {
      const d = await chamar('DELETE', { id: removendo.id })
      setAviso(d.emUso
        ? `Cargo removido da lista — ${d.emUso} ficha(s) continuam com esse texto.`
        : 'Cargo removido.')
      setRemovendo(null)
    } catch (e) { setErro((e as Error).message) }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Briefcase className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cadastro de cargos</h1>
          <p className="text-sm text-muted-foreground">
            A lista oficial usada nas fichas dos colaboradores.
          </p>
        </div>
      </div>

      {/* Adicionar */}
      <div className="rounded-2xl border bg-white p-4 space-y-2">
        <label className="text-[11px] font-medium text-gray-600">Novo cargo</label>
        <div className="flex gap-2 flex-wrap">
          <Input value={novo} onChange={e => setNovo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && novo.trim().length > 1) adicionar() }}
            placeholder="Ex.: Auxiliar de confeitaria" className="h-9 flex-1 min-w-[200px]" />
          <Button onClick={adicionar} disabled={salvando || novo.trim().length < 2} className="gap-1.5 shrink-0">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Adicionar
          </Button>
        </div>
      </div>

      {(erro || aviso) && (
        <p className={`text-[13px] flex items-center gap-1.5 ${erro ? 'text-red-600' : 'text-emerald-700'}`}>
          {erro ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {erro || aviso}
        </p>
      )}

      {/* Lista */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold text-gray-900">{linhas.length} cargo(s)</p>
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cargo…"
            className="h-9 w-full sm:w-64" />
        </div>

        {filtradas.map(c => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-gray-50">
            <span className="flex-1 min-w-0 text-sm text-gray-900 break-words">{c.nome}</span>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
              <Users className="w-3 h-3" />{c.pessoas}
            </span>
            <button onClick={() => { setEditando(c); setNomeEdit(c.nome); setErro(''); setAviso('') }}
              title="Editar" className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 shrink-0">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setRemovendo(c); setErro(''); setAviso('') }}
              title="Remover" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {filtradas.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum cargo encontrado.</p>
        )}
      </div>

      {/* Cargos que aparecem em ficha mas não estão cadastrados */}
      {foraDaLista.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-semibold text-amber-900">Em fichas, fora desta lista</p>
          <p className="text-[12px] text-amber-800 mt-0.5">
            Apareceram na ficha de alguém, mas não estão cadastrados. Adicione ou corrija a ficha.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {foraDaLista.map(f => (
              <button key={f.nome} onClick={() => setNovo(f.nome)}
                title="Usar este nome no campo de novo cargo"
                className="text-[12px] rounded-full border border-amber-300 bg-white px-2.5 py-1 hover:bg-amber-100">
                {f.nome} · {f.pessoas}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editar */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setEditando(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Editar cargo</h2>
              <button onClick={() => setEditando(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <Input value={nomeEdit} onChange={e => setNomeEdit(e.target.value)} className="h-9" />
            {editando.pessoas > 0 && (
              <p className="text-[12px] text-muted-foreground">
                {editando.pessoas} ficha(s) usam este cargo e serão renomeadas junto.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditando(null)} disabled={salvando}>Cancelar</Button>
              <Button onClick={salvarEdicao} disabled={salvando || nomeEdit.trim().length < 2} className="gap-1.5">
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remover */}
      {removendo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setRemovendo(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold">Remover “{removendo.nome}”?</h2>
            <p className="text-[13px] text-gray-600">
              {removendo.pessoas > 0
                ? `${removendo.pessoas} ficha(s) usam este cargo. Elas continuam com o texto como está — some apenas da lista oficial.`
                : 'Ninguém usa este cargo hoje.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRemovendo(null)} disabled={salvando}>Cancelar</Button>
              <Button variant="destructive" onClick={confirmarRemocao} disabled={salvando} className="gap-1.5">
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Remover
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
