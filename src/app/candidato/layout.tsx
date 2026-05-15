export const metadata = { title: 'Banco de Talentos — Brownie do Ton' }

export default function CandidatoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[oklch(0.96_0.02_150)] to-[oklch(0.98_0.03_85)] flex flex-col">
      <header className="bg-white border-b shadow-sm py-4 px-6">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[oklch(0.32_0.07_150)] flex items-center justify-center text-white text-sm font-bold">BT</div>
          <div>
            <p className="font-semibold text-sm leading-tight">Brownie do Ton</p>
            <p className="text-xs text-muted-foreground">Processo Seletivo</p>
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-start justify-center p-4 pt-8">
        <div className="w-full max-w-lg">
          {children}
        </div>
      </main>
      <footer className="text-center py-4 text-xs text-muted-foreground">
        Seus dados são usados apenas para fins de recrutamento e seleção.
      </footer>
    </div>
  )
}
