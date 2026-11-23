-- =============================================================================
-- LoyerCI — D.2 : suivi des envois de documents (avis, quittances) par le bailleur.
-- Décision du 22/11/2026 : chaque bailleur envoie depuis SES comptes (WhatsApp,
-- e-mail, partage natif du téléphone). LoyerCI trace l'envoi : qui, quand, quel
-- canal. Sert la file « à envoyer » et le futur comptage des envois (D.5).
-- =============================================================================

create type public.delivery_channel as enum ('partage', 'whatsapp', 'email', 'sms', 'telechargement');
create type public.document_type    as enum ('avis', 'quittance');

create table public.document_deliveries (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  invoice_id  uuid not null,
  doc_type    public.document_type not null,
  document_id uuid not null,               -- notices.id ou receipts.id
  channel     public.delivery_channel not null,
  sent_by     uuid not null references auth.users (id),
  sent_at     timestamptz not null default now(),
  foreign key (invoice_id, org_id) references public.invoices (id, org_id)
);
create index document_deliveries_invoice_idx on public.document_deliveries (invoice_id, doc_type);
create index document_deliveries_org_idx on public.document_deliveries (org_id, sent_at desc);

-- Trace : ajout seul.
create trigger document_deliveries_no_update before update or delete on public.document_deliveries
  for each row execute function private.forbid_mutation();

alter table public.document_deliveries enable row level security;
grant select on public.document_deliveries to authenticated;
create policy document_deliveries_select on public.document_deliveries for select to authenticated
  using (org_id in (select private.user_org_ids()));

-- Journal d'audit : nouvelle action
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
  'document_envoye'));

-- -----------------------------------------------------------------------------
-- Enregistrement d'un envoi (tout membre de l'organisation : propriétaire,
-- gestionnaire, comptable). Le document doit exister et appartenir à l'avis.
-- -----------------------------------------------------------------------------
create function public.mark_document_sent(
  p_actor uuid, p_invoice uuid, p_doc_type public.document_type, p_channel public.delivery_channel,
  p_ip inet, p_ua text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_doc uuid;
  v_id  bigint;
begin
  select i.org_id into v_org from public.invoices i where i.id = p_invoice;
  if v_org is null then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, v_org, array['owner', 'manager', 'accountant']::public.member_role[]);

  if p_doc_type = 'avis' then
    select n.id into v_doc from public.notices n where n.invoice_id = p_invoice;
  else
    select r.id into v_doc from public.receipts r where r.invoice_id = p_invoice and r.status = 'valide';
  end if;
  if v_doc is null then
    raise exception 'Document non émis : préparez-le avant de l''envoyer' using errcode = 'P0001';
  end if;

  insert into public.document_deliveries (org_id, invoice_id, doc_type, document_id, channel, sent_by)
  values (v_org, p_invoice, p_doc_type, v_doc, p_channel, p_actor)
  returning id into v_id;

  perform private.log(v_org, p_actor, 'user', 'document_envoye', p_doc_type::text, v_doc::text, p_ip, p_ua,
                      jsonb_build_object('canal', p_channel, 'avis', p_invoice));
  return v_id;
end $$;

revoke execute on function public.mark_document_sent(uuid, uuid, public.document_type, public.delivery_channel, inet, text)
  from public, anon, authenticated;
grant execute on function public.mark_document_sent(uuid, uuid, public.document_type, public.delivery_channel, inet, text)
  to service_role;
