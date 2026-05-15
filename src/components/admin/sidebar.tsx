'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import {
  LayoutDashboard, Users, Briefcase, ClipboardList, Brain,
  MessageSquare, BarChart3, Settings, LogOut, ChevronDown,
  FlaskConical, Zap, Building2,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/candidatos', label: 'Candidatos', icon: Users },
  { href: '/admin/vagas', label: 'Vagas', icon: Briefcase },
  { href: '/admin/formulario', label: 'Formulário de Experiência', icon: ClipboardList },
  { href: '/admin/teste-cultural', label: 'Teste Cultural', icon: FlaskConical },
  { href: '/admin/ia', label: 'Configuração da IA', icon: Brain },
  { href: '/admin/whatsapp', label: 'Mensagens WhatsApp', icon: MessageSquare },
  { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
]

const settingsItems = [
  { href: '/admin/configuracoes/whatsapp', label: 'WhatsApp / Z-API', icon: Zap },
  { href: '/admin/configuracoes/empresa', label: 'Empresa e Cultura', icon: Building2 },
  { href: '/admin/configuracoes/usuarios', label: 'Usuários Admin', icon: Users },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [settingsOpen, setSettingsOpen] = useState(
    pathname.startsWith('/admin/configuracoes')
  )

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-64 min-h-screen bg-sidebar flex flex-col">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sidebar-primary rounded-xl flex items-center justify-center text-sm font-bold text-sidebar-primary-foreground">
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

        <div>
          <button
            onClick={() => setSettingsOpen(o => !o)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith('/admin/configuracoes')
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
              {settingsItems.map(item => {
                const Icon = item.icon
                const active = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors',
                      active
                        ? 'text-sidebar-primary font-medium'
                        : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
                    )}
                  >
                    <Icon className="w-3 h-3 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}
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
    </aside>
  )
}
