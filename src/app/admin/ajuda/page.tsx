'use client'
import { useState, type ReactNode } from 'react'
import {
  ChevronDown, CircleHelp, ClipboardList, UserCheck, Users, FolderArchive,
  Banknote, BarChart3, BellRing, Settings2, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Ajuda — o manual do app, escrito para quem usa, não para quem programa.
 *
 * Seções que abrem e fecham: no celular o texto inteiro aberto vira rolagem
 * infinita e ninguém acha o que procura.
 */

function Secao({
  titulo, icon: Icone, inicial, children,
}: {
  titulo: string
  icon: LucideIcon
  inicial?: boolean
  children: ReactNode
}) {
  const [aberto, setAberto] = useState(!!inicial)
  return (
    <section className="rounded-2xl border bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5"
      >
        <Icone className="w-5 h-5 shrink-0 text-primary" />
        <span className="flex-1 text-[15px] font-bold text-gray-900">{titulo}</span>
        <ChevronDown className={cn('w-5 h-5 shrink-0 text-gray-400 transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <div className="space-y-2.5 px-4 pb-4 text-[13.5px] leading-relaxed text-gray-700 sm:px-5 sm:pb-5">
          {children}
        </div>
      )}
    </section>
  )
}

function Passo({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {n}
      </span>
      <p className="flex-1">{children}</p>
    </div>
  )
}

function T({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-gray-900">{children}</strong>
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-[13px] text-amber-900">
      {children}
    </p>
  )
}

export default function AjudaPage() {
  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <CircleHelp className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ajuda</h1>
          <p className="text-sm text-muted-foreground">
            Como o Banco de Talentos funciona, tela por tela. Abra o assunto que você precisa.
          </p>
        </div>
      </div>

      <Secao titulo="Entrar e quem vê o quê" icon={UserCheck} inicial>
        <p>
          O acesso vem do <T>Portal BDT</T>: quem abre o app pelo Portal entra direto, sem digitar
          senha de novo. O perfil de cada pessoa também é lido do Portal na hora — mudou lá, vale aqui
          na próxima tela aberta.
        </p>
        <p>
          <T>Master</T> vê tudo. <T>Administrador</T> acompanha o master nas telas, menos o que é
          exclusivo do dono. <T>Gestor RH</T> cuida de candidatos, colaboradores, fichas, documentos e
          relatórios. <T>Gestor</T> enxerga só os currículos e a agenda de entrevistas.
          <T> Operador</T> e <T>externo</T> não entram no painel.
        </p>
        <p>
          Se um menu não aparece para você, é o perfil — não é falha. Fale com o master para liberar.
        </p>
      </Secao>

      <Secao titulo="Currículos: do cadastro à entrevista" icon={ClipboardList}>
        <p>
          O candidato se cadastra pelo formulário público (o link de <T>Currículo</T>, que você pode
          divulgar). Tudo o que ele responde cai em <T>Currículos</T>.
        </p>
        <Passo n={1}>Abra <T>Currículos</T> e use a busca e os filtros para achar quem interessa.</Passo>
        <Passo n={2}>
          Na ficha do candidato você tem a <T>análise da IA</T>, o <T>teste cultural</T> e os checks
          (processos e auxílios) — cada um é um botão, e o resultado fica guardado ali.
        </Passo>
        <Passo n={3}>
          <T>Convidar para entrevista</T> envia a mensagem e marca na <T>Agenda de entrevistas</T>,
          com local e entrevistador.
        </Passo>
        <Passo n={4}>
          O <T>status</T> (em análise, aprovado, reprovado…) é o que move o candidato de lista. Aprovou?
          A aba <T>Ficha cadastral</T> abre para começar a admissão.
        </Passo>
        <p>
          As perguntas do formulário, as vagas e o teste cultural se configuram em
          <T> Currículos → Seções e perguntas</T>, <T>Vagas</T> e <T>Teste cultural</T>.
        </p>
      </Secao>

      <Secao titulo="Admissão: ficha, documentos e contrato" icon={Users}>
        <p>
          A <T>Ficha cadastral</T> é o cadastro completo da pessoa: endereço, documentos, empresa
          contratante, cargo, salário, data de admissão e contrato de experiência.
        </p>
        <Passo n={1}>
          Preencha os dados. O <T>cargo</T> é escolhido na lista oficial (quem cuida dela é
          <T> Configurações → Empresa → Cadastro de cargos</T>).
        </Passo>
        <Passo n={2}>
          Para os documentos, use o botão <T>Link de documentos</T>: ele gera um endereço para enviar
          à pessoa, que anexa do próprio celular. O link mostra <T>só o que falta</T> — nada mais da
          ficha — e avisa quando não há pendência.
        </Passo>
        <Passo n={3}>
          Documento que não se aplica (sem filhos, sem pensão…) tem o <T>Não aplicável</T>, para a
          ficha não ficar eternamente pendente.
        </Passo>
        <Passo n={4}>
          Com a ficha fechada, a lista de <T>Contratados</T> mostra <T>Ok</T>; enquanto faltar
          documento da pessoa ou da empresa, ela aparece como <T>pendente</T>.
        </Passo>
        <Aviso>
          Carteira de vacinação aceita um anexo por filho (até 4) e pensão alimentícia até 10 — cada
          arquivo conta como um item entregue.
        </Aviso>
      </Secao>

      <Secao titulo="Colaboradores: o que muda ao longo do contrato" icon={Users}>
        <p>
          Em <T>Colaboradores</T> estão as listas por situação: <T>Em contratação</T>,
          <T> Contratados</T>, <T>Intermitentes</T>, <T>Freelancers</T> e <T>Desligados</T>.
        </p>
        <p>Dentro de cada pessoa, nas abas:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li><T>Aumento de salário</T> — registra a data e o novo valor; os relatórios e a folha passam a usar o salário que vale naquela data.</li>
          <li><T>Mudança de função</T> — troca o cargo da ficha e guarda a linha do tempo (de onde saiu, para onde foi, quando).</li>
          <li><T>Transferir de empresa</T> — arquiva a ficha atual (que fica visível, só leitura) e segue com a nova; a data entra na linha do tempo.</li>
          <li><T>Férias</T>, <T>advertências</T>, <T>atestados</T>, <T>ASOs</T>, <T>contracheques</T> e <T>registros</T> — o histórico trabalhista da pessoa.</li>
        </ul>
        <Aviso>
          Desligar colaborador é só do <T>master</T> e do <T>gestor RH</T>. A carta de desligamento é
          opcional e pode ser anexada depois.
        </Aviso>
      </Secao>

      <Secao titulo="Documentos da empresa" icon={FolderArchive}>
        <p>
          <T>Documentos empresa</T> guarda os documentos por empresa, com data de validade. O sino
          avisa 7 dias antes de vencer — e continua avisando depois de vencido, até alguém resolver.
        </p>
        <p>
          Ali também ficam as <T>folhas analíticas</T> e os <T>templates de contrato</T> usados na
          impressão.
        </p>
      </Secao>

      <Secao titulo="Folha de pagamento" icon={Banknote}>
        <p>
          Todos os submenus abrem no <T>mês anterior</T> — que é o mês que se fecha. Dá para mudar a
          competência no alto da tela.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li><T>Fechamento</T> reúne tudo o que o mês acumulou e gera a folha; <T>Folhas aprovadas</T> guarda o que já foi fechado.</li>
          <li><T>Gorjetas</T>: aprovado o mês, a tela reabre mostrando o total apurado e o valor de cada pessoa, como foi aprovado.</li>
          <li><T>Faltas registradas</T>, <T>Vale transporte</T>, <T>Mensalidade sindical</T>, <T>Prêmio Caju</T> e os demais lançamentos entram por mês.</li>
        </ul>
        <Aviso>
          Quem está <T>sem data de admissão</T> não entra no fechamento — ainda está em contratação.
          Preencheu a data na ficha? Passa a entrar.
        </Aviso>
      </Secao>

      <Secao titulo="Relatórios e organograma" icon={BarChart3}>
        <p>
          <T>Relatórios</T> cruza os dados das fichas: salários (sempre o que vale hoje), aniversários,
          férias a vencer, documentos, admissões e desligamentos.
        </p>
        <p>
          O <T>Organograma</T> monta a estrutura a partir do cargo e da empresa de cada ficha — é mais
          um motivo para o cargo sair da lista oficial, e não de texto digitado à mão.
        </p>
      </Secao>

      <Secao titulo="Avisos do sino" icon={BellRing}>
        <p>O sino, no alto da barra lateral, junta cinco avisos:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>documentos enviados pela pessoa no link externo;</li>
          <li>férias chegando no limite (40 dias antes);</li>
          <li>documento da empresa vencendo (7 dias antes) ou já vencido;</li>
          <li>aniversário do colaborador, no dia;</li>
          <li>contrato de experiência vencendo (7 dias antes de cada etapa).</li>
        </ul>
        <p>
          Marcar como lida vale <T>só para você</T>: o aviso continua para os outros até cada um ler o
          seu.
        </p>
      </Secao>

      <Secao titulo="Preferências e novidades" icon={Settings2}>
        <p>
          No menu com o seu nome, no canto superior direito:
          <T> Modo tela preta</T> (vale neste aparelho), <T>Ajuda</T> (esta página),
          <T> Atualizações</T> (o que mudou no app, com data e hora) e <T>Sair</T>.
        </p>
        <p>
          Quando sai uma versão nova enquanto você está com a tela aberta, aparece um aviso embaixo
          com o botão <T>Atualizar</T>. Pode clicar: nada que você digitou e salvou se perde.
        </p>
      </Secao>
    </div>
  )
}
