import type { MobileOperator } from "@/lib/validation/schemas";

/** Pastilles aux couleurs des opérateurs (pas de logos déposés). */
export const OPERATORS: { id: MobileOperator; name: string; hint: string; swatch: string }[] = [
  { id: "orange", name: "Orange Money", hint: "07 …", swatch: "bg-[#ff7900] text-white" },
  { id: "mtn", name: "MTN MoMo", hint: "05 …", swatch: "bg-[#ffcc00] text-[#1d1d1b]" },
  { id: "wave", name: "Wave", hint: "Application Wave", swatch: "bg-[#1dc8ff] text-[#0b1b4d]" },
  { id: "moov", name: "Moov Money", hint: "01 …", swatch: "bg-[#0055a4] text-white" },
];

export const operatorName = (id: MobileOperator) => OPERATORS.find((o) => o.id === id)?.name ?? id;

/** « 2250707000111 » ou « +2250707000111 » -> « 0707000111 » (saisie dans l'appli de l'opérateur). */
export const localNumber = (msisdn: string) => msisdn.replace(/^\+?225/, "");

/** « 0707000111 » -> « 07 07 00 01 11 » */
export const groupNumber = (local: string) => local.replace(/(\d{2})(?=\d)/g, "$1 ");
