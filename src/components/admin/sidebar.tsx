'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import {
  LayoutDashboard, Users, Briefcase, ClipboardList, Brain,
  MessageSquare, BarChart3, LogOut, ChevronDown,
  FlaskConical, Zap, Building2, Menu, X,
} from 'lucide-react'
import { useState } from 'react'

// ─── Estilos base dos itens ───────────────────────────────────────────────────

/** Item principal (Dashboard, Candidatos…) */
const NAV_BASE = 'flex items-center gap-2.5 px-3 h-9 w-full rounded-[6px] text-[16px] font-normal transition-colors'
const NAV_DEFAULT = 'text-[#333333] hover:bg-[#f0f0f0]'
const NAV_ACTIVE = 'bg-[#e6e6e6] text-[#1a1a1a] font-medium'

/** Item de primeiro nível dentro de Configurações */
const SUB_BASE = 'flex items-center gap-2.5 px-3 h-9 w-full rounded-[6px] text-[16px] font-normal transition-colors'
const SUB_DEFAULT = 'text-[#333333] hover:bg-[#f0f0f0]'
const SUB_ACTIVE = 'bg-[#e6e6e6] text-[#1a1a1a] font-medium'

/** Item de segundo nível (sub-submenu) */
const DEEP_BASE = 'flex items-center gap-2 px-2.5 h-8 w-full rounded-[6px] text-[14px] font-normal transition-colors'
const DEEP_DEFAULT = 'text-[#555555] hover:bg-[#f0f0f0]'
const DEEP_ACTIVE = 'bg-[#e6e6e6] text-[#1a1a1a]'

// ─── Navegação principal ──────────────────────────────────────────────────────

const navItems = [
  { href: '/admin',            label: 'Dashboard',          icon: LayoutDashboard },
  { href: '/admin/candidatos', label: 'Candidatos',          icon: Users },
  { href: '/admin/whatsapp',   label: 'Mensagens WhatsApp',  icon: MessageSquare },
  { href: '/admin/relatorios', label: 'Relatórios',           icon: BarChart3 },
]

// ─── SidebarContent ───────────────────────────────────────────────────────────

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()

  const inCurriculos =
    pathname.startsWith('/admin/formulario') ||
    pathname.startsWith('/admin/vagas') ||
    pathname.startsWith('/admin/teste-cultural')

  const inEmpresa =
    pathname.startsWith('/admin/configuracoes/empresa') ||
    pathname.startsWith('/admin/ia')

  const [curriculosOpen, setCurriculosOpen] = useState(inCurriculos)
  const [empresaOpen, setEmpresaOpen] = useState(inEmpresa)

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function go() { onNavClick?.() }

  return (
    <div className="flex flex-col h-full bg-white">

      {/* ── Marca ─────────────────────────────────────────────────── */}
      <div className="px-4 py-[14px] border-b border-[#e8e8e8]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1a1a1a] rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0 tracking-wide">
            BT
          </div>
          <div className="leading-tight">
            <p className="text-[14px] font-semibold text-[#333333]">Banco de Talentos</p>
            <p className="text-[12px] text-[#8a8a8a]">Brownie do Ton</p>
          </div>
        </div>
      </div>

      {/* ── Navegação ─────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">

        {/* Itens principais */}
        {navItems.map(item => {
          const Icon = item.icon
          const active = item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={go}
              className={cn(NAV_BASE, active ? NAV_ACTIVE : NAV_DEFAULT)}
            >
              <Icon className="w-[15px] h-[15px] shrink-0 opacity-60" />
              {item.label}
            </Link>
          )
        })}

        {/* ── Separador: Configurações ───────────────────────────── */}
        <div className="pt-4 pb-1 px-3">
          <span className="text-[11px] font-medium text-[#8a8a8a] uppercase tracking-widest select-none">
            Configurações
          </span>
        </div>

        {/* WhatsApp / Z-API */}
        <Link
          href="/admin/configuracoes/whatsapp"
          onClick={go}
          className={cn(
            SUB_BASE,
            pathname.startsWith('/admin/configuracoes/whatsapp') ? SUB_ACTIVE : SUB_DEFAULT,
          )}
        >
          <Zap className="w-[15px] h-[15px] shrink-0 opacity-60" />
          WhatsApp / Z-API
        </Link>

        {/* Empresa e Cultura ▾ */}
        <div>
          <button
            onClick={() => setEmpresaOpen(o => !o)}
            className={cn(SUB_BASE, inEmpresa ? SUB_ACTIVE : SUB_DEFAULT)}
          >
            <Building2 className="w-[15px] h-[15px] shrink-0 opacity-60" />
            <span className="flex-1 text-left">Empresa e Cultura</span>
            <ChevronDown
              className={cn(
                'w-[13px] h-[13px] shrink-0 opacity-40 transition-transform duration-200',
                empresaOpen && 'rotate-180',
              )}
            />
          </button>
          {empresaOpen && (
            <div className="ml-5 mt-0.5 space-y-0.5 pl-3 border-l border-[#e8e8e8]">
              <Link
                href="/admin/configuracoes/empresa"
                onClick={go}
                className={cn(
                  DEEP_BASE,
                  pathname === '/admin/configuracoes/empresa' ? DEEP_ACTIVE : DEEP_DEFAULT,
                )}
              >
                <Building2 className="w-3 h-3 shrink-0 opacity-50" />
                Dados da Empresa
              </Link>
              <Link
                href="/admin/ia"
                onClick={go}
                className={cn(
                  DEEP_BASE,
                  pathname.startsWith('/admin/ia') ? DEEP_ACTIVE : DEEP_DEFAULT,
                )}
              >
                <Brain className="w-3 h-3 shrink-0 opacity-50" />
                Configuração da IA
              </Link>
            </div>
          )}
        </div>

        {/* Config Currículos ▾ */}
        <div>
          <button
            onClick={() => setCurriculosOpen(o => !o)}
            className={cn(SUB_BASE, inCurriculos ? SUB_ACTIVE : SUB_DEFAULT)}
          >
            <ClipboardList className="w-[15px] h-[15px] shrink-0 opacity-60" />
            <span className="flex-1 text-left">Config Currículos</span>
            <ChevronDown
              className={cn(
                'w-[13px] h-[13px] shrink-0 opacity-40 transition-transform duration-200',
                curriculosOpen && 'rotate-180',
              )}
            />
          </button>
          {curriculosOpen && (
            <div className="ml-5 mt-0.5 space-y-0.5 pl-3 border-l border-[#e8e8e8]">
              <Link
                href="/admin/formulario"
                onClick={go}
                className={cn(
                  DEEP_BASE,
                  pathname.startsWith('/admin/formulario') ? DEEP_ACTIVE : DEEP_DEFAULT,
                )}
              >
                <ClipboardList className="w-3 h-3 shrink-0 opacity-50" />
                Perguntas
              </Link>
              <Link
                href="/admin/vagas"
                onClick={go}
                className={cn(
                  DEEP_BASE,
                  pathname.startsWith('/admin/vagas') ? DEEP_ACTIVE : DEEP_DEFAULT,
                )}
              >
                <Briefcase className="w-3 h-3 shrink-0 opacity-50" />
                Vagas
              </Link>
              <Link
                href="/admin/teste-cultural"
                onClick={go}
                className={cn(
                  DEEP_BASE,
                  pathname.startsWith('/admin/teste-cultural') ? DEEP_ACTIVE : DEEP_DEFAULT,
                )}
              >
                <FlaskConical className="w-3 h-3 shrink-0 opacity-50" />
                Teste Cultural
              </Link>
            </div>
          )}
        </div>

        {/* Usuários */}
        <Link
          href="/admin/configuracoes/usuarios"
          onClick={go}
          className={cn(
            SUB_BASE,
            pathname.startsWith('/admin/configuracoes/usuarios') ? SUB_ACTIVE : SUB_DEFAULT,
          )}
        >
          <Users className="w-[15px] h-[15px] shrink-0 opacity-60" />
          Usuários
        </Link>

      </nav>

      {/* ── Logout ────────────────────────────────────────────────── */}
      <div className="px-2 py-2 border-t border-[#e8e8e8]">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 h-9 w-full rounded-[6px] text-[16px] text-[#8a8a8a] hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <LogOut className="w-[15px] h-[15px] shrink-0" />
          Sair
        </button>
      </div>

    </div>
  )
}

// ─── AdminNav (mobile + desktop) ─────────────────────────────────────────────

export function AdminNav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Barra superior mobile — visível somente em < lg */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b border-[#e8e8e8] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-[#1a1a1a] rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0 tracking-wide">
            BT
          </div>
          <span className="text-[14px] font-semibold text-[#333333]">Banco de Talentos</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="p-2 rounded-[6px] text-[#555555] hover:bg-[#f0f0f0] transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Espaçador para a barra mobile */}
      <div className="lg:hidden h-14" />

      {/* Sidebar desktop — sempre visível em lg+ */}
      <aside className="hidden lg:flex w-64 min-h-screen bg-white border-r border-[#e8e8e8] flex-col fixed top-0 left-0 bottom-0 z-30">
        <SidebarContent />
      </aside>

      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Fundo escurecido */}
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <aside className="relative w-72 max-w-[85vw] bg-white border-r border-[#e8e8e8] flex flex-col h-full shadow-xl animate-in slide-in-from-left duration-200">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
              className="absolute top-3 right-3 p-1.5 rounded-[6px] text-[#555555] hover:bg-[#f0f0f0] transition-colors"
            >
              <X className="w-4 h-4" />
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
    <aside className="w-64 min-h-screen bg-white border-r border-[#e8e8e8] flex flex-col">
      <SidebarContent />
    </aside>
  )
}
