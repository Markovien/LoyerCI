-- Émulation minimale de l'environnement Supabase pour tester les migrations sur un
-- PostgreSQL nu (CI, poste local). NE PAS exécuter sur un vrai projet Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;

create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema vault;
create table vault.secrets_stub (name text primary key, decrypted_secret text not null);
create view vault.decrypted_secrets as select name, decrypted_secret from vault.secrets_stub;

grant usage on schema public to anon, authenticated, service_role;
-- Supabase accorde par défaut des droits larges sur public : on les reproduit
-- pour prouver que les migrations les révoquent bien.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
