import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function UsuariosPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Usuários Admin</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerenciamento de acesso ao painel</p>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-4">
        <p className="text-sm font-medium">Usuário atual</p>
        <p className="text-muted-foreground text-sm mt-1">{user?.email}</p>
        <p className="text-xs text-muted-foreground mt-1">ID: {user?.id}</p>
      </div>

      <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">Como adicionar administradores:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Acesse o painel do Supabase</li>
          <li>Vá em <strong>Authentication → Users</strong></li>
          <li>Clique em <strong>Invite User</strong></li>
          <li>Informe o e-mail do novo administrador</li>
          <li>O usuário receberá um link para criar a senha</li>
        </ol>
        <p className="text-xs">Todos os usuários autenticados têm acesso de administrador por padrão.</p>
      </div>
    </div>
  )
}
