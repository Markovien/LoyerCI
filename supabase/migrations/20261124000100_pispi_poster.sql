-- =============================================================================
-- LoyerCI — P1.7 : affiche de guichet PI-SPI (présentiel UNIQUEMENT, invariant 8).
-- Le QR n'est produit que sous forme d'affiche PDF imprimable, jamais dans une page
-- de paiement, un avis ou un message. Seule l'adresse de paiement PI-SPI (UUID v4,
-- 36 caractères) peut figurer dans un QR : jamais un numéro de téléphone.
-- Coordonnées en période de carence (48 h) ou révoquées : affiche refusée, pour
-- qu'un ajout frauduleux ne puisse pas être imprimé et affiché avant l'alerte.
-- =============================================================================

create function public.pispi_poster_data(p_actor uuid, p_account uuid, p_ip inet, p_ua text)
returns table (alias text, beneficiary text, org_name text, reference_label text)
language plpgsql security definer set search_path = '' as $$
declare
  a public.payout_accounts;
  o public.organizations;
begin
  select * into a from public.payout_accounts where id = p_account;
  if not found then raise exception 'Coordonnées introuvables' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, a.org_id, array['owner', 'manager']::public.member_role[]);
  if a.kind <> 'pispi_alias' then
    raise exception 'Seul un alias PI-SPI peut figurer sur une affiche de guichet' using errcode = '22023';
  end if;
  if a.pispi_alias !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Une affiche exige l''adresse de paiement PI-SPI (36 caractères) : un numéro de téléphone ne peut pas figurer dans un QR' using errcode = '22023';
  end if;
  if a.revoked_at is not null then
    raise exception 'Ces coordonnées ont été révoquées' using errcode = 'P0001';
  end if;
  if a.activates_at > now() then
    raise exception 'Ces coordonnées sont en période de carence : affiche disponible à leur activation' using errcode = 'P0001';
  end if;
  select * into o from public.organizations where id = a.org_id;
  perform private.log(a.org_id, p_actor, 'user', 'affiche_guichet_generee', 'payout_account', a.id::text, p_ip, p_ua,
                      jsonb_build_object('alias', left(a.pispi_alias, 8) || '…'));
  return query select a.pispi_alias, coalesce(a.display_name_expected, a.account_holder), o.name,
                      left(o.receipt_prefix || '-GUICHET', 25);
end $$;

revoke execute on function public.pispi_poster_data(uuid, uuid, inet, text) from public, anon, authenticated;
grant execute on function public.pispi_poster_data(uuid, uuid, inet, text) to service_role;
