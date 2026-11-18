/**
 * Formes des requêtes imbriquées utilisées par les composants. Les énumérations
 * dérivent des types générés (src/types/supabase.ts, via src/types/db.ts) :
 * toute divergence avec la base fait échouer `npm run typecheck`.
 */
import type { Enums } from "./db";

export type MemberRole = Enums<"member_role">;
export type InvoiceStatus = Enums<"invoice_status">;
export type PaymentStatus = Enums<"payment_status">;
export type PaymentMethod = Enums<"payment_method">;
export type PropertyType = Enums<"property_type">;

export interface DashboardKpis {
  collected: number;
  expected: number;
  pending: number;
  overdue_count: number;
  overdue_amount: number;
  properties_total: number;
  properties_occupied: number;
  transfers_pending: number;
}

export interface InvoiceRow {
  id: string;
  period: string;
  amount_due: number;
  amount_paid: number;
  due_date: string;
  status: InvoiceStatus;
  payment_reference: string;
  tenants: { full_name: string; phone: string; email: string | null } | null;
  leases: { properties: { code: string; label: string; commune: string; quartier: string | null; type: PropertyType } | null } | null;
}

export interface PendingTransferRow {
  id: string;
  amount: number;
  bank_reference: string | null;
  created_at: string;
  invoices: {
    payment_reference: string;
    period: string;
    amount_due: number;
    amount_paid: number;
    tenants: { full_name: string } | null;
  } | null;
}

export interface TenantInvoiceRow {
  id: string;
  org_id: string;
  period: string;
  amount_due: number;
  amount_paid: number;
  due_date: string;
  status: InvoiceStatus;
  payment_reference: string;
  organizations: { name: string } | null;
  tenants: { full_name: string; phone: string } | null;
  leases: { properties: { label: string; commune: string; quartier: string | null; city: string } | null } | null;
  payments: {
    id: string;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: number;
    created_at: string;
    failure_reason: string | null;
  }[];
}

export interface ReceiptRow {
  id: string;
  receipt_number: string;
  landlord_name: string;
  tenant_name: string;
  property_label: string;
  property_location: string;
  period: string;
  rent_amount: number;
  charges_amount: number;
  amount: number;
  payment_methods: string;
  paid_at: string;
  content_hash: string;
  signature: string;
  status: "valide" | "annulee";
  issued_at: string;
}

export interface VerifyReceiptResult {
  verdict: "authentique" | "annulee" | "invalide" | "alteree";
  receipt_number: string | null;
  landlord_name: string | null;
  tenant_masked: string | null;
  property_location: string | null;
  period: string | null;
  amount: number | null;
  paid_at: string | null;
  issued_at: string | null;
  fingerprint: string | null;
  revoked_at: string | null;
}
