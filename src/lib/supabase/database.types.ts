export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type WarrantyCaseRow = { id: string; organization_id: string; order_id: string; line_number: number; status: string; version: number; customer_note: string; private_note: string; created_at: string; updated_at: string }
type WarrantyHistoryRow = { request_id: string; case_id: string; organization_id: string; actor_id: string; expected_version: number; version: number; order_id: string; line_number: number; status: string; customer_note: string; private_note: string; created_at: string }
type NativeOrderRow = {
  id: string; organization_id: string; revision: number; created_by_kind: string; created_by_actor_id: string | null; automation_owner_id: string | null; conversation_id: string | null;
  buyer_name: string | null; phone: string | null; address: Json | null; currency: string; subtotal_vnd: number; shipping_fee_vnd: number | null; shipping_revision: number | null; total_vnd: number | null;
  fulfilment_status: string; payment_status: string; reservation_id: string | null; payment_id: string | null; fulfilment_id: string | null; checkout_frozen_at: string | null; checkout_snapshot: Json | null; checkout_request_id: string | null; created_at: string; updated_at: string
}
type NativeOrderItemRow = { order_id: string; line_number: number; product_id: string; variant_id: string | null; product_version: number; name: string; sku: string | null; quantity: number; unit_price_vnd: number; line_total_vnd: number; source_name: string | null; source_url: string | null }
type NativeOrderRequestRow = { request_id: string; organization_id: string; order_id: string; actor_kind: string; actor_id: string | null; owner_id: string | null; conversation_id: string | null; expected_revision: number; document: Json; result: Json; created_at: string }

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      content_versions: { Row: { id: string; organization_id: string; slot_id: string; version: number; request_id: string; document: Json; content_hash: string; artifact_hash: null; validated_at: string }; Insert: { id: string; organization_id: string; slot_id: string; version: number; request_id: string; document: Json; content_hash: string; artifact_hash?: null; validated_at?: string }; Update: never; Relationships: [] }
      consultation_receipts: {
        Row: {
          candidate: Json | null
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          event_id: string
          job_id: string
          lease_token: string
          organization_id: string
          outcome: Json | null
          revision: number
          status: string
        }
        Insert: {
          candidate?: Json | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          event_id: string
          job_id: string
          lease_token: string
          organization_id: string
          outcome?: Json | null
          revision: number
          status: string
        }
        Update: {
          candidate?: Json | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          event_id?: string
          job_id?: string
          lease_token?: string
          organization_id?: string
          outcome?: Json | null
          revision?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_receipts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_receipts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "facebook_inbound_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_receipts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "business_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_control: { Row: { organization_id: string; status: string; revision: number; priority_campaign_id: string | null; reason: string; updated_at: string }; Insert: { organization_id: string; status?: string; revision?: number; priority_campaign_id?: string | null; reason?: string; updated_at?: string }; Update: { status?: string; revision?: number; priority_campaign_id?: string | null; reason?: string; updated_at?: string }; Relationships: [] }
      campaigns: { Row: { id: string; organization_id: string; title: string; objective: string; source_kind: string; source_ref: string; priority: boolean; status: string; version: number; decision: Json | null; source_snapshot: Json; settings_snapshot: Json; timezone: string; created_at: string; updated_at: string }; Insert: { id: string; organization_id: string; title: string; objective: string; source_kind: string; source_ref: string; priority: boolean; status?: string; version?: number; decision?: Json | null; source_snapshot: Json; settings_snapshot: Json; timezone: string; created_at?: string; updated_at?: string }; Update: { status?: string; version?: number; updated_at?: string }; Relationships: [] }
      campaign_slots: { Row: { id: string; campaign_id: string; ordinal: number; scheduled_at: string | null; content_version_id: string | null; content_revision: number; status: string }; Insert: { id?: string; campaign_id: string; ordinal: number; scheduled_at?: string | null; content_version_id?: string | null; content_revision?: number; status?: string }; Update: { scheduled_at?: string | null; content_version_id?: string | null; content_revision?: number; status?: string }; Relationships: [] }
      campaign_receipts: { Row: { request_id: string; organization_id: string; campaign_id: string; actor_id: string | null; command: string; expected_revision: number; document: Json; result: Json; created_at: string }; Insert: { request_id: string; organization_id: string; campaign_id: string; actor_id?: string | null; command: string; expected_revision: number; document: Json; result: Json; created_at?: string }; Update: never; Relationships: [] }
      knowledge_gaps: {
        Row: { id: string; organization_id: string; product_id: string | null; field: string; reason: string; status: string; version: number; occurrences: number; last_conversation_id: string; updated_at: string; resolved_at: string | null }
        Insert: { id?: string; organization_id: string; product_id?: string | null; field: string; reason: string; status: string; version: number; occurrences: number; last_conversation_id: string; updated_at?: string; resolved_at?: string | null }
        Update: { id?: string; organization_id?: string; product_id?: string | null; field?: string; reason?: string; status?: string; version?: number; occurrences?: number; last_conversation_id?: string; updated_at?: string; resolved_at?: string | null }
        Relationships: []
      }
      knowledge_gap_occurrences: {
        Row: { gap_id: string; source_event_id: string; organization_id: string; conversation_id: string; created_at: string }
        Insert: { gap_id: string; source_event_id: string; organization_id: string; conversation_id: string; created_at?: string }
        Update: { gap_id?: string; source_event_id?: string; organization_id?: string; conversation_id?: string; created_at?: string }
        Relationships: []
      }
      knowledge_gap_resolutions: {
        Row: { request_id: string; gap_id: string; organization_id: string; actor_id: string; expected_version: number; version: number; created_at: string }
        Insert: { request_id: string; gap_id: string; organization_id: string; actor_id: string; expected_version: number; version: number; created_at?: string }
        Update: { request_id?: string; gap_id?: string; organization_id?: string; actor_id?: string; expected_version?: number; version?: number; created_at?: string }
        Relationships: []
      }

      knowledge_ingestion_runs: {
        Row: { id: string; organization_id: string; source_id: string; source_version: number; refresh_cycle: number; job_id: string | null; last_error: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; source_id: string; source_version: number; refresh_cycle: number; job_id?: string | null; last_error?: string | null; created_at?: string }
        Update: { job_id?: string | null; last_error?: string | null }
        Relationships: []
      }
      knowledge_ingestions: {
        Row: { id: string; organization_id: string; source_id: string; source_version: number; source_document: Json; content_hash: string; final_url: string | null; content_type: string; fetched_at: string; expires_at: string; published_at: string }
        Insert: { id: string; organization_id: string; source_id: string; source_version: number; source_document: Json; content_hash: string; final_url?: string | null; content_type: string; fetched_at: string; expires_at: string; published_at?: string }
        Update: never
        Relationships: []
      }
      knowledge_chunks: {
        Row: { ingestion_id: string; ordinal: number; body: string }
        Insert: { ingestion_id: string; ordinal: number; body: string }
        Update: never
        Relationships: []
      }
      trend_observations: {
        Row: {
          evidence: Json
          expires_at: string
          fingerprint: string
          first_observed_at: string
          id: string
          last_observed_at: string
          organization_id: string
          source_key: string
          source_kind: string
          source_url: string
        }
        Insert: {
          evidence: Json
          expires_at: string
          fingerprint: string
          first_observed_at: string
          id?: string
          last_observed_at: string
          organization_id: string
          source_key: string
          source_kind: string
          source_url: string
        }
        Update: {
          evidence?: Json
          expires_at?: string
          fingerprint?: string
          first_observed_at?: string
          id?: string
          last_observed_at?: string
          organization_id?: string
          source_key?: string
          source_kind?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "trend_observations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_ingestion_runs: {
        Row: {
          committed_at: string
          id: string
          observed_at: string
          organization_id: string
          snapshot: Json
        }
        Insert: {
          committed_at?: string
          id: string
          observed_at: string
          organization_id: string
          snapshot: Json
        }
        Update: {
          committed_at?: string
          id?: string
          observed_at?: string
          organization_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "trend_ingestion_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_cases: { Row: WarrantyCaseRow; Insert: Omit<WarrantyCaseRow, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string }; Update: Partial<WarrantyCaseRow>; Relationships: [] }
      warranty_history: { Row: WarrantyHistoryRow; Insert: Omit<WarrantyHistoryRow, "created_at"> & { created_at?: string }; Update: Partial<WarrantyHistoryRow>; Relationships: [] }
      knowledge_sources: {
        Row: { id: string; organization_id: string; version: number; document: Json; updated_at: string }
        Insert: { id: string; organization_id: string; version: number; document: Json; updated_at?: string }
        Update: { id?: string; organization_id?: string; version?: number; document?: Json; updated_at?: string }
        Relationships: []
      }
      knowledge_source_versions: {
        Row: { source_id: string; version: number; organization_id: string; actor_id: string; request_id: string; expected_version: number; document: Json; created_at: string }
        Insert: { source_id: string; version: number; organization_id: string; actor_id: string; request_id: string; expected_version: number; document: Json; created_at?: string }
        Update: { source_id?: string; version?: number; organization_id?: string; actor_id?: string; request_id?: string; expected_version?: number; document?: Json; created_at?: string }
        Relationships: []
      }
      orders: {
        Row: NativeOrderRow
        Insert: Pick<NativeOrderRow, "id" | "organization_id" | "created_by_kind" | "subtotal_vnd"> & Partial<NativeOrderRow>
        Update: Partial<NativeOrderRow>
        Relationships: []
      }
      order_items: {
        Row: NativeOrderItemRow
        Insert: NativeOrderItemRow
        Update: Partial<NativeOrderItemRow>
        Relationships: []
      }
      order_draft_requests: {
        Row: NativeOrderRequestRow
        Insert: Omit<NativeOrderRequestRow, "created_at"> & { created_at?: string }
        Update: Partial<NativeOrderRequestRow>
        Relationships: []
      }
      order_shipping_settings: {
        Row: { organization_id: string; flat_fee_vnd: number | null; revision: number; updated_at: string }
        Insert: { organization_id: string; flat_fee_vnd?: number | null; revision?: number; updated_at?: string }
        Update: { organization_id?: string; flat_fee_vnd?: number | null; revision?: number; updated_at?: string }
        Relationships: []
      }
      business_policies: {
        Row: {
          body: string
          disabled_at: string | null
          expires_at: string | null
          id: string
          kind: string
          organization_id: string
          product_ids: string[]
          starts_at: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          disabled_at?: string | null
          expires_at?: string | null
          id: string
          kind: string
          organization_id: string
          product_ids?: string[]
          starts_at?: string | null
          title: string
          updated_at?: string
          version: number
        }
        Update: {
          body?: string
          disabled_at?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          organization_id?: string
          product_ids?: string[]
          starts_at?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_edits: {
        Row: {
          actor_id: string
          created_at: string
          document: Json
          entity_id: string
          entity_kind: string
          expected_version: number
          organization_id: string
          request_id: string
          version: number
        }
        Insert: {
          actor_id: string
          created_at?: string
          document: Json
          entity_id: string
          entity_kind: string
          expected_version: number
          organization_id: string
          request_id: string
          version: number
        }
        Update: {
          actor_id?: string
          created_at?: string
          document?: Json
          entity_id?: string
          entity_kind?: string
          expected_version?: number
          organization_id?: string
          request_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_edits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_edits: {
        Row: { request_id: string; product_id: string; organization_id: string; actor_id: string; version: number; expected_version: number; document: Json; source_references: Json; created_at: string }
        Insert: { request_id: string; product_id: string; organization_id: string; actor_id: string; version: number; expected_version: number; document: Json; source_references?: Json; created_at?: string }
        Update: { request_id?: string; product_id?: string; organization_id?: string; actor_id?: string; version?: number; expected_version?: number; document?: Json; source_references?: Json; created_at?: string }
        Relationships: []
      }
      business_settings: {
        Row: {
          organization_id: string
          revision: number
          settings: Json
          updated_at: string
        }
        Insert: {
          organization_id: string
          revision: number
          settings: Json
          updated_at?: string
        }
        Update: {
          organization_id?: string
          revision?: number
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings_requests: {
        Row: {
          actor_id: string
          created_at: string
          input_hash: string
          organization_id: string
          request_id: string
          result: Json
        }
        Insert: {
          actor_id: string
          created_at?: string
          input_hash: string
          organization_id: string
          request_id: string
          result: Json
        }
        Update: {
          actor_id?: string
          created_at?: string
          input_hash?: string
          organization_id?: string
          request_id?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_jobs: {
        Row: {
          attempt_started_at: string | null
          attempts: number
          available_at: string
          created_at: string
          dedup_key: string
          entity_id: string
          id: string
          kind: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          max_attempts: number
          organization_id: string
          scheduled_at: string
          status: string
        }
        Insert: {
          attempt_started_at?: string | null
          attempts?: number
          available_at: string
          created_at?: string
          dedup_key: string
          entity_id: string
          id?: string
          kind: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_token?: string | null
          max_attempts: number
          organization_id: string
          scheduled_at: string
          status?: string
        }
        Update: {
          attempt_started_at?: string | null
          attempts?: number
          available_at?: string
          created_at?: string
          dedup_key?: string
          entity_id?: string
          id?: string
          kind?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_token?: string | null
          max_attempts?: number
          organization_id?: string
          scheduled_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_inbound_events: {
        Row: {
          data: Json
          delivery_time_ms: number | null
          event_time_ms: number | null
          id: string
          kind: string
          organization_id: string
          page_id: string
          provider_key: string
          received_at: string
          recipient_id: string | null
          sender_id: string | null
        }
        Insert: {
          data: Json
          delivery_time_ms?: number | null
          event_time_ms?: number | null
          id?: string
          kind: string
          organization_id: string
          page_id: string
          provider_key: string
          received_at?: string
          recipient_id?: string | null
          sender_id?: string | null
        }
        Update: {
          data?: Json
          delivery_time_ms?: number | null
          event_time_ms?: number | null
          id?: string
          kind?: string
          organization_id?: string
          page_id?: string
          provider_key?: string
          received_at?: string
          recipient_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facebook_inbound_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          active_handoff_id: string | null
          created_at: string
          id: string
          last_event_time_ms: number | null
          organization_id: string
          page_id: string
          psid: string
          revision: number
          status: string
          updated_at: string
        }
        Insert: {
          active_handoff_id?: string | null
          created_at?: string
          id?: string
          last_event_time_ms?: number | null
          organization_id: string
          page_id: string
          psid: string
          revision?: number
          status?: string
          updated_at?: string
        }
        Update: {
          active_handoff_id?: string | null
          created_at?: string
          id?: string
          last_event_time_ms?: number | null
          organization_id?: string
          page_id?: string
          psid?: string
          revision?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_active_handoff_fk"
            columns: ["active_handoff_id"]
            isOneToOne: false
            referencedRelation: "conversation_handoffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          ai_disposition: string
          conversation_id: string
          data: Json
          event_time_ms: number | null
          id: string
          inbound_event_id: string
          kind: string
          provider_key: string
          received_at: string
        }
        Insert: {
          ai_disposition?: string
          conversation_id: string
          data: Json
          event_time_ms?: number | null
          id?: string
          inbound_event_id: string
          kind: string
          provider_key: string
          received_at?: string
        }
        Update: {
          ai_disposition?: string
          conversation_id?: string
          data?: Json
          event_time_ms?: number | null
          id?: string
          inbound_event_id?: string
          kind?: string
          provider_key?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_inbound_event_id_fkey"
            columns: ["inbound_event_id"]
            isOneToOne: true
            referencedRelation: "facebook_inbound_events"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_handoffs: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          conversation_id: string
          id: string
          reason: string
          requested_at: string
          source_event_id: string
          status: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          conversation_id: string
          id?: string
          reason: string
          requested_at?: string
          source_event_id: string
          status?: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          conversation_id?: string
          id?: string
          reason?: string
          requested_at?: string
          source_event_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_handoffs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_handoffs_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "facebook_inbound_events"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_handoff_decisions: {
        Row: {
          conversation_id: string
          handoff_id: string
          reason: string
          source_event_id: string
        }
        Insert: {
          conversation_id: string
          handoff_id: string
          reason: string
          source_event_id: string
        }
        Update: {
          conversation_id?: string
          handoff_id?: string
          reason?: string
          source_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_handoff_decisions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_handoff_decisions_handoff_id_fkey"
            columns: ["handoff_id"]
            isOneToOne: false
            referencedRelation: "conversation_handoffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_handoff_decisions_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: true
            referencedRelation: "facebook_inbound_events"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_transition_receipts: {
        Row: {
          actor_id: string
          fingerprint: string
          organization_id: string
          request_id: string
          result: Json
        }
        Insert: {
          actor_id: string
          fingerprint: string
          organization_id: string
          request_id: string
          result: Json
        }
        Update: {
          actor_id?: string
          fingerprint?: string
          organization_id?: string
          request_id?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "conversation_transition_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_handoff_assignments: {
        Row: {
          assigned_actor_id: string
          assigned_at: string
          handoff_id: string
          id: string
          manager_actor_id: string
          previous_actor_id: string
          previous_claimed_at: string
          request_id: string
        }
        Insert: {
          assigned_actor_id: string
          assigned_at?: string
          handoff_id: string
          id?: string
          manager_actor_id: string
          previous_actor_id: string
          previous_claimed_at: string
          request_id: string
        }
        Update: {
          assigned_actor_id?: string
          assigned_at?: string
          handoff_id?: string
          id?: string
          manager_actor_id?: string
          previous_actor_id?: string
          previous_claimed_at?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_handoff_assignments_handoff_id_fkey"
            columns: ["handoff_id"]
            isOneToOne: false
            referencedRelation: "conversation_handoffs"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_admin_requests: {
        Row: {
          action: string
          actor_id: string
          completed_version: number | null
          created_at: string
          document: Json
          marker: string | null
          organization_id: string
          request_id: string
          user_id: string
        }
        Insert: {
          action: string
          actor_id: string
          completed_version?: number | null
          created_at?: string
          document: Json
          marker?: string | null
          organization_id: string
          request_id: string
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          completed_version?: number | null
          created_at?: string
          document?: Json
          marker?: string | null
          organization_id?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_admin_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          organization_id: string
          role: string
          user_id: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string
          organization_id: string
          role: string
          user_id: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          organization_id?: string
          role?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: string
          correlation_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          idempotency_key: string
          organization_id: string
          reason: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind: string
          correlation_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          idempotency_key: string
          organization_id: string
          reason: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: string
          correlation_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          slug: string | null
          source_category_id: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          slug?: string | null
          source_category_id?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          slug?: string | null
          source_category_id?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          assignment_method: string | null
          category_id: string
          created_at: string
          is_primary: boolean
          metadata: Json | null
          product_id: string
        }
        Insert: {
          assignment_method?: string | null
          category_id: string
          created_at?: string
          is_primary?: boolean
          metadata?: Json | null
          product_id: string
        }
        Update: {
          assignment_method?: string | null
          category_id?: string
          created_at?: string
          is_primary?: boolean
          metadata?: Json | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "content_ready_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_content_context"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          original_source_url: string | null
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          position: number
          product_id: string
          source_url: string
          storage_path: string | null
        }
        Insert: {
          original_source_url?: string | null
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          position?: number
          product_id: string
          source_url: string
          storage_path?: string | null
        }
        Update: {
          original_source_url?: string | null
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          position?: number
          product_id?: string
          source_url?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "content_ready_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_content_context"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_import_runs: {
        Row: {
          completed_at: string | null
          error_summary: Json | null
          failed_rows: number
          id: string
          inserted_rows: number
          organization_id: string | null
          source_file: string | null
          source_sha256: string | null
          started_at: string
          status: string
          total_rows: number
          updated_rows: number
        }
        Insert: {
          completed_at?: string | null
          error_summary?: Json | null
          failed_rows?: number
          id?: string
          inserted_rows?: number
          organization_id?: string | null
          source_file?: string | null
          source_sha256?: string | null
          started_at?: string
          status?: string
          total_rows?: number
          updated_rows?: number
        }
        Update: {
          completed_at?: string | null
          error_summary?: Json | null
          failed_rows?: number
          id?: string
          inserted_rows?: number
          organization_id?: string | null
          source_file?: string | null
          source_sha256?: string | null
          started_at?: string
          status?: string
          total_rows?: number
          updated_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_import_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_promotions: {
        Row: {
          created_at: string
          product_id: string
          promotion_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          promotion_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          promotion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "content_ready_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_content_context"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_promotions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "active_product_promotions"
            referencedColumns: ["promotion_id"]
          },
          {
            foreignKeyName: "product_promotions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          disabled_at: string | null
          compare_at_price_vnd: number | null
          created_at: string
          id: string
          image_url: string | null
          in_stock: boolean | null
          name: string | null
          options: Json | null
          price_vnd: number | null
          product_id: string
          sku: string | null
          source_variant_id: string | null
          stock_quantity: number | null
          updated_at: string
        }
        Insert: {
          disabled_at?: string | null
          compare_at_price_vnd?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          name?: string | null
          options?: Json | null
          price_vnd?: number | null
          product_id: string
          sku?: string | null
          source_variant_id?: string | null
          stock_quantity?: number | null
          updated_at?: string
        }
        Update: {
          disabled_at?: string | null
          compare_at_price_vnd?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          name?: string | null
          options?: Json | null
          price_vnd?: number | null
          product_id?: string
          sku?: string | null
          source_variant_id?: string | null
          stock_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "content_ready_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_content_context"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          version: number
          disabled_at: string | null
          manually_edited_at: string | null
          availability: string | null
          brand: string | null
          breadcrumbs: Json | null
          canonical_url: string
          category_name: string | null
          collected_at: string | null
          compare_at_price_vnd: number | null
          completeness_score: number | null
          created_at: string
          currency: string
          description: string | null
          description_text: string | null
          extractor_version: string | null
          id: string
          in_stock: boolean
          name: string
          normalized_attributes: Json | null
          organization_id: string
          price_vnd: number | null
          product_type: string | null
          quality: string
          sku: string | null
          slug: string | null
          source_http_status: number | null
          source_name: string | null
          source_payload: Json | null
          source_product_id: string | null
          source_url: string
          specification_count: number
          specifications: Json | null
          stock_quantity: number | null
          updated_at: string
        }
        Insert: {
          version?: number
          disabled_at?: string | null
          manually_edited_at?: string | null
          availability?: string | null
          brand?: string | null
          breadcrumbs?: Json | null
          canonical_url: string
          category_name?: string | null
          collected_at?: string | null
          compare_at_price_vnd?: number | null
          completeness_score?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          description_text?: string | null
          extractor_version?: string | null
          id?: string
          in_stock: boolean
          name: string
          normalized_attributes?: Json | null
          organization_id: string
          price_vnd?: number | null
          product_type?: string | null
          quality: string
          sku?: string | null
          slug?: string | null
          source_http_status?: number | null
          source_name?: string | null
          source_payload?: Json | null
          source_product_id?: string | null
          source_url: string
          specification_count?: number
          specifications?: Json | null
          stock_quantity?: number | null
          updated_at?: string
        }
        Update: {
          version?: number
          disabled_at?: string | null
          manually_edited_at?: string | null
          availability?: string | null
          brand?: string | null
          breadcrumbs?: Json | null
          canonical_url?: string
          category_name?: string | null
          collected_at?: string | null
          compare_at_price_vnd?: number | null
          completeness_score?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          description_text?: string | null
          extractor_version?: string | null
          id?: string
          in_stock?: boolean
          name?: string
          normalized_attributes?: Json | null
          organization_id?: string
          price_vnd?: number | null
          product_type?: string | null
          quality?: string
          sku?: string | null
          slug?: string | null
          source_http_status?: number | null
          source_name?: string | null
          source_payload?: Json | null
          source_product_id?: string | null
          source_url?: string
          specification_count?: number
          specifications?: Json | null
          stock_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          created_at: string
          details_text: string | null
          disabled_at: string | null
          discount_type: string | null
          discount_value: number | null
          expires_at: string | null
          id: string
          is_flash_sale: boolean
          label: string
          manually_edited_at: string | null
          organization_id: string
          promotion_type: string | null
          scope: string
          source_code: string | null
          source_payload: Json | null
          starts_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          details_text?: string | null
          disabled_at?: string | null
          discount_type?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          is_flash_sale?: boolean
          label: string
          manually_edited_at?: string | null
          organization_id: string
          promotion_type?: string | null
          scope?: string
          source_code?: string | null
          source_payload?: Json | null
          starts_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          details_text?: string | null
          disabled_at?: string | null
          discount_type?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          is_flash_sale?: boolean
          label?: string
          manually_edited_at?: string | null
          organization_id?: string
          promotion_type?: string | null
          scope?: string
          source_code?: string | null
          source_payload?: Json | null
          starts_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      render_events: {
        Row: {
          created_at: string
          error_code: string | null
          error_stage: string | null
          id: string
          model: string | null
          organization_id: string
          product_id: string | null
          render_id: string
          renderer_revision: string | null
          scene_count: number | null
          script_sha256: string | null
          stage_timings: Json | null
          status: string
          tokens_input: number | null
          tokens_output: number | null
          tokens_total: number | null
          total_duration_ms: number | null
          tts_total_ms: number | null
          video_bytes: number | null
          video_duration_ms: number | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_stage?: string | null
          id?: string
          model?: string | null
          organization_id: string
          product_id?: string | null
          render_id: string
          renderer_revision?: string | null
          scene_count?: number | null
          script_sha256?: string | null
          stage_timings?: Json | null
          status: string
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
          total_duration_ms?: number | null
          tts_total_ms?: number | null
          video_bytes?: number | null
          video_duration_ms?: number | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_stage?: string | null
          id?: string
          model?: string | null
          organization_id?: string
          product_id?: string | null
          render_id?: string
          renderer_revision?: string | null
          scene_count?: number | null
          script_sha256?: string | null
          stage_timings?: Json | null
          status?: string
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
          total_duration_ms?: number | null
          tts_total_ms?: number | null
          video_bytes?: number | null
          video_duration_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "render_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_product_promotions: {
        Row: {
          discount_type: string | null
          discount_value: number | null
          expires_at: string | null
          is_flash_sale: boolean | null
          label: string | null
          organization_id: string | null
          product_id: string | null
          promotion_id: string | null
          promotion_type: string | null
          source_code: string | null
          starts_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "content_ready_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_content_context"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_ready_products: {
        Row: {
          availability: string | null
          brand: string | null
          breadcrumbs: Json | null
          canonical_url: string | null
          category_name: string | null
          collected_at: string | null
          compare_at_price_vnd: number | null
          completeness_score: number | null
          created_at: string | null
          currency: string | null
          description: string | null
          description_text: string | null
          extractor_version: string | null
          id: string | null
          in_stock: boolean | null
          name: string | null
          normalized_attributes: Json | null
          organization_id: string | null
          price_vnd: number | null
          product_type: string | null
          quality: string | null
          sku: string | null
          slug: string | null
          source_http_status: number | null
          source_name: string | null
          source_product_id: string | null
          source_url: string | null
          specification_count: number | null
          specifications: Json | null
          stock_quantity: number | null
          updated_at: string | null
        }
        Insert: {
          availability?: string | null
          brand?: string | null
          breadcrumbs?: Json | null
          canonical_url?: string | null
          category_name?: string | null
          collected_at?: string | null
          compare_at_price_vnd?: number | null
          completeness_score?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          description_text?: string | null
          extractor_version?: string | null
          id?: string | null
          in_stock?: boolean | null
          name?: string | null
          normalized_attributes?: Json | null
          organization_id?: string | null
          price_vnd?: number | null
          product_type?: string | null
          quality?: string | null
          sku?: string | null
          slug?: string | null
          source_http_status?: number | null
          source_name?: string | null
          source_product_id?: string | null
          source_url?: string | null
          specification_count?: number | null
          specifications?: Json | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Update: {
          availability?: string | null
          brand?: string | null
          breadcrumbs?: Json | null
          canonical_url?: string | null
          category_name?: string | null
          collected_at?: string | null
          compare_at_price_vnd?: number | null
          completeness_score?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          description_text?: string | null
          extractor_version?: string | null
          id?: string | null
          in_stock?: boolean | null
          name?: string | null
          normalized_attributes?: Json | null
          organization_id?: string | null
          price_vnd?: number | null
          product_type?: string | null
          quality?: string | null
          sku?: string | null
          slug?: string | null
          source_http_status?: number | null
          source_name?: string | null
          source_product_id?: string | null
          source_url?: string | null
          specification_count?: number | null
          specifications?: Json | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_content_context: {
        Row: {
          active_promotions: Json | null
          brand: string | null
          collected_at: string | null
          compare_at_price: number | null
          completeness_score: number | null
          current_price: number | null
          in_stock: boolean | null
          is_data_stale: boolean | null
          name: string | null
          normalized_attributes: Json | null
          organization_id: string | null
          primary_image_url: string | null
          product_id: string | null
          product_type: string | null
          quality: string | null
          sku: string | null
          specifications: Json | null
          stock_quantity: number | null
        }
        Insert: {
          active_promotions?: never
          brand?: string | null
          collected_at?: string | null
          compare_at_price?: number | null
          completeness_score?: number | null
          current_price?: number | null
          in_stock?: boolean | null
          is_data_stale?: never
          name?: string | null
          normalized_attributes?: Json | null
          organization_id?: string | null
          primary_image_url?: never
          product_id?: string | null
          product_type?: string | null
          quality?: string | null
          sku?: string | null
          specifications?: Json | null
          stock_quantity?: number | null
        }
        Update: {
          active_promotions?: never
          brand?: string | null
          collected_at?: string | null
          compare_at_price?: number | null
          completeness_score?: number | null
          current_price?: number | null
          in_stock?: boolean | null
          is_data_stale?: never
          name?: string | null
          normalized_attributes?: Json | null
          organization_id?: string | null
          primary_image_url?: never
          product_id?: string | null
          product_type?: string | null
          quality?: string | null
          sku?: string | null
          specifications?: Json | null
          stock_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      read_staff_warranty: {
        Args: {
          p_actor_id: string
          p_id?: string
          p_orders?: boolean
          p_organization_id: string
          p_page?: number
          p_search?: string
        }
        Returns: Json
      }
      knowledge_ingestion_status: {
        Args: {
          p_actor_id: string
          p_organization_id: string
          p_source_id: string
        }
        Returns: Json
      }
      read_current_knowledge: {
        Args: { p_organization_id: string; p_source_id: string }
        Returns: Json
      }
      fail_knowledge_ingestion: {
        Args: {
          p_error: string
          p_job_id: string
          p_owner: string
          p_token: string
        }
        Returns: boolean
      }
      publish_knowledge_ingestion: {
        Args: {
          p_chunks: Json
          p_content_type: string
          p_final_url: string | null
          p_hash: string
          p_job_id: string
          p_owner: string
          p_token: string
        }
        Returns: boolean
      }
      claim_knowledge_ingestion: {
        Args: { p_owner: string }
        Returns: {
          attempt_started_at: string | null
          attempts: number
          available_at: string
          created_at: string
          dedup_key: string
          entity_id: string
          id: string
          kind: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          max_attempts: number
          organization_id: string
          scheduled_at: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "business_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      finish_consultation: {
        Args: {
          p_job_id: string
          p_outcome: Json
          p_owner: string
          p_token: string
        }
        Returns: boolean
      }
      claim_consultation_job: { Args: { p_owner: string; p_organization_id: string }; Returns: Json }
      lookup_consultation_evidence: {
        Args: { p_organization_id: string; p_query: Json }
        Returns: Json
      }
      record_knowledge_gap: { Args: { p_organization_id: string; p_event_id: string; p_expected_revision: number; p_product_id: string | null; p_field: string; p_reason: string }; Returns: Json }
      resolve_knowledge_gap: { Args: { p_organization_id: string; p_actor_id: string; p_id: string; p_expected_version: number; p_request_id: string }; Returns: Json }
      read_knowledge_gaps: { Args: { p_organization_id: string; p_actor_id: string; p_status: string; p_page: number }; Returns: Json }

      record_trend_ingestion: {
        Args: { p_batch: Json; p_organization_id: string; p_run_id: string }
        Returns: string
      }
      save_knowledge_source: {
        Args: { p_organization_id: string; p_actor_id: string; p_id: string; p_request_id: string; p_expected_version: number; p_document: Json }
        Returns: Json
      }
      reserve_staff_account: {
        Args: {
          p_actor_id: string
          p_credential_digest: string
          p_display_name: string
          p_email: string
          p_organization_id: string
          p_request_id: string
          p_role: string
        }
        Returns: Json
      }
      finish_staff_account: {
        Args: {
          p_actor_id: string
          p_organization_id: string
          p_request_id: string
        }
        Returns: Json
      }
      update_staff_account: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_display_name: string
          p_expected_version: number
          p_organization_id: string
          p_request_id: string
          p_role: string
          p_user_id: string
        }
        Returns: Json
      }
      save_knowledge: {
        Args: {
          p_actor_id: string
          p_document: Json
          p_expected_version: number
          p_id: string
          p_organization_id: string
          p_request_id: string
        }
        Returns: Json
      }
      save_business_settings: {
        Args: {
          p_actor_id: string
          p_expected_revision: number
          p_organization_id: string
          p_request_id: string
          p_settings: Json
        }
        Returns: Json
      }
      valid_business_settings: { Args: { s: Json }; Returns: boolean }
      claim_business_job: {
        Args: { p_lease_seconds?: number; p_now?: string; p_owner: string }
        Returns: {
          attempt_started_at: string | null
          attempts: number
          available_at: string
          created_at: string
          dedup_key: string
          entity_id: string
          id: string
          kind: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          max_attempts: number
          organization_id: string
          scheduled_at: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "business_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      enqueue_business_job: {
        Args: {
          p_available_at: string
          p_dedup_key: string
          p_entity_id: string
          p_kind: string
          p_max_attempts?: number
          p_organization_id: string
        }
        Returns: string
      }
      finish_business_job: {
        Args: {
          p_error?: string
          p_id: string
          p_now?: string
          p_owner: string
          p_token: string
        }
        Returns: boolean
      }
      heartbeat_business_job: {
        Args: {
          p_id: string
          p_lease_seconds?: number
          p_now?: string
          p_owner: string
          p_token: string
        }
        Returns: boolean
      }
      ingest_facebook_events: {
        Args: { p_events: Json; p_organization_id: string; p_page_id: string }
        Returns: number
      }
      conversation_snapshot: { Args: { p_id: string }; Returns: Json }
      project_facebook_conversation: {
        Args: { p_event_id: string; p_organization_id: string }
        Returns: Json
      }
      request_conversation_handoff: {
        Args: {
          p_event_id: string
          p_expected_revision: number
          p_organization_id: string
          p_reason: string
        }
        Returns: Json
      }
      transition_conversation_handoff: {
        Args: {
          p_actor_id: string
          p_conversation_id: string
          p_expected_revision: number
          p_operation: string
          p_organization_id: string
          p_request_id: string
        }
        Returns: Json
      }
      reassign_conversation_handoff: {
        Args: {
          p_actor_id: string
          p_assignee_id: string
          p_conversation_id: string
          p_expected_revision: number
          p_organization_id: string
          p_request_id: string
        }
        Returns: Json
      }
      onevoice_healthcheck: { Args: never; Returns: string }
      save_catalog_product: {
        Args: { p_organization_id: string; p_actor_id: string; p_request_id: string; p_product_id: string; p_expected_version: number; p_document: Json }
        Returns: Json
      }
      save_staff_order_draft: {
        Args: { p_organization_id: string; p_actor_id: string; p_order_id: string; p_request_id: string; p_expected_revision: number; p_document: Json }
        Returns: Json
      }
      read_content_evidence: { Args: { p_org: string; p_sources: Json }; Returns: Json }
      save_content_version: { Args: { p_org: string; p_slot: string; p_id: string; p_request: string; p_expected: number; p_document: Json }; Returns: Json }
      check_content_version: { Args: { p_org: string; p_id: string }; Returns: Json }
      create_priority_campaign: { Args: { p_org: string; p_actor: string; p_id: string; p_request: string; p_revision: number; p_document: Json }; Returns: Json }
      create_opportunity_campaign: { Args: { p_org: string; p_id: string; p_request: string; p_revision: number; p_decision: Json }; Returns: Json }
      finish_campaign: { Args: { p_org: string; p_id: string; p_request: string; p_version: number; p_status: string }; Returns: Json }
      read_campaigns: { Args: { p_org: string; p_actor: string; p_id?: string | null; p_page?: number }; Returns: Json }
      save_warranty_case: {
        Args: { p_organization_id: string; p_actor_id: string; p_id: string; p_request_id: string; p_expected_version: number; p_order_id: string; p_line_number: number; p_status: string; p_customer_note: string; p_private_note: string }
        Returns: Json
      }
      request_knowledge_ingestion: { Args: { p_organization_id: string; p_actor_id: string; p_source_id: string; p_version: number }; Returns: string }
      enqueue_due_knowledge: { Args: Record<string, never>; Returns: number }
      read_customer_warranty: {
        Args: { p_organization_id: string; p_conversation_id: string; p_order_id: string }
        Returns: Json
      }
      internal_warranty_record: {
        Args: { p_id: string; p_include_history?: boolean }
        Returns: Json
      }
      save_automation_order_draft: {
        Args: { p_organization_id: string; p_owner_id: string; p_conversation_id: string | null; p_order_id: string; p_request_id: string; p_expected_revision: number; p_document: Json }
        Returns: Json
      }
      read_staff_order: {
        Args: { p_organization_id: string; p_actor_id: string; p_order_id: string }
        Returns: Json
      }
      read_automation_order: {
        Args: { p_organization_id: string; p_owner_id: string; p_order_id: string }
        Returns: Json
      }
      freeze_order_checkout_snapshot: {
        Args: { p_organization_id: string; p_order_id: string; p_expected_revision: number; p_request_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
