import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}

const PAGE_LABELS: [RegExp, string][] = [
  [/^\/admin\/?$/, 'Acessou o Dashboard'],
  [/^\/admin\/candidatos\/agenda/, 'Acessou Agenda de entrevistas'],
  [/^\/admin\/candidatos\/contratados/, 'Acessou Colaboradores: Contratados'],
  [/^\/admin\/candidatos\/em-contrato/, 'Acessou Colaboradores: Em contrato'],
  [/^\/admin\/candidatos\/intermitentes/, 'Acessou Colaboradores: Intermitentes'],
  [/^\/admin\/candidatos\/freelancers/, 'Acessou Colaboradores: Freelancers'],
  [/^\/admin\/candidatos\/desligados/, 'Acessou Colaboradores: Desligados'],
  [/^\/admin\/candidatos\/[^/]+\/pesquisa\//, 'Abriu resultado de pesquisa de um candidato'],
  [/^\/admin\/candidatos\/[0-9a-f-]{36}/, 'Abriu ficha de candidato'],
  [/^\/admin\/candidatos\/?$/, 'Acessou Candidatos'],
  [/^\/admin\/pesquisas-clima\/cadastrar/, 'Acessou Cadastrar pesquisas de clima'],
  [/^\/admin\/pesquisas-clima\/resultados/, 'Acessou Resultados de pesquisas de clima'],
  [/^\/admin\/folha-pagamento\/premio-caju/, 'Acessou Folha de pagamento: Prêmio Caju'],
  [/^\/admin\/folha-pagamento\/vale-transporte/, 'Acessou Folha de pagamento: Vale transporte'],
  [/^\/admin\/folha-pagamento\/faltas/, 'Acessou Folha de pagamento: Faltas registradas'],
  [/^\/admin\/folha-pagamento\/mensalidade-sindical/, 'Acessou Folha de pagamento: Mensalidade sindical'],
  [/^\/admin\/folha-pagamento/, 'Acessou Folha de pagamento'],
  [/^\/admin\/documentos-empresa\/folhas-analiticas/, 'Acessou Documentos: Folhas analíticas'],
  [/^\/admin\/documentos-empresa/, 'Acessou Documentos da empresa'],
  [/^\/admin\/whatsapp/, 'Acessou Mensagens WhatsApp'],
  [/^\/admin\/relatorios/, 'Acessou Relatórios'],
  [/^\/admin\/secoes/, 'Acessou Seções e perguntas'],
  [/^\/admin\/formulario/, 'Acessou Formulário'],
  [/^\/admin\/vagas/, 'Acessou Vagas'],
  [/^\/admin\/teste-cultural/, 'Acessou Teste cultural'],
  [/^\/admin\/configuracoes\/whatsapp/, 'Acessou Configurações: WhatsApp / Z-API'],
  [/^\/admin\/configuracoes\/ia/, 'Acessou Configurações: IA'],
  [/^\/admin\/configuracoes\/cadastro-empresa/, 'Acessou Configurações: Cadastro de empresa'],
  [/^\/admin\/configuracoes\/empresa/, 'Acessou Configurações: Cultura da empresa'],
  [/^\/admin\/configuracoes\/usuarios/, 'Acessou Configurações: Perfil de usuário'],
  [/^\/admin\/configuracoes\/cadastrar-usuarios/, 'Acessou Configurações: Cadastro de usuários'],
  [/^\/admin\/configuracoes\/kanban-colunas/, 'Acessou Configurações: Colunas do Kanban'],
]

const API_LABELS: [RegExp, string][] = [
  [/\/candidatos\/[^/]+\/interview-invite/, 'Enviou convite de entrevista'],
  [/\/candidatos\/[^/]+\/invite-interview/, 'Enviou convite de entrevista'],
  [/\/candidatos\/[^/]+\/records/, 'Registro do colaborador'],
  [/\/candidatos\/[^/]+\/salary-raises/, 'Aumento de salário do colaborador'],
  [/\/candidatos\/[^/]+\/transfer-company/, 'Transferência de empresa (ficha arquivada)'],
  [/\/candidatos\/[^/]+\/climate-assignments/, 'Pesquisa de clima na ficha'],
  [/\/candidatos\/[^/]+\/admission-docs/, 'Anexou/alterou documento de candidato'],
  [/\/candidatos\/[^/]+\/background-check/, 'Executou Check de Processos'],
  [/\/candidatos\/[^/]+\/desligar/, 'Desligou colaborador'],
  [/\/candidatos\/[^/]+\/status/, 'Alterou status de candidato'],
  [/\/candidatos\/[^/]+$/, 'Atualizou/Excluiu candidato'],
  [/\/ai\/analyze-candidate/, 'Rodou análise de IA'],
  [/\/climate-surveys\/[^/]+\/responses\//, 'Removeu resposta de pesquisa'],
  [/\/climate-surveys\/[^/]+/, 'Editou/Removeu pesquisa de clima'],
  [/\/climate-surveys/, 'Criou pesquisa de clima'],
  [/\/interviews\/locations/, 'Configurou locais de entrevista'],
  [/\/interviews\/interviewers/, 'Configurou entrevistadores'],
  [/\/interviews/, 'Agendamento de entrevista'],
  [/\/company-files/, 'Documento da empresa'],
  [/\/(system-users|usuarios)/, 'Gerenciou usuários'],
  [/\/zapi/, 'Alterou configuração de WhatsApp'],
  [/\/ai\//, 'Alterou configuração de IA'],
]

function describe(method: string, pathname: string, isPage: boolean): string {
  if (isPage) {
    for (const [re, label] of PAGE_LABELS) if (re.test(pathname)) return label
    return `Acessou ${pathname}`
  }
  const verb = method === 'POST' ? 'Criou' : method === 'DELETE' ? 'Removeu' : 'Atualizou'
  for (const [re, label] of API_LABELS) if (re.test(pathname)) return label
  return `${verb} (${pathname})`
}

/**
 * Rotas `/api/admin/**` chamadas servidor-a-servidor (sem cookie de sessão):
 * `analyze-candidate` é disparada em fire-and-forget pelos formulários PÚBLICOS
 * (curriculo, culture-test) e pelo analyze-pending. Liberadas do gate de login
 * aqui; serão protegidas por um segredo interno na Fase 2.
 */
const INTERNAL_ALLOW = ['/api/admin/ai/analyze-candidate']

type ProxyUser = { id: string; email?: string | null } | null

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const res = NextResponse.next()

  // Resolve o usuário uma vez — usado para o GATE de auth e para a auditoria.
  let user: ProxyUser = null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (url && anon) {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          )
        },
      },
    })
    const { data } = await supabase.auth.getUser()
    user = data.user
  }

  // --- Fase 1: gate de autenticação das APIs administrativas ---
  // Bloqueia qualquer /api/admin/** sem usuário logado (exceto rotas internas).
  const isAdminApi = pathname.startsWith('/api/admin')
  const isInternal = INTERNAL_ALLOW.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  )
  if (isAdminApi && !isInternal && !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  // --- Auditoria (best-effort, nunca bloqueia a resposta) ---
  try {
    await logActivity(req, user)
  } catch {
    /* nunca bloqueia a resposta */
  }

  return res
}

async function logActivity(req: NextRequest, user: ProxyUser) {
  if (!user) return

  const pathname = req.nextUrl.pathname
  const method = req.method

  // ignora o próprio módulo de auditoria, o heartbeat de presença (1 POST a
  // cada ~45s por usuário — poluiria o audit_logs) e prefetch do Next
  if (pathname.startsWith('/admin/auditoria') || pathname.startsWith('/api/admin/audit')) return
  if (pathname.startsWith('/api/admin/presence')) return
  if (req.headers.get('next-router-prefetch') || req.headers.get('purpose') === 'prefetch') return

  const isApiMutation = pathname.startsWith('/api/admin') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  const isNavigation = pathname.startsWith('/admin') && method === 'GET' &&
    (req.headers.get('sec-fetch-dest') === 'document' || req.headers.get('rsc') === '1')
  if (!isApiMutation && !isNavigation) return

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) return

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
  const action = describe(method, pathname, isNavigation)

  await fetch(`${url}/rest/v1/audit_logs`, {
    method: 'POST',
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: user.id,
      user_email: user.email,
      action, method, path: pathname, ip,
    }),
    keepalive: true,
  })
}
