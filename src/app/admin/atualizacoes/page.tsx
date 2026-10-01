import { History } from 'lucide-react'
import { getEffectiveRole } from '@/lib/portal-perfil'
import { portalBridge } from '@/lib/portal-bridge'
import type { Role } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * Atualizações — o diário do que mudou neste app, com data e hora.
 *
 * Os registros ficam em `public.atualizacoes` no Supabase do PORTAL, que é
 * outro projeto: quem lê é o servidor, pela Edge Function `recrutamento-bridge`
 * (IMPORT_TOKEN). Lá a RLS não serve para nós — o usuário do Portal não é o
 * usuário daqui —, então o papel é resolvido aqui e só o master pede também as
 * entradas marcadas como 'master'.
 */

interface Atualizacao {
  id: string
  titulo: string
  descricao: string
  publicado_em: string
  visibilidade: 'gestor' | 'master'
}

const FUSO = 'America/Sao_Paulo'

function diaChave(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: FUSO })
}

function diaRotulo(iso: string): string {
  const txt = new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: FUSO, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
}

/** Mesma regra dos outros apps: o diário é de quem gere o app. */
const PERFIS_DE_GESTAO: Role[] = ['master', 'admin', 'gestor', 'gestor_rh']

export default async function AtualizacoesPage() {
  const { role } = await getEffectiveRole()
  const podeVer = PERFIS_DE_GESTAO.includes(role)
  const resposta = podeVer
    ? await portalBridge<{ atualizacoes: Atualizacao[] }>('atualizacoes', { master: role === 'master' })
    : { atualizacoes: [] }
  const itens = resposta?.atualizacoes ?? []
  const indisponivel = resposta === null

  // Agrupa por dia, mantendo a ordem que veio (mais recente primeiro).
  const dias: { chave: string; rotulo: string; itens: Atualizacao[] }[] = []
  for (const a of itens) {
    const chave = diaChave(a.publicado_em)
    const ultimo = dias[dias.length - 1]
    if (ultimo && ultimo.chave === chave) ultimo.itens.push(a)
    else dias.push({ chave, rotulo: diaRotulo(a.publicado_em), itens: [a] })
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <History className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Atualizações</h1>
          <p className="text-sm text-muted-foreground">
            O que mudou no Banco de Talentos, do mais recente para o mais antigo.
          </p>
        </div>
      </div>

      {!podeVer && (
        <p className="rounded-2xl border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
          Esta página é para quem gere o app.
        </p>
      )}

      {podeVer && indisponivel && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          Não consegui falar com o Portal agora. Tente recarregar a página em instantes.
        </p>
      )}

      {podeVer && !indisponivel && dias.length === 0 && (
        <p className="rounded-2xl border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhuma atualização registrada ainda.
        </p>
      )}

      <div className="space-y-7">
        {dias.map(d => (
          <section key={d.chave}>
            <h2 className="mb-2.5 text-sm font-semibold text-muted-foreground">{d.rotulo}</h2>
            <ol className="space-y-2.5">
              {d.itens.map(a => (
                <li key={a.id} className="rounded-2xl border bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                    <time dateTime={a.publicado_em}>{hora(a.publicado_em)}</time>
                    {a.visibilidade === 'master' && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                        só master
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{a.titulo}</p>
                  {a.descricao && (
                    <p className="mt-1 text-[13px] text-gray-600 whitespace-pre-line">{a.descricao}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}
