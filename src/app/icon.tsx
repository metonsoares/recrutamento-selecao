import { ImageResponse } from 'next/og'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default async function Icon() {
  const supabase = await createSupabaseServiceClient()
  const { data } = await supabase
    .from('ai_settings')
    .select('logo_url, company_name')
    .limit(1)
    .single()

  const logoUrl = data?.logo_url || null

  if (logoUrl) {
    return new ImageResponse(
      (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt="logo"
          width={32}
          height={32}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ),
      { ...size },
    )
  }

  // Fallback — dark square with initials
  const initials = (data?.company_name || 'BT')
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1a1a1a',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        {initials}
      </div>
    ),
    { ...size },
  )
}
