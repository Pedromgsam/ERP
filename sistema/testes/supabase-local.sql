-- Imita o mínimo do Supabase num PostgreSQL comum, só para os testes:
-- papéis anon/authenticated, schema auth com users e auth.uid().
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then
    create role authenticator login noinherit; end if;
end $$;
grant anon, authenticated to authenticator;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(),
  senha_teste text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
         (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
