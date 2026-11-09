import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

import {
  BUCKET_FOLHAS, MAX_FOLHA_BYTES, ehPdf, tamanhoDaFolha,
} from '@/lib/folhas-analiticas'

const BUCKET = BUCKET_FOLHAS
const MAX_SIZE = MAX_FOLHA_BYTES // 25 MB — folha analítica costuma ser grande

/**
 * POST — registra uma ou mais folhas analíticas de uma empresa em uma competência.
 *
 * Caminho normal (JSON): o arquivo JÁ subiu direto ao Storage pela autorização
 * de `/assinar`; aqui só confere o objeto no bucket e grava a linha. Isso existe
 * porque a Vercel corta o corpo da função em ~4,5 MB e a tela promete 25 MB.
 *
 * Caminho antigo (multipart): mantido para aba aberta com o código anterior em
 * cache. Só funciona para arquivo pequeno — é o limite da plataforma, não nosso.
 */
export async function POST(req: NextRequest) {
  const tipoDoCorpo = req.headers.get('content-type') ?? ''
  if (tipoDoCorpo.includes('application/json')) return registrar(req)
  return receberNoCorpo(req)
}

/** Registro do que já está no bucket (caminho normal). */
async function registrar(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('documentos_empresa')
    if (denied) return denied

    const body = await req.json().catch(() => ({})) as {
      empresa?: string
      competencia?: string
      arquivos?: { path?: string; file_name?: string }[]
    }
    const empresa = (body.empresa ?? '').trim()
    const competencia = (body.competencia ?? '').trim()
    const arquivos = Array.isArray(body.arquivos) ? body.arquivos : []

    if (!empresa) return NextResponse.json({ error: 'Escolha a empresa.' }, { status: 400 })
    if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Informe o período (mês e ano).' }, { status: 400 })
    }
    if (arquivos.length === 0) {
      return NextResponse.json({ error: 'Anexe ao menos um arquivo PDF.' }, { status: 400 })
    }

    const pasta = competencia.slice(0, 7)
    const supabase = await createSupabaseServiceClient()
    const enviados: string[] = []

    for (const a of arquivos) {
      const path = (a.path ?? '').trim()
      const nome = (a.file_name ?? '').trim() || path.split('/').pop() || 'folha.pdf'

      // O path vem do navegador: só aceita dentro da pasta desta competência.
      if (!path.startsWith(`${pasta}/`) || path.includes('..')) {
        return NextResponse.json({ error: 'Arquivo fora da pasta do período.' }, { status: 403 })
      }
      if (!ehPdf(nome, 'application/pdf')) {
        return NextResponse.json({ error: `"${nome}" não é PDF.` }, { status: 400 })
      }

      // Confere o objeto DE VERDADE no bucket: tamanho real e existência.
      const objeto = path.slice(pasta.length + 1)
      const { data: achados } = await supabase.storage.from(BUCKET).list(pasta, { search: objeto, limit: 1 })
      const encontrado = achados?.find(o => o.name === objeto)
      if (!encontrado) {
        return NextResponse.json({ error: `"${nome}" não chegou ao servidor. Tente de novo.` }, { status: 400 })
      }
      const tamanho = Number((encontrado.metadata as { size?: number } | null)?.size ?? 0)
      if (tamanho > MAX_SIZE) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
        return NextResponse.json({
          error: `"${nome}" tem ${tamanhoDaFolha(tamanho)}. O limite é 25 MB por arquivo.`,
        }, { status: 400 })
      }

      const { error } = await supabase.from('folhas_analiticas')
        .insert({ empresa, competencia, file_name: nome.slice(0, 200), file_path: path })
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
        return NextResponse.json({ error: error.message, enviados: enviados.length }, { status: 400 })
      }
      enviados.push(nome)
    }

    return NextResponse.json({ ok: true, enviados: enviados.length })
  } catch (err) {
    console.error('[folhas-analiticas registrar]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** Caminho antigo: arquivo no corpo da função (só arquivo pequeno). */
async function receberNoCorpo(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('documentos_empresa')
    if (denied) return denied

    const form = await req.formData()
    // Um período pode ter mais de uma folha (empresa com mais de um lote, folha
    // complementar, 13º): cada arquivo vira um registro e NADA é substituído —
    // para trocar um documento, remove-se o antigo pela lixeira.
    const arquivos = form.getAll('file').filter((f): f is File => f instanceof File)
    const empresa = (form.get('empresa') as string | null)?.trim() || ''
    const competencia = (form.get('competencia') as string | null)?.trim() || '' // yyyy-mm-01

    if (!empresa) return NextResponse.json({ error: 'Escolha a empresa.' }, { status: 400 })
    if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Informe o período (mês e ano).' }, { status: 400 })
    }
    if (arquivos.length === 0) {
      return NextResponse.json({ error: 'Anexe ao menos um arquivo PDF.' }, { status: 400 })
    }
    for (const file of arquivos) {
      if (!ehPdf(file.name, file.type)) {
        return NextResponse.json({ error: `"${file.name}" não é PDF.` }, { status: 400 })
      }
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: `"${file.name}" excede 25 MB.` }, { status: 400 })
      }
    }

    const supabase = await createSupabaseServiceClient()

    const enviados: string[] = []
    for (const file of arquivos) {
      const path = `${competencia.slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name.replace(/[^\w.-]+/g, '_')}`
      const { error: upErr } = await supabase.storage
        .from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: 'application/pdf', upsert: false })
      if (upErr) return NextResponse.json({ error: upErr.message, enviados: enviados.length }, { status: 500 })

      const { error } = await supabase.from('folhas_analiticas')
        .insert({ empresa, competencia, file_name: file.name, file_path: path })
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
        return NextResponse.json({ error: error.message, enviados: enviados.length }, { status: 400 })
      }
      enviados.push(file.name)
    }

    return NextResponse.json({ ok: true, enviados: enviados.length })
  } catch (err) {
    console.error('[folhas-analiticas POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE — remove a folha e o arquivo do bucket. */
export async function DELETE(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('documentos_empresa')
    if (denied) return denied

    const { id } = await req.json().catch(() => ({}))
    if (!id) return NextResponse.json({ error: 'Documento não informado.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data: folha } = await supabase
      .from('folhas_analiticas').select('file_path').eq('id', id).maybeSingle()
    if (folha?.file_path) {
      await supabase.storage.from(BUCKET).remove([folha.file_path as string]).catch(() => {})
    }
    const { error } = await supabase.from('folhas_analiticas').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[folhas-analiticas DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
