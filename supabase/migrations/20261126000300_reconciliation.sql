-- =============================================================================
-- LoyerCI — P4.2 : réconciliation de secours des paiements en ligne (si CinetPay est
-- activé). Liste les intentions restées « initiées » plus de 30 minutes (webhook perdu) ;
-- le serveur interroge alors le fournisseur et impute exactement comme le webhook.
-- =============================================================================
create function public.stale_provider_intents(p_provider public.payment_provider, p_limit integer default 50)
returns table (provider_transaction_id text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.provider_transaction_id, p.created_at
    from public.payments p
   where p.provider = p_provider and p.status = 'initie'
     and p.created_at < now() - interval '30 minutes'
     and p.provider_transaction_id is not null
   order by p.created_at
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke execute on function public.stale_provider_intents(public.payment_provider, integer) from public, anon, authenticated;
grant execute on function public.stale_provider_intents(public.payment_provider, integer) to service_role;
