import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // OCR da ponte do ChatGPT (src/lib/mcp-rh/ocr.ts): o tesseract.js sobe um
  // worker_thread a partir dos próprios arquivos — não pode ser empacotado.
  serverExternalPackages: ['tesseract.js'],
  // O rastreio de arquivos da Vercel não segue o require('..') do worker do
  // tesseract.js ("Cannot find module '..'"): leva o pacote e as dependências inteiros.
  outputFileTracingIncludes: {
    '/api/mcp/rh': [
      './node_modules/tesseract.js/**/*',
      './node_modules/tesseract.js-core/**/*',
      './node_modules/bmp-js/**/*',
      './node_modules/idb-keyval/**/*',
      './node_modules/is-electron/**/*',
      './node_modules/is-url/**/*',
      './node_modules/node-fetch/**/*',
      './node_modules/whatwg-url/**/*',
      './node_modules/tr46/**/*',
      './node_modules/webidl-conversions/**/*',
      './node_modules/regenerator-runtime/**/*',
      './node_modules/wasm-feature-detect/**/*',
      './node_modules/zlibjs/**/*',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'bdspanogeelhcjwcpuil.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        // As fotos das listas passaram a ser servidas por URL ASSINADA (o
        // otimizador busca a imagem sem os cookies, então rota protegida não
        // serve). Sem este padrão o Next recusa a URL e o avatar vem quebrado.
        protocol: 'https',
        hostname: 'bdspanogeelhcjwcpuil.supabase.co',
        pathname: '/storage/v1/object/sign/**',
      },
    ],
  },

  /**
   * O endereço oficial passou a ser `recrutamento.browniedoton.com.br`
   * (decisão do dono, 20/10/2026). O `.com` continua no ar e manda quem chega
   * nele para o novo — assim nenhum QR code, anúncio ou link de currículo já
   * distribuído deixa de funcionar.
   *
   * `/api/**` fica DE FORA do redirecionamento de propósito: o D4Sign grava a
   * URL de callback no momento em que o contrato é enviado, então contratos
   * que ainda estão em assinatura têm `https://recrutamento.browniedoton.com/
   * api/webhooks/d4sign` registrado lá fora. Cliente HTTP seguindo 301 pode
   * virar GET ou simplesmente não seguir — o callback de assinatura sumiria
   * sem erro visível. Servindo a API nos dois domínios, isso não acontece.
   */
  async redirects() {
    return [
      {
        source: '/:caminho((?!api/).*)',
        has: [{ type: 'host', value: 'recrutamento.browniedoton.com' }],
        destination: 'https://recrutamento.browniedoton.com.br/:caminho',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
