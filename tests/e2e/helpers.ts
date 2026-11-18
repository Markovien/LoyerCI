import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

export const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
export const OWNER = "adjoua.coulibaly@akwaba-immo.ci";
export const TENANT = "jm.kouassi@exemple.ci";
export const ownerState = "test-results/.auth/owner.json";
export const tenantState = "test-results/.auth/tenant.json";

/** Client service_role LOCAL pour préparer les données de test (jamais en production). */
export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("e2e : Supabase local uniquement");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant");
  return createClient(url, key, { auth: { persistSession: false } });
}

interface MailpitList {
  messages?: { ID: string; To: { Address: string }[] }[];
}

/** Connexion réelle par lien magique : formulaire → Mailpit → lien → session. */
export async function loginByMagicLink(page: Page, email: string) {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
  await page.goto("/login");
  await page.fill("#email", email);
  await page.click("button[type=submit]");
  await page.getByRole("status").waitFor();
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as MailpitList;
    const m = list.messages?.find((x) => x.To.some((t) => t.Address === email));
    if (!m) continue;
    const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { HTML?: string; Text?: string };
    const link = (msg.HTML ?? msg.Text ?? "").match(/https?:\/\/[^"'\s<>]+verify[^"'\s<>]*/)?.[0]?.replace(/&amp;/g, "&");
    if (!link) throw new Error("lien magique introuvable dans l'e-mail");
    await page.goto(link);
    await page.waitForLoadState("networkidle");
    return;
  }
  throw new Error(`aucun lien magique reçu pour ${email} (limite d'envoi : 1 par minute et par adresse)`);
}

/** Prochain mois (AAAA-MM-01) : avis payable garanti, quel que soit l'état du seed. */
export function nextPeriod(offsetMonths = 1) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offsetMonths);
  return d.toISOString().slice(0, 10);
}
