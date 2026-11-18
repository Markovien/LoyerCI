#!/usr/bin/env node
/**
 * Invariant n° 10 : aucun fichier « use client » n'importe un module serveur
 * (client service_role, variables d'environnement serveur, secrets). `server-only`
 * fait déjà échouer le build en cas d'import transitif ; ce contrôle donne une
 * erreur immédiate et lisible au lint.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const FORBIDDEN = [/@\/lib\/supabase\/admin\b/, /@\/lib\/env\b/, /@\/lib\/security\/crypto\b/, /\bnode:crypto\b/, /\bserver-only\b/];
const root = new URL("..", import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) files.push(p);
  }
})(join(root, "src"));

let errors = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (!/^\s*["']use client["']/.test(src)) continue;
  for (const m of src.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)) {
    if (FORBIDDEN.some((re) => re.test(m[1]))) {
      console.error(`✗ ${relative(root, f)} : import serveur interdit dans un composant client → ${m[1]}`);
      errors++;
    }
  }
}
if (errors) process.exit(1);
console.log(`✓ ${files.length} fichiers : aucun import serveur dans un composant client`);
