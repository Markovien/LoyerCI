-- =============================================================================
-- LoyerCI — P2.1 : biens (création, modification) par propriétaire ou gestionnaire.
-- Les quittances et avis déjà émis gardent leur instantané : modifier un bien
-- n'altère aucun document signé.
-- =============================================================================

alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'bail_cree', 'bail_resilie',
  'avis_generes', 'avis_emis',
  'paiement_initie', 'paiement_confirme', 'paiement_echoue', 'paiement_anomalie',
  'preuve_virement_soumise', 'virement_valide', 'virement_rejete',
  'rib_ajoute', 'rib_annule',
  'quittance_generee', 'quittance_annulee',
  'acces_preuve_virement',
  'paiement_direct_declare', 'paiement_direct_confirme', 'paiement_direct_rejete',
  'especes_a_confirmer', 'especes_confirme', 'especes_rejete',
  'parametres_paiement_modifies', 'affiche_guichet_generee',
  'reauthentification',
  'document_envoye',
  'compte_locataire_supprime',
  'bien_cree', 'bien_modifie'));

create function public.create_property(
  p_actor uuid, p_org uuid, p_code text, p_label text, p_type public.property_type,
  p_city text, p_commune text, p_quartier text, p_address text, p_ip inet, p_ua text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.assert_role(p_actor, p_org, array['owner', 'manager']::public.member_role[]);
  begin
    insert into public.properties (org_id, code, label, type, city, commune, quartier, address_details)
    values (p_org, upper(btrim(p_code)), btrim(p_label), p_type, coalesce(nullif(btrim(p_city), ''), 'Abidjan'),
            btrim(p_commune), nullif(btrim(coalesce(p_quartier, '')), ''), nullif(btrim(coalesce(p_address, '')), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ce code de bien existe déjà dans votre organisation' using errcode = 'P0001';
  end;
  perform private.log(p_org, p_actor, 'user', 'bien_cree', 'property', v_id::text, p_ip, p_ua,
                      jsonb_build_object('code', upper(btrim(p_code)), 'libelle', btrim(p_label), 'type', p_type, 'commune', btrim(p_commune)));
  return v_id;
end $$;

create function public.update_property(
  p_actor uuid, p_property uuid, p_code text, p_label text, p_type public.property_type,
  p_city text, p_commune text, p_quartier text, p_address text, p_ip inet, p_ua text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.properties;
  v_new public.properties;
begin
  select * into v_old from public.properties where id = p_property for update;
  if not found then raise exception 'Bien introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, v_old.org_id, array['owner', 'manager']::public.member_role[]);
  begin
    update public.properties
       set code = upper(btrim(p_code)), label = btrim(p_label), type = p_type,
           city = coalesce(nullif(btrim(p_city), ''), 'Abidjan'), commune = btrim(p_commune),
           quartier = nullif(btrim(coalesce(p_quartier, '')), ''), address_details = nullif(btrim(coalesce(p_address, '')), '')
     where id = p_property
    returning * into v_new;
  exception when unique_violation then
    raise exception 'Ce code de bien existe déjà dans votre organisation' using errcode = 'P0001';
  end;
  perform private.log(v_old.org_id, p_actor, 'user', 'bien_modifie', 'property', p_property::text, p_ip, p_ua,
    jsonb_build_object(
      'avant', jsonb_build_object('code', v_old.code, 'libelle', v_old.label, 'type', v_old.type, 'ville', v_old.city,
                                  'commune', v_old.commune, 'quartier', v_old.quartier, 'adresse', v_old.address_details),
      'apres', jsonb_build_object('code', v_new.code, 'libelle', v_new.label, 'type', v_new.type, 'ville', v_new.city,
                                  'commune', v_new.commune, 'quartier', v_new.quartier, 'adresse', v_new.address_details)));
end $$;

revoke execute on function public.create_property(uuid, uuid, text, text, public.property_type, text, text, text, text, inet, text) from public, anon, authenticated;
revoke execute on function public.update_property(uuid, uuid, text, text, public.property_type, text, text, text, text, inet, text) from public, anon, authenticated;
grant execute on function public.create_property(uuid, uuid, text, text, public.property_type, text, text, text, text, inet, text) to service_role;
grant execute on function public.update_property(uuid, uuid, text, text, public.property_type, text, text, text, text, inet, text) to service_role;
