'use client'
import { MessageCircle, CheckCircle2, AlertCircle, ExternalLink, Info } from 'lucide-react'
import { formatDateTime } from '@/lib/helpers'
import {
  NUMERO_OFICIAL, TEMPLATE_CONVITE, TEMPLATE_REINICIAR, TEMPLATE_TESTE_CULTURA,
} from '@/lib/whatsapp-modelos'

/**
 * Painel do WhatsApp — só leitura.
 *
 * A Z-API saiu em 10/11/2026. Quem envia é o número oficial da empresa,
 * cadastrado no Portal BDT (Configurações → WhatsApp de lá). Aqui não há
 * credencial para digitar: se houvesse, existiriam duas verdades sobre o
 * mesmo número.
 */

interface Log {
  id: string
  direction: string | null
  action: string | null
  phone: string | null
  message: string | null
  status: string | null
  created_at: string
}

const MODELOS = [
  {
    nome: TEMPLATE_CONVITE,
    quando: 'Aviso de que o currículo chegou (botão na ficha do candidato).',
  },
  {
    nome: TEMPLATE_REINICIAR,
    quando: 'A equipe retoma a conversa com o candidato depois de 24h, pelo app Atendimento.',
  },
  {
    nome: TEMPLATE_TESTE_CULTURA,
    quando: 'Link do teste cultural. Ainda não foi criado na Meta — enquanto isso o link é copiado à mão.',
    pendente: true,
  },
]

export function PainelWhatsApp({ logs }: { logs: Log[] }) {
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          As mensagens saem pelo número oficial do Brownie do Ton.
        </p>
      </div>

      <section className="bg-white border rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tracking-tight">{NUMERO_OFICIAL}</span>
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            <CheckCircle2 className="w-3 h-3" />WhatsApp oficial (Meta)
          </span>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          É o mesmo número do atendimento da empresa. O candidato responde ali, e a resposta
          chega para a equipe no <strong>app Atendimento</strong> do Portal — não nesta tela.
        </p>
        <a
          href="https://portal.browniedoton.com.br/admin/configuracoes/whatsapp"
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline mt-3"
        >
          Abrir a configuração no Portal <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </section>

      <section className="bg-white border rounded-xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold mb-1">Modelos de mensagem</h2>
        <p className="text-[12.5px] text-gray-600 mb-3 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
          A Meta só deixa a empresa começar uma conversa com um modelo aprovado por ela.
          Texto escrito na hora só vale nas 24 horas seguintes a uma mensagem do candidato.
        </p>
        <ul className="divide-y">
          {MODELOS.map(m => (
            <li key={m.nome} className="py-2.5 flex items-start gap-2">
              {m.pendente
                ? <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                : <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />}
              <div>
                <p className="text-[13px] font-medium">{m.nome}</p>
                <p className="text-[12px] text-gray-600">{m.quando}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white border rounded-xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold mb-3">Últimos envios</h2>
        {logs.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nada enviado por enquanto.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-[11px] uppercase text-gray-500">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">Quando</th>
                  <th className="py-2 pr-3 font-medium">Para</th>
                  <th className="py-2 pr-3 font-medium">O quê</th>
                  <th className="py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map(l => (
                  <tr key={l.id}>
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-600">{formatDateTime(l.created_at)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{l.phone ?? '—'}</td>
                    <td className="py-2 pr-3 max-w-[320px] truncate" title={l.message ?? ''}>
                      {l.message ?? l.action ?? '—'}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      {l.status === 'sent'
                        ? <span className="text-green-700">enviada</span>
                        : <span className="text-red-600">não saiu</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
