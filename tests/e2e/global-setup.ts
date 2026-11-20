import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { ACCOUNTANT, accountantState, loginByMagicLink, OWNER, ownerState, TENANT, tenantState } from "./helpers";

/** Une seule connexion par rôle (limite Supabase : 1 lien par minute et par adresse). */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  mkdirSync("test-results/.auth", { recursive: true });
  const browser = await chromium.launch();
  for (const [email, path] of [
    [OWNER, ownerState],
    [TENANT, tenantState],
    [ACCOUNTANT, accountantState],
  ] as const) {
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await loginByMagicLink(page, email);
    await ctx.storageState({ path });
    await ctx.close();
  }
  await browser.close();
}
