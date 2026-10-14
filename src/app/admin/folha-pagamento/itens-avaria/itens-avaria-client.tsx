'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PackageSearch, Plus, Pencil, Trash2, Loader2, X, AlertCircle, CheckCircle2, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { contemBusca } from '@/lib/helpers'

export interface ItemAvaria { id: string; nome: string; valor: number; ativo: boolean }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** "12,90" → 12.9 (o campo aceita vírgula, que é como se digita preço aqui). */
const paraNumero = (v: string) => Number(v.replace(/\./g, '').replace(',', '.')) || 0
const paraCampo = (v: number) => (v > 0 ? v.toFixed(2).replace('.', ',') : '')

/**
 * Lista de preços das avarias.
 *
 * O lançamento continua guardando o TEXTO e o valor do dia — mudar o preço
 * aqui não reescreve avaria já lançada, que é o que se espera de um desconto
 * que já foi comunicado ao colaborador.
 */
export function ItensAvariaClient({ itens }: { itens: ItemAvaria[] }) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [novoValor, setNovoValor] = useState('')
  const [editando, setEditando] = useState<ItemAvaria | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')
  const [valorEdit, setValorEdit] = useState('')
  const [removendo, setRemovendo] = useState<ItemAvaria | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const filtrados = itens.filter(i => !busca.trim() || contemBusca(i.nome, busca))
  const total = itens.reduce((s, i) => s + i.valor, 0)

  async function chamar(metodo: 'POST' | 'PUT' | 'DELETE', corpo: Record<string, unknown>) {
    setSalvando(true); setErro(''); setAviso('')
    try {
      const res = await fetch('/api/admin/avaria-itens', {
        method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Não consegui salvar.')
      router.refresh()
    } finally { setSalvando(false) }
  }

  async function adicionar() {
    try {
      await chamar('POST', { nome: novoNome, valor: novoValor })
      setNovoNome(''); setNovoValor(''); setAviso('Item adicionado.')
    } catch (e) { setErro((e as Error).message) }
  }

  async function salvarEdicao() {
    if (!editando) return
    try {
      await chamar('PUT', { id: editando.id, nome: nomeEdit, valor: valorEdit })
      setAviso('Item atualizado. Avarias já lançadas continuam com o valor do dia.')
      setEditando(null)
    } catch (e) { setErro((e as Error).message) }
  }

  async function confirmarRemocao() {
    if (!removendo) return
    try {
      await chamar('DELETE', { id: removendo.id })
      setAviso('Item removido da lista.')
      setRemovendo(null)
    } catch (e) { setErro((e as Error).message) }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <PackageSearch className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">Itens de avaria</h1>
          <p className="text-sm text-muted-foreground">
            A lista de preços usada no lançamento. Em{' '}
            <Link href="/admin/folha-pagamento/lancamentos/avarias"
              className="text-primary font-medium hover:underline inline-flex items-center gap-0.5">
              Avarias <ExternalLink className="w-3 h-3" />
            </Link>{' '}
            basta digitar o começo do nome: o valor vem junto.
          </p>
        </div>
      </div>

      {/* Adicionar */}
      <div className="rounded-2xl border bg-white p-4 space-y-2">
        <label className="text-[11px] font-medium text-gray-600">Novo item</label>
        <div className="flex gap-2 flex-wrap">
          <Input value={novoNome} onChange={e => setNovoNome(e.target.value)}
            placeholder="Ex.: Taça bordeaux" className="h-9 flex-1 min-w-[200px]" />
          <div className="relative w-32 shrink-0">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">R$</span>
            <Input value={novoValor} onChange={e => setNovoValor(e.target.value.replace(/[^\d,]/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter' && novoNome.trim().length > 1) adicionar() }}
              placeholder="0,00" inputMode="decimal" className="h-9 pl-8 text-right" />
          </div>
          <Button onClick={adicionar} disabled={salvando || novoNome.trim().length < 2} className="gap-1.5 shrink-0">
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
          <p className="text-sm font-semibold text-gray-900">
            {itens.length} item{itens.length !== 1 ? 'ns' : ''}
            {itens.length > 0 && <span className="font-normal text-muted-foreground"> · soma {brl(total)}</span>}
          </p>
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item…"
            className="h-9 w-full sm:w-64" />
        </div>

        {filtrados.map(i => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-gray-50">
            <span className="flex-1 min-w-0 text-sm text-gray-900 break-words">{i.nome}</span>
            <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">{brl(i.valor)}</span>
            <button onClick={() => { setEditando(i); setNomeEdit(i.nome); setValorEdit(paraCampo(i.valor)); setErro(''); setAviso('') }}
              title="Editar" className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 shrink-0">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setRemovendo(i); setErro(''); setAviso('') }}
              title="Remover" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {filtrados.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {itens.length === 0
              ? 'Nenhum item cadastrado ainda. O lançamento de avarias continua aceitando item digitado na hora.'
              : 'Nenhum item encontrado.'}
          </p>
        )}
      </div>

      {/* Editar */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setEditando(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Editar item</h2>
              <button onClick={() => setEditando(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <Input value={nomeEdit} onChange={e => setNomeEdit(e.target.value)} className="h-9" />
            <div className="relative w-36">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">R$</span>
              <Input value={valorEdit} onChange={e => setValorEdit(e.target.value.replace(/[^\d,]/g, ''))}
                inputMode="decimal" className="h-9 pl-8 text-right" />
            </div>
            <p className="text-[12px] text-muted-foreground">
              Vale para os próximos lançamentos; avaria já lançada mantém o valor do dia.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditando(null)} disabled={salvando}>Cancelar</Button>
              <Button onClick={salvarEdicao} disabled={salvando || nomeEdit.trim().length < 2 || paraNumero(valorEdit) < 0}
                className="gap-1.5">
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
              Sai só da lista de preços. As avarias já lançadas com esse item continuam como estão.
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
