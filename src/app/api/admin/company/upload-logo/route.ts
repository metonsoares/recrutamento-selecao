import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    // Verify authenticated admin
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Tipo de arquivo não permitido. Use JPG, PNG, GIF, WebP ou SVG.' }, { status: 400 })
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo muito grande. Máximo 5MB.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()

    // Determine file extension
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const fileName = `logo.${ext}`

    // Upload to Supabase Storage (upsert = replace if exists)
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('company-assets')
      .upload(fileName, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Erro ao fazer upload da imagem.' }, { status: 500 })
    }

    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('company-assets')
      .getPublicUrl(fileName)

    // Add cache-busting timestamp to force browser refresh
    const urlWithCacheBust = `${publicUrl}?v=${Date.now()}`

    // Update ai_settings with new logo_url
    const { data: existing } = await supabase
      .from('ai_settings')
      .select('id')
      .limit(1)
      .single()

    if (existing?.id) {
      await supabase
        .from('ai_settings')
        .update({ logo_url: urlWithCacheBust, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('ai_settings')
        .insert({ logo_url: urlWithCacheBust })
    }

    return NextResponse.json({ success: true, url: urlWithCacheBust })
  } catch (err) {
    console.error('Upload logo error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
