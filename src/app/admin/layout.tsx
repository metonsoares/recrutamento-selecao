// Layout compartilhado para todas as páginas /admin
// A proteção de rota é feita no proxy.ts (Next.js 16 Proxy)
// Páginas individuais fazem sua própria verificação quando precisam de dados admin

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-muted">
      {children}
    </div>
  )
}
