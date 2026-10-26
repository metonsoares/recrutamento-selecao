import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SCRIPT_TEMA } from "@/lib/tema";
import { publicAppUrl } from "@/lib/helpers";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// `metadataBase` resolve as URLs relativas das paginas (canonical, Open Graph).
// Sem ele o Next nao consegue montar a canonical absoluta e o Google passa a ver
// o formulario publico como copia: ele responde 200 tanto no dominio oficial
// quanto no endereco .vercel.app, e sem canonical nenhum dos dois se declara o
// certo. Foi o que o Search Console apontou em 24/10/2026
// ("Copia sem pagina canonica selecionada pelo usuario").
export const metadata: Metadata = {
  metadataBase: new URL(publicAppUrl()),
  title: "Banco de Talentos do Ton",
  description: "Sistema de Recrutamento e Seleção — Brownie do Ton",
};

// Garante o redimensionamento responsivo em celular/tablet (qualquer SO).
// Mantém o zoom habilitado por acessibilidade.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      // A classe do tema é aplicada antes da hidratação pelo script abaixo.
      suppressHydrationWarning
    >
      <head>
        {/* Aplica o modo tela preta ANTES da primeira pintura: sem isto a tela
            pisca branca a cada carregamento. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
