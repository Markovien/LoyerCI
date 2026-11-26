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
      document_deliveries: {
        Row: {
          channel: Database["public"]["Enums"]["delivery_channel"];
          doc_type: Database["public"]["Enums"]["document_type"];
          document_id: string;
          id: number;
          invoice_id: string;
          org_id: string;
          sent_at: string;
          sent_by: string;
        };
        ComputedFields: never;
        Insert: {
          channel: Database["public"]["Enums"]["delivery_channel"];
          doc_type: Database["public"]["Enums"]["document_type"];
          document_id: string;
          id?: never;
          invoice_id: string;
          org_id: string;
          sent_at?: string;
          sent_by: string;
        };
        Update: {
          channel?: Database["public"]["Enums"]["delivery_channel"];
          doc_type?: Database["public"]["Enums"]["document_type"];
          document_id?: string;
          id?: never;
          invoice_id?: string;
          org_id?: string;
          sent_at?: string;
          sent_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_deliveries_invoice_id_org_id_fkey";
            columns: ["invoice_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "document_deliveries_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_reminders: {
        Row: {
          channel: string;
          id: number;
          invoice_id: string;
          org_id: string;
          sent_at: string;
          sent_by: string | null;
          step: number;
        };
        ComputedFields: never;
        Insert: {
          channel: string;
          id?: never;
          invoice_id: string;
          org_id: string;
          sent_at?: string;
          sent_by?: string | null;
          step: number;
        };
        Update: {
          channel?: string;
          id?: never;
          invoice_id?: string;
          org_id?: string;
          sent_at?: string;
          sent_by?: string | null;
          step?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_reminders_org_id_fkey";
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
          cancelled_reason: string | null;
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
          cancelled_reason?: string | null;
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
          cancelled_reason?: string | null;
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
          advance_recorded_at: string | null;
          charges_amount: number;
          created_at: string;
          deposit_months: number;
          due_day: number;
          end_date: string | null;
          ended_at: string | null;
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
          advance_recorded_at?: string | null;
          charges_amount?: number;
          created_at?: string;
          deposit_months?: number;
          due_day?: number;
          end_date?: string | null;
          ended_at?: string | null;
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
          advance_recorded_at?: string | null;
          charges_amount?: number;
          created_at?: string;
          deposit_months?: number;
          due_day?: number;
          end_date?: string | null;
          ended_at?: string | null;
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
      message_events: {
        Row: {
          billable: boolean;
          created_at: string;
          document_id: string | null;
          id: number;
          kind: Database["public"]["Enums"]["message_kind"];
          org_id: string;
          source: Database["public"]["Enums"]["message_source"];
        };
        ComputedFields: never;
        Insert: {
          billable: boolean;
          created_at?: string;
          document_id?: string | null;
          id?: never;
          kind: Database["public"]["Enums"]["message_kind"];
          org_id: string;
          source: Database["public"]["Enums"]["message_source"];
        };
        Update: {
          billable?: boolean;
          created_at?: string;
          document_id?: string | null;
          id?: never;
          kind?: Database["public"]["Enums"]["message_kind"];
          org_id?: string;
          source?: Database["public"]["Enums"]["message_source"];
        };
        Relationships: [
          {
            foreignKeyName: "message_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      notices: {
        Row: {
          amount_due: number;
          charges_amount: number;
          content_hash: string;
          due_date: string;
          id: string;
          invoice_id: string;
          issued_at: string;
          landlord_name: string;
          org_id: string;
          payment_reference: string;
          period: string;
          property_label: string;
          property_location: string;
          rent_amount: number;
          signature: string;
          signature_version: number;
          tenant_id: string;
          tenant_name: string;
        };
        ComputedFields: never;
        Insert: {
          amount_due: number;
          charges_amount: number;
          content_hash: string;
          due_date: string;
          id?: string;
          invoice_id: string;
          issued_at: string;
          landlord_name: string;
          org_id: string;
          payment_reference: string;
          period: string;
          property_label: string;
          property_location: string;
          rent_amount: number;
          signature: string;
          signature_version?: number;
          tenant_id: string;
          tenant_name: string;
        };
        Update: {
          amount_due?: number;
          charges_amount?: number;
          content_hash?: string;
          due_date?: string;
          id?: string;
          invoice_id?: string;
          issued_at?: string;
          landlord_name?: string;
          org_id?: string;
          payment_reference?: string;
          period?: string;
          property_label?: string;
          property_location?: string;
          rent_amount?: number;
          signature?: string;
          signature_version?: number;
          tenant_id?: string;
          tenant_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notices_invoice_id_org_id_fkey";
            columns: ["invoice_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "notices_org_id_fkey";
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
      org_message_quotas: {
        Row: {
          email_daily: number;
          org_id: string;
          otp_daily: number;
          sms_daily: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          email_daily?: number;
          org_id: string;
          otp_daily?: number;
          sms_daily?: number;
          updated_at?: string;
        };
        Update: {
          email_daily?: number;
          org_id?: string;
          otp_daily?: number;
          sms_daily?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_message_quotas_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
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
      org_reminder_settings: {
        Row: {
          email_enabled: boolean;
          offsets: number[];
          org_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          email_enabled?: boolean;
          offsets?: number[];
          org_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          email_enabled?: boolean;
          offsets?: number[];
          org_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "org_reminder_settings_org_id_fkey";
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
          payer_msisdn_hint: string | null;
          proof_path: string | null;
          proof_purged_at: string | null;
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
          payer_msisdn_hint?: never;
          proof_path?: string | null;
          proof_purged_at?: string | null;
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
          payer_msisdn_hint?: never;
          proof_path?: string | null;
          proof_purged_at?: string | null;
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
      tenant_invitations: {
        Row: {
          consumed_at: string | null;
          consumed_by: string | null;
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          org_id: string;
          revoked_at: string | null;
          tenant_id: string;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          consumed_at?: string | null;
          consumed_by?: string | null;
          created_at?: string;
          created_by: string;
          expires_at?: string;
          id?: string;
          org_id: string;
          revoked_at?: string | null;
          tenant_id: string;
          token_hash: string;
        };
        Update: {
          consumed_at?: string | null;
          consumed_by?: string | null;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          org_id?: string;
          revoked_at?: string | null;
          tenant_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_invitations_tenant_id_org_id_fkey";
            columns: ["tenant_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id", "org_id"];
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
          whatsapp_consent_at: string | null;
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
          whatsapp_consent_at?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          org_id?: string;
          phone?: string;
          user_id?: string | null;
          whatsapp_consent_at?: string | null;
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
      accept_invitation: {
        Args: { p_ip: unknown; p_token_hash: string; p_ua: string; p_user: string };
        Returns: string;
      };
      add_member: {
        Args: {
          p_actor: string;
          p_full_name: string;
          p_ip: unknown;
          p_org: string;
          p_role: Database["public"]["Enums"]["member_role"];
          p_ua: string;
          p_user: string;
        };
        Returns: undefined;
      };
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
      add_receiving_account: {
        Args: {
          p_actor: string;
          p_bank: string;
          p_display_name: string;
          p_holder: string;
          p_iban: string;
          p_ip: unknown;
          p_kind: Database["public"]["Enums"]["payout_kind"];
          p_link_url: string;
          p_msisdn: string;
          p_operator: Database["public"]["Enums"]["mobile_operator"];
          p_org: string;
          p_pispi_alias: string;
          p_ua: string;
        };
        Returns: {
          activates_at: string;
          id: string;
        }[];
      };
      audit_integrity: {
        Args: { p_actor: string; p_org: string };
        Returns: {
          checked_at: string;
          head_seq: number;
          ok: boolean;
          org_rows: number;
        }[];
      };
      cancel_invoice: {
        Args: { p_actor: string; p_invoice: string; p_ip: unknown; p_reason: string; p_ua: string };
        Returns: undefined;
      };
      cancel_payout_account: {
        Args: { p_account: string; p_actor: string; p_ip: unknown; p_ua: string };
        Returns: undefined;
      };
      cancel_receipt: {
        Args: { p_actor: string; p_ip: unknown; p_reason: string; p_receipt: string; p_ua: string };
        Returns: undefined;
      };
      change_member_role: {
        Args: {
          p_actor: string;
          p_ip: unknown;
          p_org: string;
          p_role: Database["public"]["Enums"]["member_role"];
          p_ua: string;
          p_user: string;
        };
        Returns: undefined;
      };
      claim_notifications: {
        Args: { p_limit?: number };
        Returns: {
          data: Json;
          id: number;
          kind: string;
          org_name: string;
          recipients: Json;
        }[];
      };
      claim_storage_deletions: {
        Args: { p_limit?: number };
        Returns: {
          bucket: string;
          id: number;
          path: string;
        }[];
      };
      close_ended_leases: { Args: Record<PropertyKey, never>; Returns: number };
      complete_notification: { Args: { p_error?: string; p_id: number }; Returns: undefined };
      complete_storage_deletion: { Args: { p_error?: string; p_id: number }; Returns: undefined };
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
      create_property: {
        Args: {
          p_actor: string;
          p_address: string;
          p_city: string;
          p_code: string;
          p_commune: string;
          p_ip: unknown;
          p_label: string;
          p_org: string;
          p_quartier: string;
          p_type: Database["public"]["Enums"]["property_type"];
          p_ua: string;
        };
        Returns: string;
      };
      create_tenant: {
        Args: {
          p_actor: string;
          p_email: string;
          p_full_name: string;
          p_ip: unknown;
          p_org: string;
          p_phone: string;
          p_ua: string;
        };
        Returns: string;
      };
      create_tenant_invitation: {
        Args: {
          p_actor: string;
          p_ip: unknown;
          p_tenant: string;
          p_token_hash: string;
          p_ua: string;
        };
        Returns: string;
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
      enqueue_purge_alerts: { Args: Record<PropertyKey, never>; Returns: number };
      enqueue_reminder_emails: { Args: { p_today?: string }; Returns: number };
      enqueue_stale_declarations: { Args: Record<PropertyKey, never>; Returns: number };
      fail_provider_payment: {
        Args: {
          p_ip: unknown;
          p_provider: Database["public"]["Enums"]["payment_provider"];
          p_reason: string;
          p_tx_id: string;
        };
        Returns: string;
      };
      find_user_id_by_email: { Args: { p_email: string }; Returns: string };
      generate_invoices_for_org: {
        Args: { p_actor: string; p_ip: unknown; p_org: string; p_period: string; p_ua: string };
        Returns: number;
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
      get_invitation: {
        Args: { p_token_hash: string };
        Returns: {
          expires_at: string;
          landlord_name: string;
          phone_hint: string;
          status: string;
          tenant_masked: string;
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
      grant_reauth: { Args: { p_actor: string; p_ip: unknown; p_ua: string }; Returns: undefined };
      issue_notice: {
        Args: { p_actor: string; p_invoice: string; p_ip: unknown; p_ua: string };
        Returns: string;
      };
      log_audit_export: {
        Args: {
          p_actor: string;
          p_filters: Json;
          p_ip: unknown;
          p_org: string;
          p_rows: number;
          p_ua: string;
        };
        Returns: undefined;
      };
      log_documents_export: {
        Args: { p_actor: string; p_count: number; p_ip: unknown; p_org: string; p_ua: string };
        Returns: undefined;
      };
      log_proof_access: {
        Args: { p_actor: string; p_ip: unknown; p_payment: string; p_ua: string };
        Returns: string;
      };
      mark_document_sent: {
        Args: {
          p_actor: string;
          p_channel: Database["public"]["Enums"]["delivery_channel"];
          p_doc_type: Database["public"]["Enums"]["document_type"];
          p_invoice: string;
          p_ip: unknown;
          p_ua: string;
        };
        Returns: number;
      };
      mark_overdue_invoices: { Args: Record<PropertyKey, never>; Returns: number };
      message_usage_summary: {
        Args: { p_month: string; p_org: string };
        Returns: {
          billable: boolean;
          kind: Database["public"]["Enums"]["message_kind"];
          source: Database["public"]["Enums"]["message_source"];
          total: number;
        }[];
      };
      my_account_deletion: {
        Args: Record<PropertyKey, never>;
        Returns: {
          deletion_at: string;
          departed_at: string;
        }[];
      };
      pispi_poster_data: {
        Args: { p_account: string; p_actor: string; p_ip: unknown; p_ua: string };
        Returns: {
          alias: string;
          beneficiary: string;
          org_name: string;
          reference_label: string;
        }[];
      };
      process_tenant_retention: {
        Args: { p_now?: string };
        Returns: {
          departs: number;
          rappels: number;
          suppressions: number;
        }[];
      };
      purge_expired_documents: {
        Args: Record<PropertyKey, never>;
        Returns: {
          avis: number;
          preuves: number;
          quittances: number;
        }[];
      };
      purge_rate_limits: { Args: Record<PropertyKey, never>; Returns: number };
      rate_limit_hit: {
        Args: { p_key_hash: string; p_max: number; p_window_ms: number };
        Returns: {
          ok: boolean;
          retry_after_sec: number;
        }[];
      };
      record_advance: {
        Args: { p_actor: string; p_ip: unknown; p_lease: string; p_ua: string };
        Returns: number;
      };
      record_cash_payment: {
        Args: { p_actor: string; p_amount: number; p_invoice: string; p_ip: unknown; p_ua: string };
        Returns: {
          payment_id: string;
          status: Database["public"]["Enums"]["payment_status"];
        }[];
      };
      record_received_payment: {
        Args: {
          p_actor: string;
          p_amount: number;
          p_bank_reference: string;
          p_invoice: string;
          p_ip: unknown;
          p_method: Database["public"]["Enums"]["payment_method"];
          p_operator: Database["public"]["Enums"]["mobile_operator"];
          p_txn_ref: string;
          p_ua: string;
        };
        Returns: string;
      };
      record_reminder: {
        Args: {
          p_actor: string;
          p_channel: string;
          p_invoice: string;
          p_ip: unknown;
          p_step: number;
          p_ua: string;
        };
        Returns: boolean;
      };
      remove_member: {
        Args: { p_actor: string; p_ip: unknown; p_org: string; p_ua: string; p_user: string };
        Returns: undefined;
      };
      reserve_automated_message: {
        Args: {
          p_document?: string;
          p_kind: Database["public"]["Enums"]["message_kind"];
          p_org: string;
        };
        Returns: number;
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
      set_reminder_settings: {
        Args: {
          p_actor: string;
          p_email: boolean;
          p_ip: unknown;
          p_offsets: number[];
          p_org: string;
          p_ua: string;
        };
        Returns: undefined;
      };
      set_whatsapp_consent: {
        Args: {
          p_actor: string;
          p_consent: boolean;
          p_ip: unknown;
          p_tenant: string;
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
      terminate_lease: {
        Args: {
          p_actor: string;
          p_end_date: string;
          p_ip: unknown;
          p_lease: string;
          p_reason: string;
          p_ua: string;
        };
        Returns: string;
      };
      unlink_tenant_account: {
        Args: { p_actor: string; p_ip: unknown; p_tenant: string; p_ua: string };
        Returns: undefined;
      };
      update_property: {
        Args: {
          p_actor: string;
          p_address: string;
          p_city: string;
          p_code: string;
          p_commune: string;
          p_ip: unknown;
          p_label: string;
          p_property: string;
          p_quartier: string;
          p_type: Database["public"]["Enums"]["property_type"];
          p_ua: string;
        };
        Returns: undefined;
      };
      update_tenant: {
        Args: {
          p_actor: string;
          p_email: string;
          p_full_name: string;
          p_ip: unknown;
          p_phone: string;
          p_tenant: string;
          p_ua: string;
        };
        Returns: undefined;
      };
      verify_notice: {
        Args: { p_code: string; p_id: string };
        Returns: {
          amount_due: number;
          due_date: string;
          fingerprint: string;
          issued_at: string;
          landlord_name: string;
          payment_reference: string;
          period: string;
          property_location: string;
          tenant_masked: string;
          verdict: string;
        }[];
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
      delivery_channel: "partage" | "whatsapp" | "email" | "sms" | "telechargement";
      document_type: "avis" | "quittance";
      invoice_status: "a_payer" | "partiel" | "en_retard" | "paye" | "annule";
      lease_status: "actif" | "termine" | "resilie";
      lease_usage: "habitation" | "professionnel";
      member_role: "owner" | "manager" | "accountant";
      message_kind: "whatsapp" | "email" | "sms" | "otp" | "partage" | "telechargement";
      message_source: "manuel" | "automatique";
      mobile_operator: "orange" | "mtn" | "moov" | "wave";
      payment_method: "mobile_money" | "virement" | "especes" | "avance";
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
      delivery_channel: ["partage", "whatsapp", "email", "sms", "telechargement"],
      document_type: ["avis", "quittance"],
      invoice_status: ["a_payer", "partiel", "en_retard", "paye", "annule"],
      lease_status: ["actif", "termine", "resilie"],
      lease_usage: ["habitation", "professionnel"],
      member_role: ["owner", "manager", "accountant"],
      message_kind: ["whatsapp", "email", "sms", "otp", "partage", "telechargement"],
      message_source: ["manuel", "automatique"],
      mobile_operator: ["orange", "mtn", "moov", "wave"],
      payment_method: ["mobile_money", "virement", "especes", "avance"],
      payment_provider: ["cinetpay", "wave", "pispi", "manuel", "direct"],
      payment_status: ["initie", "en_attente_validation", "reussi", "echoue", "rejete"],
      payout_kind: ["banque", "mobile_money", "pispi_alias", "payment_link"],
      property_type: ["appartement", "villa", "studio", "magasin", "bureau", "entrepot"],
      receipt_status: ["valide", "annulee"],
    },
  },
} as const;
