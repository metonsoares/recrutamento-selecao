/**
 * JusBrasil Authenticated Scraper
 * Uses Playwright to log into the user's JusBrasil account and query
 * the "Consulta Processual" page by CPF and/or name.
 *
 * Required env vars:
 *   JUSBRASIL_EMAIL    – email da conta JusBrasil
 *   JUSBRASIL_PASSWORD – senha da conta JusBrasil
 *
 * Dev: Chrome do sistema é detectado automaticamente.
 * Prod (Vercel): @sparticuz/chromium fornece o binário Chromium.
 */

import { existsSync } from 'fs'
import { chromium as playwrightChromium, type Browser, type Page } from 'playwright-core'

// ─── Dev: caminhos comuns do Chrome no Windows / Mac / Linux ─────────────────

const CHROME_PATHS: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ],
}

function findSystemChrome(): string | undefined {
  const list = CHROME_PATHS[process.platform] ?? []
  return list.find(p => existsSync(p))
}

// ─── Launch browser ───────────────────────────────────────────────────────────

async function launchBrowser(): Promise<Browser> {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

  if (isServerless) {
    // Production: @sparticuz/chromium fornece o binário para Lambda/Vercel
    const chromium = (await import('@sparticuz/chromium')).default
    return playwrightChromium.launch({
      args: [...chromium.args, '--disable-blink-features=AutomationControlled'],
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }

  // Dev: usa Chrome do sistema
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || findSystemChrome()
  return playwrightChromium.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  })
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function loginJusBrasil(page: Page, email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await page.goto('https://www.jusbrasil.com.br/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })

    // Aguarda o formulário aparecer
    const emailSel = [
      'input[type="email"]',
      'input[name="login"]',
      'input[name="email"]',
      '#email',
    ].join(', ')

    await page.waitForSelector(emailSel, { timeout: 15_000 })

    await page.fill(emailSel, email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')

    // Aguarda saída da página de login
    await page.waitForFunction(
      () => !window.location.pathname.includes('/login'),
      { timeout: 20_000 },
    )

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[JusBrasil] Login falhou:', msg)
    return { ok: false, error: msg }
  }
}

// ─── Pesquisa na Consulta Processual ─────────────────────────────────────────

async function queryConsultaProcessual(page: Page, query: string): Promise<string> {
  try {
    // Navega direto com query na URL — JusBrasil aceita este formato
    const url = `https://www.jusbrasil.com.br/consulta-processual/?query=${encodeURIComponent(query)}`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    // Aguarda carregamento do React (resultado aparece depois do hydrate)
    await page.waitForTimeout(5_000)

    // Se ainda houver spinner / loading visível, aguarda mais um pouco
    await page.waitForFunction(
      () => !document.querySelector('[data-loading="true"], .loading-spinner, .sk-spinner'),
      { timeout: 10_000 },
    ).catch(() => null) // ignora timeout se não houver spinner

    // Extrai todo o texto útil da página
    const text = await page.evaluate((): string => {
      const remove = (sel: string) =>
        document.querySelectorAll(sel).forEach(el => el.remove())

      remove('script, style, noscript, nav, header, footer, [aria-hidden="true"]')

      // Tenta pegar o container de resultados específico primeiro
      const resultContainer =
        document.querySelector(
          '[class*="ProcessSearch"], [class*="process-list"], [class*="SearchResult"], main',
        ) ?? document.body

      return (resultContainer as HTMLElement).innerText
        .replace(/\t/g, ' ')
        .replace(/[ ]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    })

    return text.slice(0, 6_000)
  } catch (err) {
    console.error('[JusBrasil] queryConsultaProcessual falhou:', err)
    return ''
  }
}

// ─── Entrada pública ──────────────────────────────────────────────────────────

export interface JusBrasilScraperResult {
  success: boolean
  authenticated: boolean
  content: string // texto bruto para análise da IA
  error?: string
}

/**
 * Faz login na conta JusBrasil e consulta a Consulta Processual por CPF e/ou nome.
 *
 * @param name     Nome completo do candidato
 * @param cpf      CPF numérico (somente dígitos) — opcional
 * @param credentials  Email e senha da conta JusBrasil.
 *                     Se omitidos, lê das env vars JUSBRASIL_EMAIL / JUSBRASIL_PASSWORD.
 */
export async function scrapeJusBrasilAuthenticated(
  name: string,
  cpf?: string | null,
  credentials?: { email: string; password: string },
): Promise<JusBrasilScraperResult> {
  // Prioridade: parâmetro → variável de ambiente
  const email = credentials?.email || process.env.JUSBRASIL_EMAIL
  const password = credentials?.password || process.env.JUSBRASIL_PASSWORD

  if (!email || !password) {
    return {
      success: false,
      authenticated: false,
      content: '',
      error: 'Credenciais JusBrasil não configuradas. Acesse Configurações → IA e informe o e-mail e senha da conta JusBrasil.',
    }
  }

  let browser: Browser | null = null

  try {
    browser = await launchBrowser()

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      extraHTTPHeaders: {
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
      },
    })

    const page = await context.newPage()

    // ── Login ────────────────────────────────────────────────────────────────
    const login = await loginJusBrasil(page, email, password)
    if (!login.ok) {
      return {
        success: false,
        authenticated: false,
        content: '',
        error: `Login falhou: ${login.error}. Verifique JUSBRASIL_EMAIL e JUSBRASIL_PASSWORD.`,
      }
    }

    // ── Pesquisas ─────────────────────────────────────────────────────────────
    const parts: string[] = []

    if (cpf) {
      // Formato com pontos e traço (XXX.XXX.XXX-XX)
      const cpfFmt = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')

      const r1 = await queryConsultaProcessual(page, cpfFmt)
      if (r1.length > 80) {
        parts.push(`### Consulta por CPF (${cpfFmt}):\n${r1}`)
      }

      // Sem formatação — alguns tribunais indexam assim
      const r2 = await queryConsultaProcessual(page, cpf)
      if (r2.length > 80 && r2 !== r1) {
        parts.push(`### Consulta por CPF sem formatação (${cpf}):\n${r2}`)
      }
    }

    // Pesquisa por nome completo
    const r3 = await queryConsultaProcessual(page, name)
    if (r3.length > 80) {
      parts.push(`### Consulta por nome ("${name}"):\n${r3}`)
    }

    await browser.close()
    browser = null

    const content = parts.join('\n\n---\n\n')

    return {
      success: true,
      authenticated: true,
      content: content || 'Nenhum resultado encontrado nas consultas realizadas.',
    }
  } catch (err) {
    console.error('[JusBrasil Scraper] Erro geral:', err)
    return {
      success: false,
      authenticated: false,
      content: '',
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    if (browser) {
      try { await browser.close() } catch { /* ignora */ }
    }
  }
}
