-- Fecha três portas que davam poder de master a qualquer conta autenticada.
-- Verificado antes: as três tabelas são tocadas SOMENTE por código de servidor.
revoke insert, update, delete, truncate on public.role_permissions from authenticated, anon;
revoke insert, update, delete, truncate on public.audit_logs      from authenticated, anon;
drop policy if exists public_update_conversations on public.whatsapp_conversations;
