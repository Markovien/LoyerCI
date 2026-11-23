-- =============================================================================
-- LoyerCI — P2.4 : avis d'échéance (génération manuelle, annulation) et
-- annulation de quittance. Jamais de suppression : statuts « annule » / « annulee ».
-- La contrainte d'audit inclut aussi les actions de P2.5 et P2.6.
-- =============================================================================

alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'bail_cree', 'bail_resilie', 'bail_termine',
  'avis_generes', 'avis_emis', 'avis_annule',
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
  'bien_cree', 'bien_modifie',
  'locataire_cree', 'locataire_modifie', 'locataire_invite', 'locataire_lie', 'locataire_delie',
  'avance_enregistree', 'consentement_whatsapp',
  'membre_ajoute', 'membre_role_modifie', 'membre_retire', 'audit_exporte'));

alter table public.invoices add column cancelled_reason text check (char_length(cancelled_reason) <= 300);

-- Génération manuelle pour UNE organisation (la tâche planifiée couvre toutes les organisations).
create function public.generate_invoices_for_org(p_actor uuid, p_org uuid, p_period date, p_ip inet, p_ua text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_period date := date_trunc('month', p_period)::date;
  v_end    date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  r record;
  v_before int;
  v_count  int := 0;
begin
  perform private.assert_role(p_actor, p_org, array['owner', 'manager']::public.member_role[]);
  for r in
    select l.id from public.leases l
     where l.org_id = p_org and l.status = 'actif' and l.start_date <= v_end
       and (l.end_date is null or l.end_date >= v_period)
  loop
    select count(*) into v_before from public.invoices i where i.lease_id = r.id and i.period = v_period;
    perform private.ensure_invoice(r.id, v_period);
    if v_before = 0 then v_count := v_count + 1; end if;
  end loop;
  perform private.log(p_org, p_actor, 'user', 'avis_generes', 'invoice', null, p_ip, p_ua,
                      jsonb_build_object('periode', to_char(v_period, 'YYYY-MM'), 'nombre', v_count, 'manuel', true));
  return v_count;
end $$;

-- Annulation d'un avis : seulement s'il n'a reçu AUCUN encaissement et qu'aucune
-- déclaration n'attend (sinon : remboursement, hors périmètre).
create function public.cancel_invoice(p_actor uuid, p_invoice uuid, p_reason text, p_ip inet, p_ua text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v public.invoices;
begin
  select * into v from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, v.org_id, array['owner', 'manager']::public.member_role[]);
  if v.status = 'annule' then raise exception 'Cet avis est déjà annulé' using errcode = 'P0001'; end if;
  if v.amount_paid > 0 or exists (select 1 from public.payments pm where pm.invoice_id = p_invoice and pm.status in ('reussi', 'en_attente_validation', 'initie')) then
    raise exception 'Avis déjà réglé en tout ou partie, ou déclaration en attente : annulation impossible' using errcode = 'P0001';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'Motif d''annulation obligatoire (5 caractères minimum)' using errcode = '22023';
  end if;
  update public.invoices set status = 'annule', cancelled_reason = left(btrim(p_reason), 300) where id = p_invoice;
  perform private.log(v.org_id, p_actor, 'user', 'avis_annule', 'invoice', p_invoice::text, p_ip, p_ua,
                      jsonb_build_object('reference', v.payment_reference, 'motif', left(btrim(p_reason), 300)));
end $$;

-- Annulation d'une quittance : propriétaire seul, motif obligatoire. La quittance reste
-- en base (immuable hormis cette transition) ; /verify l'affiche « annulée ».
create function public.cancel_receipt(p_actor uuid, p_receipt uuid, p_reason text, p_ip inet, p_ua text)
returns void
language plpgsql security definer set search_path = '' as $$
declare r public.receipts;
begin
  select * into r from public.receipts where id = p_receipt for update;
  if not found then raise exception 'Quittance introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, r.org_id, array['owner']::public.member_role[]);
  if r.status = 'annulee' then raise exception 'Quittance déjà annulée' using errcode = 'P0001'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'Motif d''annulation obligatoire (5 caractères minimum)' using errcode = '22023';
  end if;
  update public.receipts set status = 'annulee', revoked_reason = left(btrim(p_reason), 300) where id = p_receipt;
  perform private.log(r.org_id, p_actor, 'user', 'quittance_annulee', 'receipt', p_receipt::text, p_ip, p_ua,
                      jsonb_build_object('numero', r.receipt_number, 'motif', left(btrim(p_reason), 300)));
end $$;

revoke execute on function public.generate_invoices_for_org(uuid, uuid, date, inet, text) from public, anon, authenticated;
revoke execute on function public.cancel_invoice(uuid, uuid, text, inet, text) from public, anon, authenticated;
revoke execute on function public.cancel_receipt(uuid, uuid, text, inet, text) from public, anon, authenticated;
grant execute on function
  public.generate_invoices_for_org(uuid, uuid, date, inet, text),
  public.cancel_invoice(uuid, uuid, text, inet, text),
  public.cancel_receipt(uuid, uuid, text, inet, text)
to service_role;
