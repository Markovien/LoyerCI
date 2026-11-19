export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      allowed_payment_link_hosts: {
        Row: {
          created_at: string;
          host: string;
          note: string | null;
          operator: Database["public"]["Enums"]["mobile_operator"];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          host: string;
          note?: string | null;
          operator: Database["public"]["Enums"]["mobile_operator"];
        };
        Update: {
          created_at?: string;
          host?: string;
          note?: string | null;
          operator?: Database["public"]["Enums"]["mobile_operator"];
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_kind: string;
          chain_seq: number;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          hash: string;
          hash_version: number;
          id: number;
          ip: unknown;
          metadata: NonNullable<Json>;
          org_id: string | null;
          prev_hash: string;
          user_agent: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_kind: string;
          chain_seq: number;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          hash: string;
          hash_version?: number;
          id?: never;
          ip?: unknown;
          metadata?: NonNullable<Json>;
          org_id?: string | null;
          prev_hash: string;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_kind?: string;
          chain_seq?: number;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          hash?: string;
          hash_version?: number;
          id?: never;
          ip?: unknown;
          metadata?: NonNullable<Json>;
          org_id?: string | null;
          prev_hash?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          amount_due: number | null;
          amount_paid: number;
          charges_amount: number;
          created_at: string;
          credit_amount: number;
          due_date: string;
          id: string;
          lease_id: string;
          org_id: string;
          paid_at: string | null;
          payment_reference: string;
          period: string;
          rent_amount: number;
          status: Database["public"]["Enums"]["invoice_status"];
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_due?: never;
          amount_paid?: number;
          charges_amount?: number;
          created_at?: string;
          credit_amount?: number;
          due_date: string;
          id?: string;
          lease_id: string;
          org_id: string;
          paid_at?: string | null;
          payment_reference: string;
          period: string;
          rent_amount: number;
          status?: Database["public"]["Enums"]["invoice_status"];
          tenant_id: string;
        };
        Update: {
          amount_due?: never;
          amount_paid?: number;
          charges_amount?: number;
          created_at?: string;
          credit_amount?: number;
          due_date?: string;
          id?: string;
          lease_id?: string;
          org_id?: string;
          paid_at?: string | null;
          payment_reference?: string;
          period?: string;
          rent_amount?: number;
          status?: Database["public"]["Enums"]["invoice_status"];
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_lease_id_org_id_fkey";
            columns: ["lease_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "leases";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "invoices_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_tenant_id_org_id_fkey";
            columns: ["tenant_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      leases: {
        Row: {
          advance_months: number;
          charges_amount: number;
          created_at: string;
          deposit_months: number;
          due_day: number;
          end_date: string | null;
          id: string;
          org_id: string;
          property_id: string;
          rent_amount: number;
          start_date: string;
          status: Database["public"]["Enums"]["lease_status"];
          tenant_id: string;
          usage: Database["public"]["Enums"]["lease_usage"];
        };
        ComputedFields: never;
        Insert: {
          advance_months?: number;
          charges_amount?: number;
          created_at?: string;
          deposit_months?: number;
          due_day?: number;
          end_date?: string | null;
          id?: string;
          org_id: string;
          property_id: string;
          rent_amount: number;
          start_date: string;
          status?: Database["public"]["Enums"]["lease_status"];
          tenant_id: string;
          usage?: Database["public"]["Enums"]["lease_usage"];
        };
        Update: {
          advance_months?: number;
          charges_amount?: number;
          created_at?: string;
          deposit_months?: number;
          due_day?: number;
          end_date?: string | null;
          id?: string;
          org_id?: string;
          property_id?: string;
          rent_amount?: number;
          start_date?: string;
          status?: Database["public"]["Enums"]["lease_status"];
          tenant_id?: string;
          usage?: Database["public"]["Enums"]["lease_usage"];
        };
        Relationships: [
          {
            foreignKeyName: "leases_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leases_property_id_org_id_fkey";
            columns: ["property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "leases_tenant_id_org_id_fkey";
            columns: ["tenant_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          org_id: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          org_id: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      operator_ref_formats: {
        Row: {
          example: string | null;
          operator: Database["public"]["Enums"]["mobile_operator"];
          pattern: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          example?: string | null;
          operator: Database["public"]["Enums"]["mobile_operator"];
          pattern: string;
          updated_at?: string;
        };
        Update: {
          example?: string | null;
          operator?: Database["public"]["Enums"]["mobile_operator"];
          pattern?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      org_payment_settings: {
        Row: {
          cash_validation_threshold: number;
          cinetpay_enabled: boolean;
          direct_enabled: boolean;
          fees_notice: string | null;
          org_id: string;
          transfer_enabled: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          cash_validation_threshold?: number;
          cinetpay_enabled?: boolean;
          direct_enabled?: boolean;
          fees_notice?: string | null;
          org_id: string;
          transfer_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          cash_validation_threshold?: number;
          cinetpay_enabled?: boolean;
          direct_enabled?: boolean;
          fees_notice?: string | null;
          org_id?: string;
          transfer_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "org_payment_settings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          contact_phone: string | null;
          created_at: string;
          id: string;
          kind: string;
          name: string;
          receipt_prefix: string;
        };
        ComputedFields: never;
        Insert: {
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          name: string;
          receipt_prefix?: string;
        };
        Update: {
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          receipt_prefix?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          amount: number;
          bank_reference: string | null;
          checkout_url: string | null;
          created_at: string;
          currency: string;
          declared_by: string | null;
          failure_reason: string | null;
          id: string;
          invoice_id: string;
          method: Database["public"]["Enums"]["payment_method"];
          operator: Database["public"]["Enums"]["mobile_operator"] | null;
          operator_txn_ref: string | null;
          org_id: string;
          payer_msisdn: string | null;
          proof_path: string | null;
          provider: Database["public"]["Enums"]["payment_provider"];
          provider_transaction_id: string;
          status: Database["public"]["Enums"]["payment_status"];
          updated_at: string;
          validated_at: string | null;
          validated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          bank_reference?: string | null;
          checkout_url?: string | null;
          created_at?: string;
          currency?: string;
          declared_by?: string | null;
          failure_reason?: string | null;
          id?: string;
          invoice_id: string;
          method: Database["public"]["Enums"]["payment_method"];
          operator?: Database["public"]["Enums"]["mobile_operator"] | null;
          operator_txn_ref?: string | null;
          org_id: string;
          payer_msisdn?: string | null;
          proof_path?: string | null;
          provider: Database["public"]["Enums"]["payment_provider"];
          provider_transaction_id: string;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Update: {
          amount?: number;
          bank_reference?: string | null;
          checkout_url?: string | null;
          created_at?: string;
          currency?: string;
          declared_by?: string | null;
          failure_reason?: string | null;
          id?: string;
          invoice_id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          operator?: Database["public"]["Enums"]["mobile_operator"] | null;
          operator_txn_ref?: string | null;
          org_id?: string;
          payer_msisdn?: string | null;
          proof_path?: string | null;
          provider?: Database["public"]["Enums"]["payment_provider"];
          provider_transaction_id?: string;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_org_id_fkey";
            columns: ["invoice_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "payments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      payout_accounts: {
        Row: {
          account_holder: string;
          activates_at: string;
          bank_name: string | null;
          created_at: string;
          created_by: string;
          display_name_expected: string | null;
          iban: string | null;
          id: string;
          kind: Database["public"]["Enums"]["payout_kind"];
          msisdn: string | null;
          operator: Database["public"]["Enums"]["mobile_operator"] | null;
          org_id: string;
          payment_link_url: string | null;
          pispi_alias: string | null;
          revoked_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          account_holder: string;
          activates_at?: string;
          bank_name?: string | null;
          created_at?: string;
          created_by: string;
          display_name_expected?: string | null;
          iban?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["payout_kind"];
          msisdn?: string | null;
          operator?: Database["public"]["Enums"]["mobile_operator"] | null;
          org_id: string;
          payment_link_url?: string | null;
          pispi_alias?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          account_holder?: string;
          activates_at?: string;
          bank_name?: string | null;
          created_at?: string;
          created_by?: string;
          display_name_expected?: string | null;
          iban?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["payout_kind"];
          msisdn?: string | null;
          operator?: Database["public"]["Enums"]["mobile_operator"] | null;
          org_id?: string;
          payment_link_url?: string | null;
          pispi_alias?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payout_accounts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          phone: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          full_name: string;
          id: string;
          phone?: string | null;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          phone?: string | null;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          address_details: string | null;
          city: string;
          code: string;
          commune: string;
          created_at: string;
          id: string;
          label: string;
          org_id: string;
          quartier: string | null;
          type: Database["public"]["Enums"]["property_type"];
        };
        ComputedFields: never;
        Insert: {
          address_details?: string | null;
          city?: string;
          code: string;
          commune: string;
          created_at?: string;
          id?: string;
          label: string;
          org_id: string;
          quartier?: string | null;
          type: Database["public"]["Enums"]["property_type"];
        };
        Update: {
          address_details?: string | null;
          city?: string;
          code?: string;
          commune?: string;
          created_at?: string;
          id?: string;
          label?: string;
          org_id?: string;
          quartier?: string | null;
          type?: Database["public"]["Enums"]["property_type"];
        };
        Relationships: [
          {
            foreignKeyName: "properties_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      receipts: {
        Row: {
          amount: number;
          charges_amount: number;
          content_hash: string;
          id: string;
          invoice_id: string;
          issued_at: string;
          landlord_name: string;
          org_id: string;
          paid_at: string;
          payment_methods: string;
          period: string;
          property_label: string;
          property_location: string;
          receipt_number: string;
          rent_amount: number;
          revoked_at: string | null;
          revoked_reason: string | null;
          signature: string;
          signature_version: number;
          status: Database["public"]["Enums"]["receipt_status"];
          tenant_id: string;
          tenant_name: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          charges_amount: number;
          content_hash: string;
          id?: string;
          invoice_id: string;
          issued_at?: string;
          landlord_name: string;
          org_id: string;
          paid_at: string;
          payment_methods: string;
          period: string;
          property_label: string;
          property_location: string;
          receipt_number: string;
          rent_amount: number;
          revoked_at?: string | null;
          revoked_reason?: string | null;
          signature: string;
          signature_version?: number;
          status?: Database["public"]["Enums"]["receipt_status"];
          tenant_id: string;
          tenant_name: string;
        };
        Update: {
          amount?: number;
          charges_amount?: number;
          content_hash?: string;
          id?: string;
          invoice_id?: string;
          issued_at?: string;
          landlord_name?: string;
          org_id?: string;
          paid_at?: string;
          payment_methods?: string;
          period?: string;
          property_label?: string;
          property_location?: string;
          receipt_number?: string;
          rent_amount?: number;
          revoked_at?: string | null;
          revoked_reason?: string | null;
          signature?: string;
          signature_version?: number;
          status?: Database["public"]["Enums"]["receipt_status"];
          tenant_id?: string;
          tenant_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "receipts_invoice_id_org_id_fkey";
            columns: ["invoice_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "receipts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          org_id: string;
          phone: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          org_id: string;
          phone: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          org_id?: string;
          phone?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenants_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_events: {
        Row: {
          event_key: string;
          id: number;
          outcome: string | null;
          payload: NonNullable<Json>;
          processed_at: string | null;
          provider: Database["public"]["Enums"]["payment_provider"];
          received_at: string;
          signature_valid: boolean;
          transaction_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          event_key: string;
          id?: never;
          outcome?: string | null;
          payload: NonNullable<Json>;
          processed_at?: string | null;
          provider: Database["public"]["Enums"]["payment_provider"];
          received_at?: string;
          signature_valid: boolean;
          transaction_id?: string | null;
        };
        Update: {
          event_key?: string;
          id?: never;
          outcome?: string | null;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          provider?: Database["public"]["Enums"]["payment_provider"];
          received_at?: string;
          signature_valid?: boolean;
          transaction_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_payout_account: {
        Args: {
          p_actor: string;
          p_bank: string;
          p_holder: string;
          p_iban: string;
          p_ip: unknown;
          p_kind: Database["public"]["Enums"]["payout_kind"];
          p_msisdn: string;
          p_operator: Database["public"]["Enums"]["mobile_operator"];
          p_org: string;
          p_ua: string;
        };
        Returns: {
          activates_at: string;
          id: string;
        }[];
      };
      cancel_payout_account: {
        Args: { p_account: string; p_actor: string; p_ip: unknown; p_ua: string };
        Returns: undefined;
      };
      confirm_provider_payment: {
        Args: {
          p_amount: number;
          p_currency: string;
          p_ip: unknown;
          p_meta?: Json;
          p_operator: Database["public"]["Enums"]["mobile_operator"];
          p_provider: Database["public"]["Enums"]["payment_provider"];
          p_tx_id: string;
        };
        Returns: string;
      };
      create_lease: {
        Args: {
          p_actor: string;
          p_advance_months: number;
          p_charges: number;
          p_deposit_months: number;
          p_due_day: number;
          p_ip: unknown;
          p_org: string;
          p_property: string;
          p_rent: number;
          p_start: string;
          p_tenant: string;
          p_ua: string;
          p_usage: Database["public"]["Enums"]["lease_usage"];
        };
        Returns: string;
      };
      create_payment_intent: {
        Args: {
          p_actor: string;
          p_invoice: string;
          p_ip: unknown;
          p_operator: Database["public"]["Enums"]["mobile_operator"];
          p_provider: Database["public"]["Enums"]["payment_provider"];
          p_tx_id: string;
          p_ua: string;
        };
        Returns: {
          amount: number;
          checkout_url: string;
          payment_id: string;
          reused: boolean;
          transaction_id: string;
        }[];
      };
      dashboard_kpis: {
        Args: { p_month: string; p_org: string };
        Returns: {
          collected: number;
          expected: number;
          overdue_amount: number;
          overdue_count: number;
          pending: number;
          properties_occupied: number;
          properties_total: number;
          transfers_pending: number;
        }[];
      };
      fail_provider_payment: {
        Args: {
          p_ip: unknown;
          p_provider: Database["public"]["Enums"]["payment_provider"];
          p_reason: string;
          p_tx_id: string;
        };
        Returns: string;
      };
      generate_monthly_invoices: { Args: { p_period?: string }; Returns: number };
      get_direct_payment_instructions: {
        Args: { p_invoice: string };
        Returns: {
          amount_remaining: number;
          display_name: string;
          due_date: string;
          fees_notice: string;
          kind: Database["public"]["Enums"]["payout_kind"];
          msisdn: string;
          operator: Database["public"]["Enums"]["mobile_operator"];
          payment_link_url: string;
          payment_reference: string;
          pispi_alias: string;
        }[];
      };
      get_transfer_instructions: {
        Args: { p_invoice: string };
        Returns: {
          account_holder: string;
          amount_remaining: number;
          bank_name: string;
          due_date: string;
          iban: string;
          payment_reference: string;
        }[];
      };
      log_proof_access: {
        Args: { p_actor: string; p_ip: unknown; p_payment: string; p_ua: string };
        Returns: string;
      };
      mark_overdue_invoices: { Args: Record<PropertyKey, never>; Returns: number };
      record_cash_payment: {
        Args: { p_actor: string; p_amount: number; p_invoice: string; p_ip: unknown; p_ua: string };
        Returns: {
          payment_id: string;
          status: Database["public"]["Enums"]["payment_status"];
        }[];
      };
      review_manual_payment: {
        Args: {
          p_actor: string;
          p_approve: boolean;
          p_ip: unknown;
          p_payment: string;
          p_reason: string;
          p_ua: string;
        };
        Returns: string;
      };
      review_transfer: {
        Args: {
          p_actor: string;
          p_approve: boolean;
          p_ip: unknown;
          p_payment: string;
          p_reason: string;
          p_ua: string;
        };
        Returns: string;
      };
      set_checkout_url: { Args: { p_payment: string; p_url: string }; Returns: undefined };
      set_payment_settings: {
        Args: {
          p_actor: string;
          p_cash_threshold: number;
          p_cinetpay: boolean;
          p_direct: boolean;
          p_fees_notice: string;
          p_ip: unknown;
          p_org: string;
          p_transfer: boolean;
          p_ua: string;
        };
        Returns: undefined;
      };
      submit_direct_payment: {
        Args: {
          p_actor: string;
          p_amount: number;
          p_invoice: string;
          p_ip: unknown;
          p_operator: Database["public"]["Enums"]["mobile_operator"];
          p_payer_msisdn: string;
          p_proof_path: string;
          p_txn_ref: string;
          p_ua: string;
        };
        Returns: string;
      };
      submit_transfer_proof: {
        Args: {
          p_actor: string;
          p_amount: number;
          p_bank_reference: string;
          p_invoice: string;
          p_ip: unknown;
          p_proof_path: string;
          p_tx_id: string;
          p_ua: string;
        };
        Returns: string;
      };
      verify_receipt: {
        Args: { p_code: string; p_id: string };
        Returns: {
          amount: number;
          fingerprint: string;
          issued_at: string;
          landlord_name: string;
          paid_at: string;
          period: string;
          property_location: string;
          receipt_number: string;
          revoked_at: string;
          tenant_masked: string;
          verdict: string;
        }[];
      };
    };
    Enums: {
      invoice_status: "a_payer" | "partiel" | "en_retard" | "paye" | "annule";
      lease_status: "actif" | "termine" | "resilie";
      lease_usage: "habitation" | "professionnel";
      member_role: "owner" | "manager" | "accountant";
      mobile_operator: "orange" | "mtn" | "moov" | "wave";
      payment_method: "mobile_money" | "virement" | "especes";
      payment_provider: "cinetpay" | "wave" | "pispi" | "manuel" | "direct";
      payment_status: "initie" | "en_attente_validation" | "reussi" | "echoue" | "rejete";
      payout_kind: "banque" | "mobile_money" | "pispi_alias" | "payment_link";
      property_type: "appartement" | "villa" | "studio" | "magasin" | "bureau" | "entrepot";
      receipt_status: "valide" | "annulee";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      invoice_status: ["a_payer", "partiel", "en_retard", "paye", "annule"],
      lease_status: ["actif", "termine", "resilie"],
      lease_usage: ["habitation", "professionnel"],
      member_role: ["owner", "manager", "accountant"],
      mobile_operator: ["orange", "mtn", "moov", "wave"],
      payment_method: ["mobile_money", "virement", "especes"],
      payment_provider: ["cinetpay", "wave", "pispi", "manuel", "direct"],
      payment_status: ["initie", "en_attente_validation", "reussi", "echoue", "rejete"],
      payout_kind: ["banque", "mobile_money", "pispi_alias", "payment_link"],
      property_type: ["appartement", "villa", "studio", "magasin", "bureau", "entrepot"],
      receipt_status: ["valide", "annulee"],
    },
  },
} as const;
