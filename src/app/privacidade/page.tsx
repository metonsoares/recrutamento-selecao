import Link from 'next/link'

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen brand-gradient-soft px-5 py-10">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Voltar ao início
          </Link>
          <h1 className="text-xl font-bold text-foreground mt-3">
            Política de Privacidade
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Pesquisa Interna — Brownie do Ton · Vigente a partir de 01/05/2026
          </p>
        </div>

        {/* Controlador */}
        <section className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            1. Quem trata seus dados (Controlador)
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Brownie do Ton</strong><br />
            Responsável pelo tratamento: Administração da empresa<br />
            Contato para assuntos de privacidade:{' '}
            <a
              href="mailto:dados@browniedoton.com.br"
              className="text-primary underline"
            >
              dados@browniedoton.com.br
            </a>
          </p>
        </section>

        {/* Quais dados */}
        <section className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            2. Quais dados são coletados
          </h2>
          <ul className="text-sm text-muted-foreground space-y-1 leading-relaxed list-disc list-inside">
            <li>Nome completo</li>
            <li>Função/cargo na empresa</li>
            <li>Respostas ao questionário (incluindo textos abertos)</li>
            <li>Data e hora de envio</li>
          </ul>
        </section>

        {/* Finalidade */}
        <section className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            3. Para que os dados são usados (Finalidade)
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Os dados são utilizados exclusivamente para fins internos de gestão de
            pessoas, diagnóstico de cultura organizacional e melhoria do ambiente
            de trabalho no Brownie do Ton. Não são compartilhados com terceiros
            nem usados para fins comerciais.
          </p>
        </section>

        {/* Base legal */}
        <section className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            4. Base legal (LGPD, art. 7º)
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            O tratamento é realizado com base no{' '}
            <strong className="text-foreground">consentimento do titular</strong>{' '}
            (art. 7º, I da Lei nº 13.709/2018 — LGPD), manifestado de forma
            livre e informada ao marcar a caixa de consentimento na tela de
            identificação.
          </p>
        </section>

        {/* Retenção */}
        <section className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            5. Por quanto tempo os dados ficam armazenados
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Os dados serão mantidos por até{' '}
            <strong className="text-foreground">12 meses</strong> após o
            encerramento da pesquisa, prazo necessário para análise e acompanhamento
            dos planos de ação. Após esse período, serão anonimizados ou excluídos.
          </p>
        </section>

        {/* Direitos */}
        <section className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            6. Seus direitos como titular dos dados (LGPD, art. 18)
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Você tem direito a, a qualquer momento:
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 leading-relaxed list-disc list-inside">
            <li>Confirmar a existência de tratamento dos seus dados</li>
            <li>Acessar os dados que forneceu</li>
            <li>Solicitar correção de dados incompletos ou incorretos</li>
            <li>Solicitar a exclusão dos seus dados</li>
            <li>Revogar o consentimento</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mt-2">
            Para exercer qualquer um desses direitos, envie e-mail para{' '}
            <a
              href="mailto:dados@browniedoton.com.br"
              className="text-primary underline"
            >
              dados@browniedoton.com.br
            </a>{' '}
            informando seu nome e o direito que deseja exercer. Responderemos em
            até 15 dias úteis.
          </p>
        </section>

        {/* Segurança */}
        <section className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            7. Segurança dos dados
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Os dados são armazenados em servidor seguro com criptografia em
            trânsito (HTTPS/TLS) e em repouso. O acesso ao painel de resultados
            é restrito ao administrador autenticado.
          </p>
        </section>

        <p className="text-xs text-muted-foreground text-center pb-4">
          Brownie do Ton · dados@browniedoton.com.br
        </p>
      </div>
    </main>
  )
}
