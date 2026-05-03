# Setup — Pesquisa Interna Brownie do Ton

## 1. Criar projeto no Supabase

1. Acesse https://supabase.com e crie um novo projeto
2. Aguarde o banco de dados inicializar

## 2. Executar as migrações SQL

No **Supabase Dashboard → SQL Editor**, execute os arquivos na ordem:

```
supabase/migrations/001_schema.sql   ← Cria as tabelas
supabase/migrations/002_rls.sql      ← Ativa RLS e cria políticas
supabase/migrations/003_seed.sql     ← Insere a pesquisa com todas as seções/perguntas
```

## 3. Criar usuário admin

No **Supabase Dashboard → Authentication → Users → Add user → Create new user**:

- **E-mail:** admin@browniedoton.com.br
- **Senha:** [escolha uma senha forte — NÃO use senhas fracas em produção]
- Marque **Auto Confirm User**

> ⚠️ A senha "admin123" mencionada no escopo do projeto é apenas referência.
> Use sempre uma senha forte antes de disponibilizar o link publicamente.

## 4. Configurar variáveis de ambiente

Copie `.env.local.example` para `.env.local` e preencha:

```bash
cp .env.local.example .env.local
```

Pegue os valores em **Supabase Dashboard → Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://[seu-projeto].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[sua-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[sua-service-role-key]
```

> ⚠️ NUNCA commite o `.env.local`. Ele já está no `.gitignore`.

## 5. Rodar localmente

```bash
npm run dev
```

Acesse:
- **Pesquisa pública:** http://localhost:3000
- **Login admin:** http://localhost:3000/admin/login
- **Dashboard:** http://localhost:3000/admin/dashboard

## 6. Deploy na Vercel

1. Conecte o repositório na Vercel
2. Configure as mesmas variáveis de ambiente em **Settings → Environment Variables**
3. Deploy automático a cada push na branch `main`

## QR Code

Após o deploy, gere um QR code apontando para a URL pública raiz (ex: `https://brownie-pesquisa.vercel.app`).
Qualquer gerador online de QR code funciona (qr-code-generator.com, etc.).

## Estrutura de rotas

| Rota | Descrição |
|---|---|
| `/` | Identificação do funcionário |
| `/pesquisa` | Formulário da pesquisa |
| `/obrigado` | Tela de agradecimento |
| `/admin/login` | Login administrativo |
| `/admin/dashboard` | Painel com estatísticas |
