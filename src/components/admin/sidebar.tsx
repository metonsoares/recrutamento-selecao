'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import {
  LayoutDashboard, Users, Briefcase, ClipboardList,
  MessageSquare, BarChart3, LogOut, ChevronDown,
  FlaskConical, Zap, Building2, Menu, X, Layers,
  Settings2, BrainCircuit, UserCheck, CalendarClock, UserMinus, FolderArchive, FileSignature, ShieldCheck, Plug, GraduationCap, Network, Banknote, Gift, Bus, FileSpreadsheet, CalendarX, Landmark, Coins,
} from 'lucide-react'

import { useState } from 'react'
import Image from 'next/image'
import { type Role } from '@/lib/permissions'

type UserRole = Role

// ─── Estilos base dos itens ───────────────────────────────────────────────────

const NAV_BASE = 'flex items-center gap-2.5 px-3 h-9 w-full rounded-[6px] text-[16px] font-normal transition-colors'
const NAV_DEFAULT = 'text-[#333333] hover:bg-[#f0f0f0]'
const NAV_ACTIVE = 'bg-[#e6e6e6] text-[#1a1a1a] font-medium'

const SUB_BASE = 'flex items-center gap-2.5 px-3 h-9 w-full rounded-[6px] text-[16px] font-normal transition-colors'
const SUB_DEFAULT = 'text-[#333333] hover:bg-[#f0f0f0]'
const SUB_ACTIVE = 'bg-[#e6e6e6] text-[#1a1a1a] font-medium'

const DEEP_BASE = 'flex items-center gap-2 px-2.5 h-8 w-full rounded-[6px] text-[14px] font-normal transition-colors'
const DEEP_DEFAULT = 'text-[#555555] hover:bg-[#f0f0f0]'
const DEEP_ACTIVE = 'bg-[#e6e6e6] text-[#1a1a1a]'

// ─── SidebarContent ───────────────────────────────────────────────────────────

function SidebarContent({
  onNavClick,
  logoUrl,
  companyName,
  role = 'master',
  perms = [],
}: {
  onNavClick?: () => void
  logoUrl?: string | null
  companyName?: string | null
  role?: UserRole
  perms?: string[]
}) {
  const pathname = usePathname()
  const router = useRouter()

  const permSet = new Set(perms)
  const can = (p: string) => permSet.has(p)
  const canAny = (ps: string[]) => ps.some(p => permSet.has(p))

  const isMaster = role === 'master'
  const isGestorRh = role === 'gestor_rh'
  // Atalhos de permissão
  const showCurriculosGroup = can('candidatos.ver') || can('agenda.ver') ||
    canAny(['curriculos.secoes', 'curriculos.vagas', 'curriculos.teste_cultural'])
  const showConfigCurriculosGroup = canAny(['curriculos.secoes', 'curriculos.vagas', 'curriculos.teste_cultural'])
  const showColaboradores = can('colaboradores.ver')
  const showPesquisasGroup = canAny(['pesquisas.cadastrar', 'pesquisas.resultados'])
  const showPlataformaGroup = canAny(['config.whatsapp', 'config.ia', 'config.empresa_cadastro', 'config.empresa_cultura', 'config.usuarios_perfil', 'config.usuarios_cadastro'])
  const showEmpresaGroup = canAny(['config.empresa_cadastro', 'config.empresa_cultura'])
  const showUsuariosGroup = canAny(['config.usuarios_perfil', 'config.usuarios_cadastro'])

  // ── Grupos ────────────────────────────────────────────────────────────────
  const COLAB_PATHS = ['/admin/candidatos/em-contrato', '/admin/candidatos/contratados', '/admin/candidatos/intermitentes', '/admin/candidatos/freelancers', '/admin/candidatos/desligados']
  const inColaboradores = COLAB_PATHS.some(p => pathname.startsWith(p))
  const inCurriculos = !inColaboradores && pathname.startsWith('/admin/candidatos')
  const inConfigCurriculos =
    pathname.startsWith('/admin/secoes') || pathname.startsWith('/admin/formulario') ||
    pathname.startsWith('/admin/vagas') || pathname.startsWith('/admin/teste-cultural')
  const inEmpresa =
    pathname.startsWith('/admin/configuracoes/empresa') ||
    pathname.startsWith('/admin/configuracoes/cadastro-empresa')
  const inUsuarios =
    pathname.startsWith('/admin/configuracoes/usuarios') ||
    pathname.startsWith('/admin/configuracoes/cadastrar-usuarios')
  const inPlataforma =
    pathname.startsWith('/admin/configuracoes/whatsapp') ||
    pathname.startsWith('/admin/configuracoes/ia') ||
    pathname.startsWith('/admin/configuracoes/integracoes') ||
    inEmpresa || inUsuarios

  const [curriculosOpen, setCurriculosOpen] = useState(inCurriculos || inConfigCurriculos)
  const [configCurriculosOpen, setConfigCurriculosOpen] = useState(inConfigCurriculos)
  const inPesquisas = pathname.startsWith('/admin/pesquisas-clima')
  const inTreinamentos = pathname.startsWith('/admin/treinamentos')
  const inFolha = pathname.startsWith('/admin/folha-pagamento')
  const inDocumentos = pathname.startsWith('/admin/documentos-empresa')
  const [colaboradoresOpen, setColaboradoresOpen] = useState(inColaboradores)
  const [pesquisasOpen, setPesquisasOpen] = useState(inPesquisas)
  const [treinamentosOpen, setTreinamentosOpen] = useState(inTreinamentos)
  const [folhaOpen, setFolhaOpen] = useState(inFolha)
  const [documentosOpen, setDocumentosOpen] = useState(inDocumentos)
  const [plataformaOpen, setPlataformaOpen] = useState(inPlataforma)
  const [empresaOpen, setEmpresaOpen] = useState(inEmpresa)
  const [usuariosOpen, setUsuariosOpen] = useState(inUsuarios)

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
          {logoUrl ? (
            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-[#e8e8e8] bg-white flex items-center justify-center">
              <Image
                src={logoUrl}
                alt={companyName || 'Logo'}
                width={32}
                height={32}
                className="object-contain w-full h-full"
                unoptimized
              />
            </div>
          ) : (
            <div className="w-8 h-8 bg-[#1a1a1a] rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0 tracking-wide">
              BT
            </div>
          )}
          <div className="leading-tight">
            <p className="text-[14px] font-semibold text-[#333333]">Banco de Talentos</p>
            <p className="text-[12px] text-[#8a8a8a]">{companyName || 'Brownie do Ton'}</p>
          </div>
        </div>
      </div>

      {/* ── Navegação ─────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">

        {/* Dashboard */}
        {can('dashboard.ver') && (
        <Link
          href="/admin"
          onClick={go}
          className={cn(NAV_BASE, pathname === '/admin' ? NAV_ACTIVE : NAV_DEFAULT)}
        >
          <LayoutDashboard className="w-[15px] h-[15px] shrink-0 opacity-60" />
          Dashboard
        </Link>
        )}

        {/* Currículos ▾ */}
        {showCurriculosGroup && (
        <div>
          <button onClick={() => setCurriculosOpen(o => !o)} className={cn(NAV_BASE, inCurriculos || inConfigCurriculos ? NAV_ACTIVE : NAV_DEFAULT)}>
            <ClipboardList className="w-[15px] h-[15px] shrink-0 opacity-60" />
            <span className="flex-1 text-left">Currículos</span>
            <ChevronDown className={cn('w-[13px] h-[13px] shrink-0 opacity-40 transition-transform duration-200', curriculosOpen && 'rotate-180')} />
          </button>
          {curriculosOpen && (
            <div className="ml-5 mt-0.5 space-y-0.5 pl-3 border-l border-[#e8e8e8]">
              {can('candidatos.ver') && (
              <Link href="/admin/candidatos" onClick={go} className={cn(DEEP_BASE, pathname === '/admin/candidatos' ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <Users className="w-3 h-3 shrink-0 opacity-50" />Candidatos
              </Link>
              )}
              {can('agenda.ver') && (
              <Link href="/admin/candidatos/agenda" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/candidatos/agenda') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <CalendarClock className="w-3 h-3 shrink-0 opacity-50" />Agenda de entrevistas
              </Link>
              )}
              {showConfigCurriculosGroup && (
                <div>
                  <button onClick={() => setConfigCurriculosOpen(o => !o)} className={cn(DEEP_BASE, inConfigCurriculos ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                    <Settings2 className="w-3 h-3 shrink-0 opacity-50" />
                    <span className="flex-1 text-left">Configurações</span>
                    <ChevronDown className={cn('w-3 h-3 shrink-0 opacity-40 transition-transform duration-200', configCurriculosOpen && 'rotate-180')} />
                  </button>
                  {configCurriculosOpen && (
                    <div className="ml-4 mt-0.5 space-y-0.5 pl-2.5 border-l border-[#e8e8e8]">
                      {can('curriculos.secoes') && (
                      <Link href="/admin/secoes" onClick={go} className={cn(DEEP_BASE, (pathname.startsWith('/admin/secoes') || pathname.startsWith('/admin/formulario')) ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                        <Layers className="w-3 h-3 shrink-0 opacity-50" />Seções e perguntas
                      </Link>
                      )}
                      {can('curriculos.vagas') && (
                      <Link href="/admin/vagas" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/vagas') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                        <Briefcase className="w-3 h-3 shrink-0 opacity-50" />Vagas
                      </Link>
                      )}
                      {can('curriculos.teste_cultural') && (
                      <Link href="/admin/teste-cultural" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/teste-cultural') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                        <FlaskConical className="w-3 h-3 shrink-0 opacity-50" />Teste cultural
                      </Link>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Colaboradores ▾ */}
        {showColaboradores && (
        <div>
          <button onClick={() => setColaboradoresOpen(o => !o)} className={cn(NAV_BASE, inColaboradores ? NAV_ACTIVE : NAV_DEFAULT)}>
            <UserCheck className="w-[15px] h-[15px] shrink-0 opacity-60" />
            <span className="flex-1 text-left">Colaboradores</span>
            <ChevronDown className={cn('w-[13px] h-[13px] shrink-0 opacity-40 transition-transform duration-200', colaboradoresOpen && 'rotate-180')} />
          </button>
          {colaboradoresOpen && (
            <div className="ml-5 mt-0.5 space-y-0.5 pl-3 border-l border-[#e8e8e8]">
              <Link href="/admin/candidatos/em-contrato" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/candidatos/em-contrato') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <FileSignature className="w-3 h-3 shrink-0 opacity-50" />Em contrato
              </Link>
              <Link href="/admin/candidatos/contratados" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/candidatos/contratados') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <UserCheck className="w-3 h-3 shrink-0 opacity-50" />Contratados
              </Link>
              <Link href="/admin/candidatos/intermitentes" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/candidatos/intermitentes') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <CalendarClock className="w-3 h-3 shrink-0 opacity-50" />Intermitentes
              </Link>
              <Link href="/admin/candidatos/freelancers" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/candidatos/freelancers') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <Briefcase className="w-3 h-3 shrink-0 opacity-50" />Freelancers
              </Link>
              <Link href="/admin/candidatos/desligados" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/candidatos/desligados') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <UserMinus className="w-3 h-3 shrink-0 opacity-50" />Desligados
              </Link>
            </div>
          )}
        </div>
        )}

        {/* Folha de pagamento ▾ — Master vê tudo; Gestor RH vê só Vale
            transporte, Faltas registradas e Mensalidade sindical. */}
        {(isMaster || isGestorRh) && (
        <div>
          <button onClick={() => setFolhaOpen(o => !o)} className={cn(NAV_BASE, inFolha ? NAV_ACTIVE : NAV_DEFAULT)}>
            <Banknote className="w-[15px] h-[15px] shrink-0 opacity-60" />
            <span className="flex-1 text-left">Folha de pagamento</span>
            <ChevronDown className={cn('w-[13px] h-[13px] shrink-0 opacity-40 transition-transform duration-200', folhaOpen && 'rotate-180')} />
          </button>
          {folhaOpen && (
            <div className="ml-5 mt-0.5 space-y-0.5 pl-3 border-l border-[#e8e8e8]">
              {isMaster && (
                <Link href="/admin/folha-pagamento/premio-caju" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/folha-pagamento/premio-caju') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                  <Gift className="w-3 h-3 shrink-0 opacity-50" />Prêmio Caju
                </Link>
              )}
              <Link href="/admin/folha-pagamento/vale-transporte" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/folha-pagamento/vale-transporte') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <Bus className="w-3 h-3 shrink-0 opacity-50" />Vale transporte
              </Link>
              <Link href="/admin/folha-pagamento/faltas" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/folha-pagamento/faltas') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <CalendarX className="w-3 h-3 shrink-0 opacity-50" />Faltas registradas
              </Link>
              <Link href="/admin/folha-pagamento/mensalidade-sindical" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/folha-pagamento/mensalidade-sindical') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <Landmark className="w-3 h-3 shrink-0 opacity-50" />Mensalidade sindical
              </Link>
              {isMaster && (
                <Link href="/admin/folha-pagamento/gorjetas" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/folha-pagamento/gorjetas') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                  <Coins className="w-3 h-3 shrink-0 opacity-50" />Gorjetas
                </Link>
              )}
              {isMaster && (
                <Link href="/admin/folha-pagamento/fechamento" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/folha-pagamento/fechamento') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                  <ClipboardList className="w-3 h-3 shrink-0 opacity-50" />Fechamento de folha
                </Link>
              )}
            </div>
          )}
        </div>
        )}

        {/* Organograma */}
        {can('organograma.ver') && (
        <Link href="/admin/organograma" onClick={go} className={cn(NAV_BASE, pathname.startsWith('/admin/organograma') ? NAV_ACTIVE : NAV_DEFAULT)}>
          <Network className="w-[15px] h-[15px] shrink-0 opacity-60" />
          Organograma
        </Link>
        )}

        {/* Treinamentos ▾ */}
        {can('treinamentos.ver') && (
        <div>
          <button onClick={() => setTreinamentosOpen(o => !o)} className={cn(NAV_BASE, inTreinamentos ? NAV_ACTIVE : NAV_DEFAULT)}>
            <GraduationCap className="w-[15px] h-[15px] shrink-0 opacity-60" />
            <span className="flex-1 text-left">Treinamentos</span>
            <ChevronDown className={cn('w-[13px] h-[13px] shrink-0 opacity-40 transition-transform duration-200', treinamentosOpen && 'rotate-180')} />
          </button>
          {treinamentosOpen && (
            <div className="ml-5 mt-0.5 space-y-0.5 pl-3 border-l border-[#e8e8e8]">
              <Link href="/admin/treinamentos/cadastrar" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/treinamentos/cadastrar') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <ClipboardList className="w-3 h-3 shrink-0 opacity-50" />Cadastrar treinamentos
              </Link>
              <Link href="/admin/treinamentos/relatorios" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/treinamentos/relatorios') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <BarChart3 className="w-3 h-3 shrink-0 opacity-50" />Relatórios de treinamentos
              </Link>
            </div>
          )}
        </div>
        )}

        {/* Pesquisas de clima ▾ */}
        {showPesquisasGroup && (
        <div>
          <button onClick={() => setPesquisasOpen(o => !o)} className={cn(NAV_BASE, inPesquisas ? NAV_ACTIVE : NAV_DEFAULT)}>
            <ClipboardList className="w-[15px] h-[15px] shrink-0 opacity-60" />
            <span className="flex-1 text-left">Pesquisas de clima</span>
            <ChevronDown className={cn('w-[13px] h-[13px] shrink-0 opacity-40 transition-transform duration-200', pesquisasOpen && 'rotate-180')} />
          </button>
          {pesquisasOpen && (
            <div className="ml-5 mt-0.5 space-y-0.5 pl-3 border-l border-[#e8e8e8]">
              {can('pesquisas.cadastrar') && (
              <Link href="/admin/pesquisas-clima/cadastrar" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/pesquisas-clima/cadastrar') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <ClipboardList className="w-3 h-3 shrink-0 opacity-50" />Cadastrar pesquisas
              </Link>
              )}
              {can('pesquisas.resultados') && (
              <Link href="/admin/pesquisas-clima/resultados" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/pesquisas-clima/resultados') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <BarChart3 className="w-3 h-3 shrink-0 opacity-50" />Ver resultados
              </Link>
              )}
            </div>
          )}
        </div>
        )}

        {/* Documentos empresa ▾ */}
        {can('documentos_empresa') && (
        <div>
          <button onClick={() => setDocumentosOpen(o => !o)} className={cn(NAV_BASE, inDocumentos ? NAV_ACTIVE : NAV_DEFAULT)}>
            <FolderArchive className="w-[15px] h-[15px] shrink-0 opacity-60" />
            <span className="flex-1 text-left">Documentos empresa</span>
            <ChevronDown className={cn('w-[13px] h-[13px] shrink-0 opacity-40 transition-transform duration-200', documentosOpen && 'rotate-180')} />
          </button>
          {documentosOpen && (
            <div className="ml-5 mt-0.5 space-y-0.5 pl-3 border-l border-[#e8e8e8]">
              <Link href="/admin/documentos-empresa" onClick={go} className={cn(DEEP_BASE, pathname === '/admin/documentos-empresa' ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <FolderArchive className="w-3 h-3 shrink-0 opacity-50" />Documentos da empresa
              </Link>
              <Link href="/admin/documentos-empresa/folhas-analiticas" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/documentos-empresa/folhas-analiticas') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                <FileSpreadsheet className="w-3 h-3 shrink-0 opacity-50" />Folhas analíticas
              </Link>
              {isMaster && (
                <Link href="/admin/documentos-empresa/templates" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/documentos-empresa/templates') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                  <FileSignature className="w-3 h-3 shrink-0 opacity-50" />Templates de contrato
                </Link>
              )}
            </div>
          )}
        </div>
        )}

        {can('whatsapp.ver') && (
          <Link href="/admin/whatsapp" onClick={go} className={cn(NAV_BASE, pathname.startsWith('/admin/whatsapp') ? NAV_ACTIVE : NAV_DEFAULT)}>
            <MessageSquare className="w-[15px] h-[15px] shrink-0 opacity-60" />
            Mensagens WhatsApp
          </Link>
        )}

        {can('relatorios.ver') && (
          <Link href="/admin/relatorios" onClick={go} className={cn(NAV_BASE, pathname.startsWith('/admin/relatorios') ? NAV_ACTIVE : NAV_DEFAULT)}>
            <BarChart3 className="w-[15px] h-[15px] shrink-0 opacity-60" />
            Relatórios
          </Link>
        )}

        {isMaster && (
          <Link href="/admin/auditoria" onClick={go} className={cn(NAV_BASE, pathname.startsWith('/admin/auditoria') ? NAV_ACTIVE : NAV_DEFAULT)}>
            <ShieldCheck className="w-[15px] h-[15px] shrink-0 opacity-60" />
            Auditoria
          </Link>
        )}

        {/* ── Configurações da plataforma ── */}
        {showPlataformaGroup && (
          <>
            {/* ── Separador: Configurações ─────────────────────── */}
            <div className="pt-4 pb-1 px-3">
              <span className="text-[11px] font-medium text-[#8a8a8a] uppercase tracking-widest select-none">
                Configurações
              </span>
            </div>

            {/* Configurações da plataforma ▾ */}
            <div>
              <button onClick={() => setPlataformaOpen(o => !o)} className={cn(SUB_BASE, inPlataforma ? SUB_ACTIVE : SUB_DEFAULT)}>
                <Settings2 className="w-[15px] h-[15px] shrink-0 opacity-60" />
                <span className="flex-1 text-left">Configurações da plataforma</span>
                <ChevronDown className={cn('w-[13px] h-[13px] shrink-0 opacity-40 transition-transform duration-200', plataformaOpen && 'rotate-180')} />
              </button>
              {plataformaOpen && (
                <div className="ml-5 mt-0.5 space-y-0.5 pl-3 border-l border-[#e8e8e8]">
                  {can('config.whatsapp') && (
                  <Link href="/admin/configuracoes/whatsapp" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/configuracoes/whatsapp') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                    <Zap className="w-3 h-3 shrink-0 opacity-50" />WhatsApp / Z-API
                  </Link>
                  )}
                  {can('config.ia') && (
                  <Link href="/admin/configuracoes/ia" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/configuracoes/ia') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                    <BrainCircuit className="w-3 h-3 shrink-0 opacity-50" />Configuração IA
                  </Link>
                  )}
                  {isMaster && (
                  <Link href="/admin/configuracoes/integracoes" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/configuracoes/integracoes') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                    <Plug className="w-3 h-3 shrink-0 opacity-50" />Integrações
                  </Link>
                  )}

                  {/* Empresa ▾ */}
                  {showEmpresaGroup && (
                  <div>
                    <button onClick={() => setEmpresaOpen(o => !o)} className={cn(DEEP_BASE, inEmpresa ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                      <Building2 className="w-3 h-3 shrink-0 opacity-50" />
                      <span className="flex-1 text-left">Empresa</span>
                      <ChevronDown className={cn('w-3 h-3 shrink-0 opacity-40 transition-transform duration-200', empresaOpen && 'rotate-180')} />
                    </button>
                    {empresaOpen && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-2.5 border-l border-[#e8e8e8]">
                        {can('config.empresa_cadastro') && (
                        <Link href="/admin/configuracoes/cadastro-empresa" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/configuracoes/cadastro-empresa') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                          <Building2 className="w-3 h-3 shrink-0 opacity-50" />Cadastro de empresa
                        </Link>
                        )}
                        {can('config.empresa_cultura') && (
                        <Link href="/admin/configuracoes/empresa" onClick={go} className={cn(DEEP_BASE, pathname === '/admin/configuracoes/empresa' ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                          <Building2 className="w-3 h-3 shrink-0 opacity-50" />Cultura da empresa
                        </Link>
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Usuários ▾ */}
                  {showUsuariosGroup && (
                  <div>
                    <button onClick={() => setUsuariosOpen(o => !o)} className={cn(DEEP_BASE, inUsuarios ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                      <Users className="w-3 h-3 shrink-0 opacity-50" />
                      <span className="flex-1 text-left">Usuários</span>
                      <ChevronDown className={cn('w-3 h-3 shrink-0 opacity-40 transition-transform duration-200', usuariosOpen && 'rotate-180')} />
                    </button>
                    {usuariosOpen && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-2.5 border-l border-[#e8e8e8]">
                        {can('config.usuarios_perfil') && (
                        <Link href="/admin/configuracoes/usuarios" onClick={go} className={cn(DEEP_BASE, pathname.startsWith('/admin/configuracoes/usuarios') ? DEEP_ACTIVE : DEEP_DEFAULT)}>
                          <UserCheck className="w-3 h-3 shrink-0 opacity-50" />Perfil de usuário
                        </Link>
                        )}
                      </div>
                    )}
                  </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

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

export function AdminNav({
  logoUrl,
  companyName,
  role,
  perms = [],
}: {
  logoUrl?: string | null
  companyName?: string | null
  role?: UserRole
  perms?: string[]
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b border-[#e8e8e8] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 border border-[#e8e8e8] bg-white flex items-center justify-center">
              <Image src={logoUrl} alt={companyName || 'Logo'} width={28} height={28} className="object-contain w-full h-full" unoptimized />
            </div>
          ) : (
            <div className="w-7 h-7 bg-[#1a1a1a] rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0 tracking-wide">
              BT
            </div>
          )}
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

      <div className="lg:hidden h-14" />

      <aside className="hidden lg:flex w-72 min-h-screen bg-white border-r border-[#e8e8e8] flex-col fixed top-0 left-0 bottom-0 z-30">
        <SidebarContent logoUrl={logoUrl} companyName={companyName} role={role} perms={perms} />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="relative w-72 max-w-[85vw] bg-white border-r border-[#e8e8e8] flex flex-col h-full shadow-xl animate-in slide-in-from-left duration-200">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
              className="absolute top-3 right-3 p-1.5 rounded-[6px] text-[#555555] hover:bg-[#f0f0f0] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent onNavClick={() => setMobileOpen(false)} logoUrl={logoUrl} companyName={companyName} role={role} perms={perms} />
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
