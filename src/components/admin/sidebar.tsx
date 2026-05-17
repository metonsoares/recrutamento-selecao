'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import {
  LayoutDashboard, Users, Briefcase, ClipboardList, Brain,
  MessageSquare, BarChart3, Settings, LogOut, ChevronDown,
  FlaskConical, Zap, Building2, Menu, X,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/candidatos', label: 'Candidatos', icon: Users },
  { href: '/admin/whatsapp', label: 'Mensagens WhatsApp', icon: MessageSquare },
  { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
]

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()

  const inSettings =
    pathname.startsWith('/admin/configuracoes') ||
    pathname.startsWith('/admin/formulario') ||
    pathname.startsWith('/admin/vagas') ||
    pathname.startsWith('/admin/teste-cultural') ||
    pathname.startsWith('/admin/ia')

  const inCurriculos =
    pathname.startsWith('/admin/formulario') ||
    pathname.startsWith('/admin/vagas') ||
    pathname.startsWith('/admin/teste-cultural')

  const inEmpresa =
    pathname.startsWith('/admin/configuracoes/empresa') ||
    pathname.startsWith('/admin/ia')

  const [settingsOpen, setSettingsOpen] = useState(inSettings)
  const [curriculosOpen, setCurriculosOpen] = useState(inCurriculos)
  const [empresaOpen, setEmpresaOpen] = useState(inEmpresa)

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function handleLink() {
    onNavClick?.()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sidebar-primary rounded-xl flex items-center justify-center text-sm font-bold text-sidebar-primary-foreground shrink-0">
            BT
          </div>
          <div>
            <p className="text-sidebar-foreground font-semibold text-sm leading-tight">Banco de Talentos</p>
            <p className="text-sidebar-foreground/60 text-xs">Brownie do Ton</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon
          const active = item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleLink}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}

        {/* Configurações */}
        <div>
          <button
            onClick={() => setSettingsOpen(o => !o)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              inSettings
                ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Configurações</span>
            <ChevronDown className={cn('w-3 h-3 transition-transform', settingsOpen && 'rotate-180')} />
          </button>

          {settingsOpen && (
            <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-3">

              {/* WhatsApp */}
              <Link
                href="/admin/configuracoes/whatsapp"
                onClick={handleLink}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors',
                  pathname.startsWith('/admin/configuracoes/whatsapp')
                    ? 'text-sidebar-primary font-medium'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
                )}
              >
                <Zap className="w-3 h-3 shrink-0" />
                WhatsApp / Z-API
              </Link>

              {/* Empresa e Cultura (expansível) */}
              <div>
                <button
                  onClick={() => setEmpresaOpen(o => !o)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors',
                    inEmpresa
                      ? 'text-sidebar-primary font-medium'
                      : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
                  )}
                >
                  <Building2 className="w-3 h-3 shrink-0" />
                  <span className="flex-1 text-left">Empresa e Cultura</span>
                  <ChevronDown className={cn('w-3 h-3 transition-transform', empresaOpen && 'rotate-180')} />
                </button>
                {empresaOpen && (
                  <div className="ml-3 mt-1 space-y-1 border-l border-sidebar-border pl-3">
                    <Link
                      href="/admin/configuracoes/empresa"
                      onClick={handleLink}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors',
                        pathname === '/admin/configuracoes/empresa'
                          ? 'text-sidebar-primary font-medium'
                          : 'text-sidebar-foreground/50 hover:text-sidebar-foreground'
                      )}
                    >
                      <Building2 className="w-3 h-3 shrink-0" />
                      Dados da Empresa
                    </Link>
                    <Link
                      href="/admin/ia"
                      onClick={handleLink}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors',
                        pathname.startsWith('/admin/ia')
                          ? 'text-sidebar-primary font-medium'
                          : 'text-sidebar-foreground/50 hover:text-sidebar-foreground'
                      )}
                    >
                      <Brain className="w-3 h-3 shrink-0" />
                      Configuração da IA
                    </Link>
                  </div>
                )}
              </div>

              {/* Config Currículos (expansível) */}
              <div>
                <button
                  onClick={() => setCurriculosOpen(o => !o)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors',
                    inCurriculos
                      ? 'text-sidebar-primary font-medium'
                      : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
                  )}
                >
                  <ClipboardList className="w-3 h-3 shrink-0" />
                  <span className="flex-1 text-left">Config Currículos</span>
                  <ChevronDown className={cn('w-3 h-3 transition-transform', curriculosOpen && 'rotate-180')} />
                </button>
                {curriculosOpen && (
                  <div className="ml-3 mt-1 space-y-1 border-l border-sidebar-border pl-3">
                    <Link
                      href="/admin/formulario"
                      onClick={handleLink}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors',
                        pathname.startsWith('/admin/formulario')
                          ? 'text-sidebar-primary font-medium'
                          : 'text-sidebar-foreground/50 hover:text-sidebar-foreground'
                      )}
                    >
                      <ClipboardList className="w-3 h-3 shrink-0" />
                      Perguntas
                    </Link>
                    <Link
                      href="/admin/vagas"
                      onClick={handleLink}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors',
                        pathname.startsWith('/admin/vagas')
                          ? 'text-sidebar-primary font-medium'
                          : 'text-sidebar-foreground/50 hover:text-sidebar-foreground'
                      )}
                    >
                      <Briefcase className="w-3 h-3 shrink-0" />
                      Vagas
                    </Link>
                    <Link
                      href="/admin/teste-cultural"
                      onClick={handleLink}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors',
                        pathname.startsWith('/admin/teste-cultural')
                          ? 'text-sidebar-primary font-medium'
                          : 'text-sidebar-foreground/50 hover:text-sidebar-foreground'
                      )}
                    >
                      <FlaskConical className="w-3 h-3 shrink-0" />
                      Teste Cultural
                    </Link>
                  </div>
                )}
              </div>

              {/* Usuários Admin */}
              <Link
                href="/admin/configuracoes/usuarios"
                onClick={handleLink}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors',
                  pathname.startsWith('/admin/configuracoes/usuarios')
                    ? 'text-sidebar-primary font-medium'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
                )}
              >
                <Users className="w-3 h-3 shrink-0" />
                Usuários
              </Link>

            </div>
          )}
        </div>
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-red-900/30 hover:text-red-300 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sair
        </button>
      </div>
    </div>
  )
}

export function AdminNav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile top header — visible only on < lg */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-sidebar flex items-center justify-between px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground shrink-0">
            BT
          </div>
          <span className="text-sidebar-foreground font-semibold text-sm">Banco de Talentos</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="p-2 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {/* Spacer for mobile header */}
      <div className="lg:hidden h-14" />

      {/* Desktop sidebar — always visible on lg+ */}
      <aside className="hidden lg:flex w-64 min-h-screen bg-sidebar flex-col fixed top-0 left-0 bottom-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <aside className="relative w-72 max-w-[85vw] bg-sidebar flex flex-col h-full shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Close button */}
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
              className="absolute top-3 right-3 p-1.5 rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  )
}

/** @deprecated Use AdminNav instead */
export function Sidebar() {
  return (
    <aside className="w-64 min-h-screen bg-sidebar flex flex-col">
      <SidebarContent />
    </aside>
  )
}
