'use client'
import { useSyncExternalStore } from 'react'

/**
 * Modo tela preta (tema escuro).
 *
 * A escolha vale por aparelho e fica no navegador: é preferência de conforto
 * (loja com pouca luz, tablet à noite), não dado de negócio.
 *
 * A chave é a mesma dos outros apps do Portal, e este app roda em outro
 * domínio — então a escolha não atravessa de um para o outro, mas o nome
 * comum evita duas convenções na casa.
 */

export type Tema = 'claro' | 'escuro'

const CHAVE = 'bdt_tema'
const CHAVE_ANTIGA = 'sol_tema'
const COR_TOPO: Record<Tema, string> = { claro: '#ffffff', escuro: '#0d0f0e' }

const ouvintes = new Set<() => void>()

function guardado(): Tema | null {
  try {
    const v = localStorage.getItem(CHAVE) ?? localStorage.getItem(CHAVE_ANTIGA)
    return v === 'claro' || v === 'escuro' ? v : null
  } catch {
    return null
  }
}

/** O tema em uso agora (o padrão é claro, como sempre foi). */
export function temaAtual(): Tema {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'escuro'
  }
  return guardado() ?? 'claro'
}

/** Aplica no documento: classe do Tailwind, color-scheme e cor da barra do navegador. */
export function aplicarTema(tema: Tema): void {
  const raiz = document.documentElement
  raiz.classList.toggle('dark', tema === 'escuro')
  // Faz o navegador escurecer o que não é nosso: barra de rolagem, seletor de
  // data, preenchimento automático, campos nativos.
  raiz.style.colorScheme = tema === 'escuro' ? 'dark' : 'light'
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', COR_TOPO[tema])
}

export function definirTema(tema: Tema): void {
  try {
    localStorage.setItem(CHAVE, tema)
  } catch {
    // Navegador sem armazenamento (janela anônima): vale só nesta sessão.
  }
  aplicarTema(tema)
  for (const ouvir of ouvintes) ouvir()
}

function assinar(ouvir: () => void): () => void {
  ouvintes.add(ouvir)
  return () => { ouvintes.delete(ouvir) }
}

/** Tema para o React redesenhar o botão quando muda. No servidor, sempre claro. */
export function useTema(): Tema {
  return useSyncExternalStore(assinar, temaAtual, () => 'claro')
}

/**
 * Script que roda ANTES da primeira pintura.
 *
 * Sem isto a tela pisca branca a cada carregamento: o React só aplicaria a
 * classe depois de montar.
 */
export const SCRIPT_TEMA = `(function(){try{
var t=localStorage.getItem('${CHAVE}')||localStorage.getItem('${CHAVE_ANTIGA}');
if(t==='escuro'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}
}catch(e){}})();`
