import { requireMaster } from '@/lib/auth-guard'
import { Banknote } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Exclusivo do Master: requireMaster() redireciona qualquer outro perfil,
// então a página não é acessível nem digitando a URL.
export default async function FolhaPagamentoPage() {
  await requireMaster()

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Banknote className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold leading-tight">Folha de pagamento</h1>
          <p className="text-sm text-muted-foreground">Acesso exclusivo do Master</p>
        </div>
      </div>

      {/* Placeholder — conteúdo será definido depois */}
      <div className="bg-white rounded-2xl border shadow-sm p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[300px]">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
          <Banknote className="w-7 h-7 text-gray-300" />
        </div>
        <p className="font-medium text-gray-600">Em construção</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Este espaço vai receber a folha de pagamento. O conteúdo será configurado em breve.
        </p>
      </div>
    </div>
  )
}
