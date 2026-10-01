import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
