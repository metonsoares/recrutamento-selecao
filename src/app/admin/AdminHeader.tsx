'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface Props {
  userEmail: string
}

export default function AdminHeader({ userEmail }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  const navLinks = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/respondentes', label: 'Respondentes' },
  ]

  return (
    <header className="bg-sidebar text-sidebar-foreground shadow-sm">
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center gap-3">
        {/* Marca */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-widest opacity-60 leading-none">
            Brownie do Ton
          </div>
          <div className="text-sm font-bold leading-tight">Painel Admin</div>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {navLinks.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== '/admin/dashboard' &&
                pathname.startsWith(link.href))
            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
                ].join(' ')}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* Sign out */}
        <Button
          variant="outline"
          size="sm"
          onClick={signOut}
          className="text-sidebar-foreground border-sidebar-border hover:bg-sidebar-accent rounded-lg text-xs"
          title={userEmail}
        >
          Sair
        </Button>
      </div>
    </header>
  )
}
