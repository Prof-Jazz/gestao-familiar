-- Simula o mínimo do Supabase para testes locais
do $$ begin if not exists (select 1 from pg_roles where rolname=$q$anon$q$) then create role anon nologin; create role authenticated nologin; create role authenticator login noinherit password $q$auth$q$; grant anon, authenticated to authenticator; end if; end $$;
grant anon, authenticated to authenticator;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
         (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'sub')),'')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
create publication supabase_realtime;
