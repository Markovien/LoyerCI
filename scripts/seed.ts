/**
 * Données de démonstration réalistes (Abidjan + intérieur) pour un projet Supabase LOCAL.
 * Usage : npm run seed   (après `supabase start` et `supabase db reset`)
 * Utilise la clé service_role : ne JAMAIS exécuter contre la production.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant");
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) throw new Error("Seed autorisé uniquement en local");
// Base locale de `supabase start` (superutilisateur), réservée aux seules opérations de démo
// impossibles via l'API. Tout hôte non local est refusé.
const localDbUrl = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost"].includes(new URL(localDbUrl).hostname)) throw new Error("SUPABASE_DB_URL doit être locale");

const db = createClient(url, key, { auth: { persistSession: false } });
const PASSWORD = "Demo-LoyerCI-2026!";

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>, label: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${label} : ${JSON.stringify(error)}`);
  return data as NonNullable<T>;
}

async function user(email: string, fullName: string, phone?: string) {
  const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`Utilisateur ${email} : ${error.message}`);
  await must(db.from("profiles").insert({ id: data.user.id, full_name: fullName, phone }), "profil");
  return data.user.id;
}

function monthStart(offset: number) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("→ Comptes");
  const owner = await user("adjoua.coulibaly@akwaba-immo.ci", "Adjoua Coulibaly", "2250707000111");
  const accountant = await user("compta@akwaba-immo.ci", "Serge Kacou", "2250505000222");
  const kouassi = await user("jm.kouassi@exemple.ci", "Kouassi Jean-Marc", "2250707123456");
  const traore = await user("mariam.traore@exemple.ci", "Traoré Mariam", "2250505987654");

  console.log("→ Organisation");
  const [org] = await must(
    db
      .from("organizations")
      .insert({ name: "Akwaba Immobilier", kind: "agence", receipt_prefix: "AKW", contact_phone: "2252722445566" })
      .select("id"),
    "organisation",
  );
  const orgId = org!.id as string;
  await must(
    db.from("memberships").insert([
      { org_id: orgId, user_id: owner, role: "owner" },
      { org_id: orgId, user_id: accountant, role: "accountant" },
    ]),
    "membres",
  );

  console.log("→ Biens");
  const properties = [
    { code: "VCR01", label: "Villa Duplex 5 pièces", type: "villa", city: "Abidjan", commune: "Cocody", quartier: "Riviera 3" },
    { code: "APT12", label: "Appartement 3 pièces", type: "appartement", city: "Abidjan", commune: "Marcory", quartier: "Zone 4" },
    { code: "STU04", label: "Studio meublé", type: "studio", city: "Abidjan", commune: "Yopougon", quartier: "Selmer" },
    { code: "MAG03", label: "Magasin 40 m²", type: "magasin", city: "Abidjan", commune: "Plateau", quartier: "Avenue Chardy" },
    { code: "BUR02", label: "Plateau de bureaux 60 m²", type: "bureau", city: "Abidjan", commune: "Plateau", quartier: "Rue du Commerce" },
    {
      code: "VBA07",
      label: "Villa basse 4 pièces",
      type: "villa",
      city: "Bingerville",
      commune: "Bingerville",
      quartier: "Cité Feh Kessé",
    },
    { code: "APT05", label: "Appartement 2 pièces", type: "appartement", city: "Bouaké", commune: "Bouaké", quartier: "Commerce" },
    { code: "APT21", label: "Appartement 4 pièces", type: "appartement", city: "Abidjan", commune: "Cocody", quartier: "Angré 8e Tranche" },
  ].map((p) => ({ ...p, org_id: orgId }));
  const props = await must(db.from("properties").insert(properties).select("id, code"), "biens");
  const pid = (code: string) => props.find((p) => p.code === code)!.id as string;

  console.log("→ Locataires");
  const tenants = await must(
    db
      .from("tenants")
      .insert([
        { org_id: orgId, user_id: kouassi, full_name: "Kouassi Jean-Marc", phone: "2250707123456", email: "jm.kouassi@exemple.ci" },
        { org_id: orgId, user_id: traore, full_name: "Traoré Mariam", phone: "2250505987654", email: "mariam.traore@exemple.ci" },
        { org_id: orgId, full_name: "Koné Ibrahim", phone: "2250101445566" },
        { org_id: orgId, full_name: "Bamba & Fils SARL", phone: "2250707889900", email: "contact@bamba-fils.ci" },
        { org_id: orgId, full_name: "Cabinet N'Guessan & Associés", phone: "2252720301122", email: "cabinet@nguessan-avocats.ci" },
        { org_id: orgId, full_name: "Yao Affoué Christelle", phone: "2250566778899" },
        { org_id: orgId, full_name: "Ouattara Seydou", phone: "2250102030405" },
      ])
      .select("id, full_name"),
    "locataires",
  );
  const tid = (name: string) => tenants.find((t) => t.full_name.startsWith(name))!.id as string;

  console.log("→ Baux (via create_lease, journalisé)");
  const leases: [string, string, "habitation" | "professionnel", number, number, number, number, number, string][] = [
    ["VCR01", "Kouassi", "habitation", 450000, 0, 2, 2, 5, "2025-09-01"],
    ["APT12", "Traoré", "habitation", 250000, 15000, 2, 2, 5, "2026-01-01"],
    ["STU04", "Koné", "habitation", 85000, 0, 2, 1, 5, "2025-06-01"],
    ["MAG03", "Bamba", "professionnel", 600000, 25000, 3, 3, 5, "2024-11-01"],
    ["BUR02", "Cabinet", "professionnel", 750000, 50000, 3, 3, 10, "2025-03-01"],
    ["VBA07", "Yao", "habitation", 300000, 0, 2, 2, 5, "2025-12-01"],
    ["APT05", "Ouattara", "habitation", 120000, 0, 2, 2, 5, "2026-02-01"],
  ];
  for (const [code, tenant, usage, rent, charges, dep, adv, day, start] of leases) {
    await must(
      db.rpc("create_lease", {
        p_actor: owner,
        p_org: orgId,
        p_property: pid(code),
        p_tenant: tid(tenant),
        p_usage: usage,
        p_rent: rent,
        p_charges: charges,
        p_deposit_months: dep,
        p_advance_months: adv,
        p_due_day: day,
        p_start: start,
        p_ip: "127.0.0.1",
        p_ua: "seed",
      }),
      `bail ${code}`,
    );
  }

  console.log("→ RIB du bailleur");
  await must(db.rpc("grant_reauth", { p_actor: owner, p_ip: "127.0.0.1", p_ua: "seed" }), "ré-authentification");
  await must(
    db.rpc("add_payout_account", {
      p_actor: owner,
      p_org: orgId,
      p_kind: "banque",
      p_holder: "AKWABA IMMOBILIER SARL",
      p_bank: "Société Générale Côte d'Ivoire",
      p_iban: "CI15CI0080111301340012530091",
      p_operator: null,
      p_msisdn: null,
      p_ip: "127.0.0.1",
      p_ua: "seed",
    }),
    "RIB",
  );

  console.log("→ Comptes Mobile Money du bailleur (paiement direct)");
  // Ajout par la fonction métier (journalisé), donc soumis à la carence de 48 h...
  for (const a of [
    { p_kind: "mobile_money", p_operator: "orange", p_msisdn: "2250707000111" },
    { p_kind: "mobile_money", p_operator: "wave", p_msisdn: "2250505000333" },
  ] as const) {
    await must(db.rpc("grant_reauth", { p_actor: owner, p_ip: "127.0.0.1", p_ua: "seed" }), "ré-authentification");
    await must(
      db.rpc("add_payout_account", {
        p_actor: owner,
        p_org: orgId,
        p_holder: "AKWABA IMMOBILIER SARL",
        p_bank: null,
        p_iban: null,
        p_ip: "127.0.0.1",
        p_ua: "seed",
        ...a,
      }),
      `compte ${a.p_operator}`,
    );
  }
  // ...puis, DÉMO LOCALE UNIQUEMENT, carence réputée écoulée et nom attendu renseigné, par une
  // connexion superutilisateur à la base locale : impossible via l'API (même service_role ne
  // peut pas écrire directement dans payout_accounts).
  const sql = postgres(localDbUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`; // contourne le trigger d'immuabilité (démo)
      await tx`update public.payout_accounts
                  set activates_at = now() - interval '49 hours', display_name_expected = 'AKWABA IMMOBILIER'
                where org_id = ${orgId} and kind = 'mobile_money'`;
      await tx`insert into public.payout_accounts (org_id, kind, account_holder, pispi_alias, display_name_expected, activates_at, created_by)
               values (${orgId}, 'pispi_alias', 'AKWABA IMMOBILIER SARL', '+2250707000111', 'AKWABA IMMOBILIER',
                       now() - interval '49 hours', ${owner})`;
    });
  } finally {
    await sql.end();
  }
  await must(
    db.rpc("set_payment_settings", {
      p_actor: owner,
      p_org: orgId,
      p_direct: true,
      p_cinetpay: false,
      p_transfer: true,
      p_fees_notice: "Les frais de transfert éventuels sont à votre charge, selon la grille en vigueur de votre opérateur.",
      p_cash_threshold: 100000,
      p_ip: "127.0.0.1",
      p_ua: "seed",
    }),
    "paramètres de paiement",
  );

  console.log("→ Avis d'échéance (mois précédent + mois courant)");
  const prev = monthStart(-1),
    cur = monthStart(0);
  await must(db.rpc("generate_monthly_invoices", { p_period: prev }), "avis M-1");
  await must(db.rpc("generate_monthly_invoices", { p_period: cur }), "avis M");
  const invoices = await must(db.from("invoices").select("id, period, tenant_id, amount_due"), "lecture avis");
  const inv = (tenant: string, period: string) => invoices.find((i) => i.tenant_id === tid(tenant) && i.period === period)!;

  async function mobileMoney(tenant: string, actor: string, period: string, operator: "orange" | "mtn" | "wave" | "moov") {
    const i = inv(tenant, period);
    const tx = `SEED${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
    const intent = await must(
      db
        .rpc("create_payment_intent", {
          p_actor: actor,
          p_invoice: i.id,
          p_provider: "cinetpay",
          p_operator: operator,
          p_tx_id: tx,
          p_ip: "41.66.10.20",
          p_ua: "seed",
        })
        .single<{ amount: number }>(),
      "intention",
    );
    // Simule le webhook signé + revérification fournisseur.
    await must(
      db.rpc("confirm_provider_payment", {
        p_provider: "cinetpay",
        p_tx_id: tx,
        p_amount: intent.amount,
        p_currency: "XOF",
        p_operator: operator,
        p_ip: "41.202.208.1",
        p_meta: { seed: true },
      }),
      "confirmation",
    );
  }

  console.log("→ Paiements");
  // Seuls les locataires disposant d'un compte peuvent initier un paiement en ligne ;
  // les autres règlements du mois précédent sont encaissés en espèces par la propriétaire.
  await mobileMoney("Kouassi", kouassi, prev, "wave");
  await mobileMoney("Traoré", traore, prev, "mtn");
  for (const t of ["Koné", "Bamba", "Cabinet", "Ouattara"]) {
    const i = inv(t, prev);
    await must(
      db.rpc("record_cash_payment", { p_actor: owner, p_invoice: i.id, p_amount: i.amount_due, p_ip: "127.0.0.1", p_ua: "seed" }),
      "espèces M-1",
    );
  }
  // Yao : mois précédent impayé → retard.

  await mobileMoney("Kouassi", kouassi, cur, "wave"); // ✅ quittance émise

  // Traoré : virement déclaré, preuve en attente de validation
  const tInv = inv("Traoré", cur);
  const proofPath = `${orgId}/${tInv.id}/${randomUUID()}.pdf`;
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  await must(db.storage.from("transfer-proofs").upload(proofPath, pdf, { contentType: "application/pdf" }), "preuve");
  await must(
    db.rpc("submit_transfer_proof", {
      p_actor: traore,
      p_invoice: tInv.id,
      p_amount: tInv.amount_due,
      p_bank_reference: "SGCI-VIR-20261103-7781",
      p_proof_path: proofPath,
      p_tx_id: `VIR-${randomUUID()}`,
      p_ip: "41.66.9.9",
      p_ua: "seed",
    }),
    "virement",
  );

  // Koné : acompte en espèces saisi par la comptable (sous le seuil : imputé aussitôt)
  await must(
    db.rpc("record_cash_payment", {
      p_actor: accountant,
      p_invoice: inv("Koné", cur).id,
      p_amount: 40000,
      p_ip: "127.0.0.1",
      p_ua: "seed",
    }),
    "acompte",
  );
  // Bamba : espèces saisies par la comptable AU-DELÀ du seuil (décision D2) :
  // en attente de confirmation par la propriétaire, aucune quittance avant.
  const b = inv("Bamba", cur);
  await must(
    db.rpc("record_cash_payment", { p_actor: accountant, p_invoice: b.id, p_amount: b.amount_due, p_ip: "127.0.0.1", p_ua: "seed" }),
    "Bamba",
  );

  await must(db.rpc("mark_overdue_invoices"), "retards");

  console.log("\n✅ Données de démonstration prêtes.");
  console.log("   Propriétaire : adjoua.coulibaly@akwaba-immo.ci");
  console.log("   Locataire    : jm.kouassi@exemple.ci");
  console.log("   Connexion par lien magique (boîte mail locale Supabase : http://127.0.0.1:54324)");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
