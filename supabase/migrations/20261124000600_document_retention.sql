-- =============================================================================
-- LoyerCI — P3.4 : conservation des documents 2 ans au plus après leur émission
-- (décision du 24/11/2026).
--   - Purge quotidienne des avis et quittances émis il y a plus de 2 ans, et des preuves
--     de virement (fichiers) déposées il y a plus de 2 ans. Le journal d'audit est conservé.
--   - Pierre tombale minimale (n°, date, début du code de vérification) : /verify répond
--     « document plus conservé », sans le déclarer faux ni authentique, et seulement à qui
--     présente le bon code (pas d'énumération des documents).
--   - Les déclencheurs d'immuabilité n'autorisent la suppression que pendant la purge
--     (réglage local à la transaction) ET pour un document de plus de 2 ans.
--   - Alerte aux propriétaires et comptables 30 jours avant (e-mail, tableau de bord) ;
--     export des PDF avant la purge (journalisé).
-- =============================================================================

create table private.purged_documents (
  id          uuid primary key,
  kind        text not null check (kind in ('quittance', 'avis')),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  number      text not null,
  code_prefix text not null check (code_prefix ~ '^[0-9a-f]{16}$'),
  issued_at   timestamptz not null,
  purged_at   timestamptz not null default now()
);

-- Preuve de virement retirée par la purge : la contrainte « un virement a une preuve »
-- l'admet, et seulement dans ce cas.
alter table public.payments add column proof_purged_at timestamptz;
alter table public.payments drop constraint payments_virement_proof;
alter table public.payments add constraint payments_virement_proof check (
  method <> 'virement' or proof_path is not null or proof_purged_at is not null
  or (status = 'reussi' and declared_by is not null and declared_by = validated_by)
);

-- Fichiers à retirer du stockage (via l'API Storage, côté serveur).
create table private.storage_deletions (
  id         bigint generated always as identity primary key,
  bucket     text not null,
  path       text not null,
  created_at timestamptz not null default now(),
  done_at    timestamptz,
  attempts   integer not null default 0,
  last_error text check (char_length(last_error) <= 300),
  unique (bucket, path)
);

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
  'membre_ajoute', 'membre_role_modifie', 'membre_retire', 'audit_exporte',
  'relances_parametrees', 'relance_envoyee',
  'documents_purges', 'documents_exportes'));

alter table private.outbox drop constraint outbox_kind_check;
alter table private.outbox add constraint outbox_kind_check check (kind in (
  'alerte_compte_reception', 'depart_locataire', 'rappel_suppression_compte',
  'paiement_declare', 'paiement_confirme', 'paiement_rejete', 'declaration_en_attente',
  'relance_loyer', 'purge_documents_prochaine'));

-- Durée de conservation (une seule source).
create function private.document_retention() returns interval
language sql immutable set search_path = '' as $$ select interval '2 years' $$;

-- -----------------------------------------------------------------------------
-- Immuabilité : suppression permise uniquement par la purge, et après 2 ans
-- -----------------------------------------------------------------------------
create or replace function private.receipts_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('loyerci.purge', true) = 'on' and old.issued_at < now() - private.document_retention() then
      return old;
    end if;
    raise exception 'Une quittance ne peut pas être supprimée' using errcode = '42501';
  end if;
  if old.status = 'valide' and new.status = 'annulee' and new.revoked_reason is not null
     and (to_jsonb(new) - array['status', 'revoked_reason', 'revoked_at'])
       = (to_jsonb(old) - array['status', 'revoked_reason', 'revoked_at']) then
    new.revoked_at := now();
    return new;
  end if;
  raise exception 'Une quittance émise est immuable' using errcode = '42501';
end $$;

create function private.notices_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_setting('loyerci.purge', true) = 'on'
     and old.issued_at < now() - private.document_retention() then
    return old;
  end if;
  raise exception 'Un avis émis est immuable' using errcode = '42501';
end $$;

drop trigger notices_immutable on public.notices;
create trigger notices_immutable before update or delete on public.notices
  for each row execute function private.notices_guard();

-- -----------------------------------------------------------------------------
-- Purge quotidienne
-- -----------------------------------------------------------------------------
create function public.purge_expired_documents()
returns table (quittances integer, avis integer, preuves integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_cutoff timestamptz := now() - private.document_retention();
  v_q integer := 0;
  v_a integer := 0;
  v_p integer := 0;
  o record;
begin
  perform set_config('loyerci.purge', 'on', true);
  for o in
    select distinct x.org_id from (
      select r.org_id from public.receipts r where r.issued_at < v_cutoff
      union select n.org_id from public.notices n where n.issued_at < v_cutoff
      union select p.org_id from public.payments p where p.proof_path is not null and p.created_at < v_cutoff
    ) x
  loop
    with gone as (
      delete from public.receipts r where r.org_id = o.org_id and r.issued_at < v_cutoff
      returning r.id, r.org_id, r.receipt_number, r.signature, r.issued_at
    ), kept as (
      insert into private.purged_documents (id, kind, org_id, number, code_prefix, issued_at)
      select g.id, 'quittance', g.org_id, g.receipt_number, left(g.signature, 16), g.issued_at from gone g
      on conflict (id) do nothing returning 1
    ) select count(*) into v_q from kept;

    with gone as (
      delete from public.notices n where n.org_id = o.org_id and n.issued_at < v_cutoff
      returning n.id, n.org_id, n.payment_reference, n.signature, n.issued_at
    ), kept as (
      insert into private.purged_documents (id, kind, org_id, number, code_prefix, issued_at)
      select g.id, 'avis', g.org_id, g.payment_reference, left(g.signature, 16), g.issued_at from gone g
      on conflict (id) do nothing returning 1
    ) select count(*) into v_a from kept;

    with files as (
      update public.payments p set proof_path = null, proof_purged_at = now()
       where p.org_id = o.org_id and p.proof_path is not null and p.created_at < v_cutoff
      returning p.proof_path as path
    ) select count(*) into v_p from files; -- fichiers mis en file par payments_queue_proof_deletion

    perform private.log(o.org_id, null, 'system', 'documents_purges', 'organization', o.org_id::text, null, null,
                        jsonb_build_object('quittances', v_q, 'avis', v_a, 'preuves', v_p, 'avant', v_cutoff));
    quittances := v_q; avis := v_a; preuves := v_p;
    return next;
  end loop;
  perform set_config('loyerci.purge', 'off', true);
end $$;

-- Les chemins des preuves doivent être mis en file AVANT d'être effacés de payments :
-- déclencheur sur la mise à null de proof_path.
create function private.queue_proof_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.proof_path is not null and new.proof_path is null then
    insert into private.storage_deletions (bucket, path) values ('transfer-proofs', old.proof_path)
    on conflict (bucket, path) do nothing;
  end if;
  return new;
end $$;
create trigger payments_queue_proof_deletion after update of proof_path on public.payments
  for each row execute function private.queue_proof_deletion();

create function public.claim_storage_deletions(p_limit integer default 100)
returns table (id bigint, bucket text, path text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update private.storage_deletions s set attempts = s.attempts + 1
   where s.id in (select x.id from private.storage_deletions x
                   where x.done_at is null and x.attempts < 5
                   order by x.id limit least(greatest(coalesce(p_limit, 100), 1), 500)
                   for update skip locked)
  returning s.id, s.bucket, s.path;
end $$;

create function public.complete_storage_deletion(p_id bigint, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.storage_deletions
     set done_at = case when p_error is null then now() end, last_error = left(p_error, 300)
   where id = p_id;
end $$;

-- -----------------------------------------------------------------------------
-- Alerte 30 jours avant (une par organisation et par mois de purge)
-- -----------------------------------------------------------------------------
create function public.enqueue_purge_alerts() returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into private.outbox (org_id, kind, payload, dedupe_key)
  select d.org_id, 'purge_documents_prochaine',
         jsonb_build_object('nombre', count(*), 'a_partir_du', min(d.issued_at) + private.document_retention()),
         'purge:' || d.org_id || ':' || to_char(min(d.issued_at) + private.document_retention(), 'YYYY-MM')
    from (select r.org_id, r.issued_at from public.receipts r
          union all select n.org_id, n.issued_at from public.notices n) d
   where d.issued_at + private.document_retention() between now() and now() + interval '30 days'
   group by d.org_id
  on conflict (dedupe_key) do nothing;
  get diagnostics v = row_count;
  return v;
end $$;

-- Export des documents avant purge : journalisé (propriétaire ou comptable).
create function public.log_documents_export(p_actor uuid, p_org uuid, p_count integer, p_ip inet, p_ua text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_role(p_actor, p_org, array['owner', 'accountant']::public.member_role[]);
  perform private.log(p_org, p_actor, 'user', 'documents_exportes', 'organization', p_org::text, p_ip, p_ua,
                      jsonb_build_object('documents', greatest(coalesce(p_count, 0), 0)));
end $$;

-- -----------------------------------------------------------------------------
-- Vérification publique : « document plus conservé » pour qui présente le bon code
-- -----------------------------------------------------------------------------
create or replace function public.verify_receipt(p_id uuid, p_code text)
returns table (verdict text, receipt_number text, landlord_name text, tenant_masked text,
               property_location text, period date, amount bigint, paid_at timestamptz,
               issued_at timestamptz, fingerprint text, revoked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.receipts;
  t private.purged_documents;
  v_code text := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g'));
  v_payload text;
begin
  select * into r from public.receipts where id = p_id;
  if not found then
    select * into t from private.purged_documents d where d.id = p_id and d.kind = 'quittance';
    if found and char_length(v_code) >= 16 and left(v_code, 16) = t.code_prefix then
      return query select 'plus_conserve'::text, t.number, null::text, null::text, null::text,
                          null::date, null::bigint, null::timestamptz, t.issued_at, null::text, null::timestamptz;
      return;
    end if;
  end if;
  if r.id is null or char_length(v_code) < 16 or left(r.signature, char_length(v_code)) <> v_code then
    return query select 'invalide'::text, null::text, null::text, null::text, null::text,
                        null::date, null::bigint, null::timestamptz, null::timestamptz, null::text, null::timestamptz;
    return;
  end if;

  v_payload := case r.signature_version
    when 2 then private.receipt_payload_v2(r)
    else private.receipt_payload(r.id, r.receipt_number, r.org_id, r.invoice_id, r.tenant_name,
                                 r.property_label, r.period, r.amount, r.paid_at)
  end;
  if encode(extensions.hmac(v_payload, private.receipt_secret(), 'sha256'), 'hex') <> r.signature
     or encode(extensions.digest(v_payload, 'sha256'), 'hex') <> r.content_hash then
    return query select 'alteree'::text, r.receipt_number, null::text, null::text, null::text,
                        null::date, null::bigint, null::timestamptz, null::timestamptz, null::text, null::timestamptz;
    return;
  end if;

  return query select
    case r.status when 'annulee' then 'annulee' else 'authentique' end,
    r.receipt_number, r.landlord_name, private.mask_name(r.tenant_name),
    r.property_location, r.period, r.amount, r.paid_at, r.issued_at,
    upper(left(r.content_hash, 16)), r.revoked_at;
end $$;

create or replace function public.verify_notice(p_id uuid, p_code text)
returns table (verdict text, payment_reference text, landlord_name text, tenant_masked text,
               property_location text, period date, amount_due bigint, due_date date,
               issued_at timestamptz, fingerprint text)
language plpgsql stable security definer set search_path = '' as $$
declare
  n public.notices;
  t private.purged_documents;
  v_code text := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g'));
  v_payload text;
  v_cancelled boolean;
begin
  select * into n from public.notices where id = p_id;
  if not found then
    select * into t from private.purged_documents d where d.id = p_id and d.kind = 'avis';
    if found and char_length(v_code) >= 16 and left(v_code, 16) = t.code_prefix then
      return query select 'plus_conserve'::text, t.number, null::text, null::text, null::text,
                          null::date, null::bigint, null::date, t.issued_at, null::text;
      return;
    end if;
  end if;
  if n.id is null or char_length(v_code) < 16 or left(n.signature, char_length(v_code)) <> v_code then
    return query select 'invalide'::text, null::text, null::text, null::text, null::text,
                        null::date, null::bigint, null::date, null::timestamptz, null::text;
    return;
  end if;
  v_payload := private.notice_payload_v1(n);
  if encode(extensions.hmac(v_payload, private.receipt_secret(), 'sha256'), 'hex') <> n.signature
     or encode(extensions.digest(v_payload, 'sha256'), 'hex') <> n.content_hash then
    return query select 'alteree'::text, n.payment_reference, null::text, null::text, null::text,
                        null::date, null::bigint, null::date, null::timestamptz, null::text;
    return;
  end if;
  select i.status = 'annule' into v_cancelled from public.invoices i where i.id = n.invoice_id;
  return query select case when v_cancelled then 'annulee' else 'authentique' end,
    n.payment_reference, n.landlord_name, private.mask_name(n.tenant_name), n.property_location,
    n.period, n.amount_due, n.due_date, n.issued_at, upper(left(n.content_hash, 16));
end $$;

-- -----------------------------------------------------------------------------
-- Message d'alerte (file P3.2) : destinataires = propriétaires et comptables
-- -----------------------------------------------------------------------------
create or replace function private.outbox_message(o private.outbox)
returns table (recipients jsonb, data jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_staff  jsonb;
  v_pay    record;
  v_inv    record;
  v_tenant jsonb;
  v_roles  public.member_role[];
begin
  v_roles := case when o.kind = 'alerte_compte_reception' then array['owner']::public.member_role[]
                  else array['owner', 'accountant']::public.member_role[] end;
  select coalesce(jsonb_agg(distinct jsonb_build_object('email', lower(u.email), 'name', coalesce(pr.full_name, ''))), '[]')
    into v_staff
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles pr on pr.id = m.user_id
   where m.org_id = o.org_id and m.role = any (v_roles) and u.email is not null;

  if o.kind in ('paiement_declare', 'paiement_confirme', 'paiement_rejete', 'declaration_en_attente') then
    select p.amount, p.method, p.created_at, i.id as invoice_id, i.period, i.payment_reference,
           t.full_name as tenant_name, coalesce(tu.email, t.email) as tenant_email
      into v_pay
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
      join public.tenants t on t.id = i.tenant_id
      left join auth.users tu on tu.id = t.user_id
     where p.id = (o.payload ->> 'payment_id')::uuid;
    if not found then return query select '[]'::jsonb, '{}'::jsonb; return; end if;
    v_tenant := case when v_pay.tenant_email is null then '[]'::jsonb
                     else jsonb_build_array(jsonb_build_object('email', lower(v_pay.tenant_email), 'name', v_pay.tenant_name)) end;
    return query select
      case when o.kind in ('paiement_confirme', 'paiement_rejete') then v_tenant else v_staff end,
      jsonb_build_object('montant', v_pay.amount, 'mode', v_pay.method, 'periode', v_pay.period,
                         'reference', v_pay.payment_reference, 'locataire', v_pay.tenant_name,
                         'invoice_id', v_pay.invoice_id, 'declare_le', v_pay.created_at);
  elsif o.kind = 'relance_loyer' then
    select i.id, i.period, i.due_date, i.amount_due - i.amount_paid as remaining, i.payment_reference, i.status,
           t.full_name as tenant_name, coalesce(tu.email, t.email) as tenant_email, t.user_id is not null as has_account
      into v_inv
      from public.invoices i
      join public.tenants t on t.id = i.tenant_id
      left join auth.users tu on tu.id = t.user_id
     where i.id = (o.payload ->> 'invoice_id')::uuid;
    if not found or v_inv.status in ('paye', 'annule') or v_inv.tenant_email is null then
      return query select '[]'::jsonb, '{}'::jsonb; return;
    end if;
    return query select
      jsonb_build_array(jsonb_build_object('email', lower(v_inv.tenant_email), 'name', v_inv.tenant_name)),
      jsonb_build_object('montant', v_inv.remaining, 'periode', v_inv.period, 'echeance', v_inv.due_date,
                         'etape', (o.payload ->> 'etape')::int, 'reference', v_inv.payment_reference,
                         'invoice_id', v_inv.id, 'compte', v_inv.has_account);
  elsif o.kind = 'purge_documents_prochaine' then
    return query select v_staff,
      jsonb_build_object('nombre', (o.payload ->> 'nombre')::int, 'a_partir_du', o.payload ->> 'a_partir_du');
  elsif o.kind = 'alerte_compte_reception' then
    return query select v_staff,
      jsonb_build_object('type', o.payload ->> 'type', 'effectif_le', o.payload ->> 'effectif_le');
  elsif o.kind in ('depart_locataire', 'rappel_suppression_compte') then
    return query select
      coalesce((select jsonb_build_array(jsonb_build_object('email', lower(u.email), 'name', coalesce(pr.full_name, '')))
                  from auth.users u left join public.profiles pr on pr.id = u.id
                 where u.id = (o.payload ->> 'user_id')::uuid and u.email is not null), '[]'::jsonb),
      jsonb_build_object('suppression_le', o.payload ->> 'suppression_le');
  else
    return query select '[]'::jsonb, '{}'::jsonb;
  end if;
end $$;

revoke execute on function private.document_retention() from public, anon, authenticated;
revoke execute on function private.queue_proof_deletion() from public, anon, authenticated;
revoke execute on function public.purge_expired_documents() from public, anon, authenticated;
revoke execute on function public.claim_storage_deletions(integer) from public, anon, authenticated;
revoke execute on function public.complete_storage_deletion(bigint, text) from public, anon, authenticated;
revoke execute on function public.enqueue_purge_alerts() from public, anon, authenticated;
revoke execute on function public.log_documents_export(uuid, uuid, integer, inet, text) from public, anon, authenticated;
grant execute on function
  public.purge_expired_documents(),
  public.claim_storage_deletions(integer),
  public.complete_storage_deletion(bigint, text),
  public.enqueue_purge_alerts(),
  public.log_documents_export(uuid, uuid, integer, inet, text)
to service_role;
