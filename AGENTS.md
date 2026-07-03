<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Recrutamento & Seleção (Banco de Talentos)

Next.js 16 (app router) + TypeScript + Supabase. **This is production.** It's one app in the Brownie do Ton ecosystem: the **Portal BDT** (`metonsoares/bdt-platform`) is the SSO hub and the source of truth for users and per-app permissions; this app is launched from there.

## Commands

- `npm run dev` · `npm run build` (`next build`) · `npm run lint` (`eslint`)

## Auth & data (read this before touching anything auth-related)

- **Own Supabase project** (`bdspanogeelhcjwcpuil`) for **both** auth and data. Three clients in `src/lib/`:
  - `createSupabaseBrowserClient` — browser; used for the session/login, not for reading app data.
  - `createSupabaseServerClient` — server, cookie-based; runs as the **logged-in user**.
  - `createSupabaseServiceClient` — **service role, bypasses RLS**; used by server components, `/api/admin/**` routes, and the public routes.
- **Login is SSO from the Portal.** The Portal mints a magic link (via `gerar-magiclink` here, authed by the `IMPORT_TOKEN` secret) that lands on `/login`, which sets the session and routes to `/admin`. The email/password form is a fallback. The only surfaces reachable **without** a Portal login are the public CV form `/curriculo` and the tokenized links (`/pesquisa/[token]`, `/entrevista/[token]`, `/candidato/*`, etc.), which all run server-side with the service role.
- **A user's role is the Portal's perfil, resolved LIVE — never trust `user_metadata.role`** (the Portal overwrites it). Use `getEffectiveRole` / `resolvePortalRole` in `src/lib/portal-perfil.ts` (they call the Portal's `recrutamento_perfil` RPC). `OWNER_EMAILS` is a break-glass that returns `master` for the owner.

## `proxy.ts` is the middleware (Next 16 gotcha)

Next.js 16 renamed `middleware` → **`proxy`**. `src/proxy.ts` (which exports `proxy`) **is** the active middleware — adding a `middleware.ts` next to it **fails the build**. It requires an authenticated session on every `/api/admin/**` request (401 otherwise) and logs to `audit_logs`. Exception: `/api/admin/ai/analyze-candidate`, which the public forms (`curriculo`, `culture-test`) call server-to-server.

## API-route authorization is per-route

Beyond the `proxy.ts` login gate there is **no blanket authorization** — each `/api/admin/**` handler enforces its own role, via `src/lib/auth-guard.ts`:

- `requireMasterApi()` → returns a 403 `NextResponse`; use `const denied = await requireMasterApi(); if (denied) return denied` at the top of the handler.
- `requirePermission(perm)` / `requireMaster()` → for pages/layouts (they `redirect`).

When adding a route: gate it to the right role/permission, and **never accept `role`/`perfil` from the request body** — resolve it server-side.

## Deploy

Auto-deploys on `git push origin main`. **Production → confirm with the owner before pushing.** `vercel.json` sets `maxDuration: 60` on `api/admin/ai/analyze-candidate` (the long AI call); region `gru1`.

## Owner's standing rules

- Never ask for or paste `service_role_key`, access tokens, or passwords in chat.
- Never `DROP` / `TRUNCATE` / `DELETE` without a `WHERE`.
- Frontend dates: never `toISOString()` (it shifts to UTC) — format for `America/Sao_Paulo`.
- The owner edits files in parallel — **never `git add -A`**; stage only the paths you changed.
