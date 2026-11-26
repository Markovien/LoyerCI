-- =============================================================================
-- LoyerCI — P4.1 : limiteur de débit partagé entre instances (décision du 26/11/2026 :
-- PostgreSQL Supabase, aucun nouveau prestataire).
--   - Fenêtre glissante approchée (compteur de la fenêtre courante + part pondérée de la
--     précédente), atomique (INSERT … ON CONFLICT), une seule requête par vérification.
--   - Les clés arrivent HACHÉES (SHA-256) : aucune IP, aucun e-mail ni identifiant en clair.
--   - Table UNLOGGED : des compteurs perdus après un arrêt brutal sont sans gravité, et
--     les écritures sont plus rapides. Nettoyage horaire.
-- =============================================================================

create unlogged table private.rate_limits (
  key_hash     text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key_hash, window_start)
);

create function public.rate_limit_hit(p_key_hash text, p_max integer, p_window_ms integer)
returns table (ok boolean, retry_after_sec integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_now      timestamptz := clock_timestamp();
  v_window   interval;
  v_start    timestamptz;
  v_cur      integer;
  v_prev     integer;
  v_elapsed  double precision;
  v_estimate double precision;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$' or p_max < 1 or p_window_ms < 1000 or p_window_ms > 86400000 then
    raise exception 'Paramètres du limiteur invalides' using errcode = '22023';
  end if;
  v_window := make_interval(secs => p_window_ms / 1000.0);
  v_start := to_timestamp(floor(extract(epoch from v_now) * 1000 / p_window_ms) * p_window_ms / 1000.0);
  insert into private.rate_limits (key_hash, window_start, hits) values (p_key_hash, v_start, 1)
  on conflict (key_hash, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into v_cur;
  select r.hits into v_prev from private.rate_limits r where r.key_hash = p_key_hash and r.window_start = v_start - v_window;
  v_elapsed := extract(epoch from (v_now - v_start)) * 1000 / p_window_ms;
  -- La tentative en cours est comptée : elle doit rester sous le plafond.
  v_estimate := coalesce(v_prev, 0) * (1 - v_elapsed) + v_cur;
  if v_estimate <= p_max then
    return query select true, 0;
  else
    return query select false, greatest(1, ceil((1 - v_elapsed) * p_window_ms / 1000.0))::integer;
  end if;
end $$;

create function public.purge_rate_limits() returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  delete from private.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v = row_count;
  return v;
end $$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer), public.purge_rate_limits() to service_role;
