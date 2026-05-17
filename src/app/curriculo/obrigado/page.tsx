import Link from 'next/link'

export default function ObrigadoPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center space-y-6">

        {/* Brand pill */}
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-1.5 shadow-sm border border-green-100">
          <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
          <span className="text-sm font-semibold text-primary">Brownie do Ton</span>
        </div>

        {/* Success card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 space-y-4">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Currículo enviado com sucesso!
          </h1>
          <p className="text-muted-foreground leading-relaxed text-sm sm:text-base">
            Agradecemos seu interesse. Entraremos em contato em breve.
          </p>
          <div className="pt-2">
            <Link
              href="/curriculo"
              className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
            >
              ← Cadastrar outro currículo
            </Link>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Seus dados estão seguros e serão utilizados apenas para fins de recrutamento.
        </p>
      </div>
    </div>
  )
}
