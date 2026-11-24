import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, MAILPIT, OWNER, payableInvoice, TENANT } from "./helpers";

/** P3.2 : notifications e-mail automatiques (adresse unique LoyerCI, Mailpit en local). */
test.describe.configure({ mode: "serial" });
const ROUTE = "/api/cron/notifications";
const auth = () => ({ Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` });

async function runCron(request: APIRequestContext) {
  // Vide la file (plusieurs appels si besoin : 3 lots de 20 par appel).
  for (let i = 0; i < 10; i++) {
    const r = await request.get(ROUTE, { headers: auth() });
    expect(r.status()).toBe(200);
    const body = (await r.json()) as { sent: number; failed: number };
    if (body.sent + body.failed === 0) return;
  }
}

type MailpitList = { messages?: { ID: string; Created: string; Subject: string; To: { Address: string }[] }[] };
async function mailFor(to: string, subject: RegExp, since: number) {
  for (let i = 0; i < 20; i++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=200`)).json()) as MailpitList;
    const m = list.messages?.find(
      (x) => x.To.some((t) => t.Address === to) && subject.test(x.Subject) && new Date(x.Created).getTime() >= since - 2000,
    );
    if (m) return (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string; HTML: string; Bcc: unknown[] };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`aucun e-mail « ${subject.source} » pour ${to}`);
}

test("la route d'expédition exige le secret de l'ordonnanceur", async ({ request }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  expect((await request.get(ROUTE)).status()).toBe(401);
  expect((await request.get(ROUTE, { headers: { Authorization: "Bearer mauvais-secret-mauvais-secret-000000" } })).status()).toBe(401);
});

test.describe("locataire puis bailleur", () => {
  test("déclaration -> e-mail au bailleur ; confirmation -> e-mail au locataire, sans coordonnée", async ({ request }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await runCron(request); // file existante (seed) expédiée d'abord
    const inv = await payableInvoice("Kouassi Jean-Marc");
    const since = Date.now();
    // Déclaration par la fonction métier, au nom du locataire (le parcours « J'ai payé » est
    // couvert par encaissement.spec ; ici, le limiteur de l'action serait partagé entre suites).
    const db = admin();
    const { data: tenantUser } = await db.from("tenants").select("user_id").eq("full_name", "Kouassi Jean-Marc").single();
    const { error: declError } = await db.rpc("submit_direct_payment", {
      p_actor: tenantUser!.user_id!,
      p_invoice: inv.id,
      p_operator: "wave",
      p_amount: inv.amount,
      p_txn_ref: null,
      p_payer_msisdn: null,
      p_proof_path: null,
      p_ip: null,
      p_ua: "e2e",
    });
    expect(declError).toBeNull();

    await runCron(request);
    const toOwner = await mailFor(OWNER, /^Paiement à confirmer : Kouassi Jean-Marc/, since);
    expect(toOwner.Text).toContain("/dashboard");
    expect(toOwner.Text).not.toMatch(/\b(?:225)?0[157](?:\s?\d{2}){4}\b/); // aucun numéro Mobile Money
    expect(toOwner.Bcc ?? []).toEqual([]);

    // Confirmation par la propriétaire (fonction métier, comme le bouton du tableau de bord).
    const { data: pay } = await db.from("payments").select("id").eq("invoice_id", inv.id).single();
    const { data: owner } = await db.from("memberships").select("user_id").eq("role", "owner").order("created_at").limit(1).single();
    const { error } = await db.rpc("review_manual_payment", {
      p_actor: owner!.user_id,
      p_payment: pay!.id,
      p_approve: true,
      p_reason: null,
      p_ip: null,
      p_ua: "e2e",
    });
    expect(error).toBeNull();
    const since2 = Date.now();
    await runCron(request);
    const toTenant = await mailFor(TENANT, /^Votre paiement de .* est confirmé$/, since2);
    expect(toTenant.Text).toContain(`/pay/${inv.id}`);
    expect(toTenant.Text).toContain("LoyerCI ne vous demandera jamais de payer");
  });
});
