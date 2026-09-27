export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_used_at: string | null
          project_member_id: string
          revoked_at: string | null
          token_hash: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          project_member_id: string
          revoked_at?: string | null
          token_hash: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          project_member_id?: string
          revoked_at?: string | null
          token_hash?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "access_links_project_member_id_fkey"
            columns: ["project_member_id"]
            isOneToOne: false
            referencedRelation: "project_members"
            referencedColumns: ["id"]
          },
        ]
      }
      activity: {
        Row: {
          actor_user_id: string | null
          audience_capability: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          org_id: string
          project_id: string
          summary: string
          version: number
        }
        Insert: {
          actor_user_id?: string | null
          audience_capability?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          org_id: string
          project_id: string
          summary: string
          version?: number
        }
        Update: {
          actor_user_id?: string | null
          audience_capability?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          org_id?: string
          project_id?: string
          summary?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_recipients: {
        Row: {
          activity_id: string
          user_id: string
        }
        Insert: {
          activity_id: string
          user_id: string
        }
        Update: {
          activity_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_recipients_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity"
            referencedColumns: ["id"]
          },
        ]
      }
      addenda: {
        Row: {
          body: string
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          file_ids: string[]
          id: string
          issued_at: string | null
          number: number
          org_id: string
          project_id: string
          signed_at: string | null
          signed_by: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          body?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          file_ids?: string[]
          id?: string
          issued_at?: string | null
          number: number
          org_id: string
          project_id: string
          signed_at?: string | null
          signed_by?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          file_ids?: string[]
          id?: string
          issued_at?: string | null
          number?: number
          org_id?: string
          project_id?: string
          signed_at?: string | null
          signed_by?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "addenda_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addenda_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      addendum_acks: {
        Row: {
          acked_at: string
          addendum_id: string
          member_id: string
          project_id: string
        }
        Insert: {
          acked_at?: string
          addendum_id: string
          member_id: string
          project_id: string
        }
        Update: {
          acked_at?: string
          addendum_id?: string
          member_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addendum_acks_addendum_id_fkey"
            columns: ["addendum_id"]
            isOneToOne: false
            referencedRelation: "addenda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addendum_acks_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "project_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addendum_acks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_calls: {
        Row: {
          at: string
          error: string | null
          id: number
          input_tokens: number
          latency_ms: number
          model: string
          ok: boolean
          output_tokens: number
          project_id: string | null
          task: string
          user_id: string | null
        }
        Insert: {
          at?: string
          error?: string | null
          id?: never
          input_tokens?: number
          latency_ms?: number
          model: string
          ok?: boolean
          output_tokens?: number
          project_id?: string | null
          task: string
          user_id?: string | null
        }
        Update: {
          at?: string
          error?: string | null
          id?: never
          input_tokens?: number
          latency_ms?: number
          model?: string
          ok?: boolean
          output_tokens?: number
          project_id?: string | null
          task?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_calls_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_kind: string
          actor_user_id: string | null
          content_hash: string | null
          details: Json
          entity_id: string | null
          entity_type: string | null
          id: number
          ip: unknown
          occurred_at: string
          org_id: string | null
          project_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_kind?: string
          actor_user_id?: string | null
          content_hash?: string | null
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          ip?: unknown
          occurred_at?: string
          org_id?: string | null
          project_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_kind?: string
          actor_user_id?: string | null
          content_hash?: string | null
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          ip?: unknown
          occurred_at?: string
          org_id?: string | null
          project_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      author_counters: {
        Row: {
          author_id: string
          kind: string
          next_value: number
          project_id: string
        }
        Insert: {
          author_id: string
          kind: string
          next_value?: number
          project_id: string
        }
        Update: {
          author_id?: string
          kind?: string
          next_value?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "author_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_extraction_pricing: {
        Row: {
          adds_deducts: Json
          alternates: Json
          base_amount: number | null
          base_evidence: string | null
          base_page: number | null
          extraction_id: string
          project_id: string
          pw_adder_amount: number | null
          unit_prices: Json
        }
        Insert: {
          adds_deducts?: Json
          alternates?: Json
          base_amount?: number | null
          base_evidence?: string | null
          base_page?: number | null
          extraction_id: string
          project_id: string
          pw_adder_amount?: number | null
          unit_prices?: Json
        }
        Update: {
          adds_deducts?: Json
          alternates?: Json
          base_amount?: number | null
          base_evidence?: string | null
          base_page?: number | null
          extraction_id?: string
          project_id?: string
          pw_adder_amount?: number | null
          unit_prices?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bid_extraction_pricing_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: true
            referencedRelation: "bid_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_extraction_pricing_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_extractions: {
        Row: {
          bid_date: string | null
          bidder_name: string | null
          confidence: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          document_kind: string | null
          exclusions: string[]
          id: string
          inclusions: string[]
          model: string | null
          notable_terms: string[]
          org_id: string
          prevailing_wage: string | null
          prevailing_wage_evidence: string | null
          project_id: string
          project_match: string | null
          scope_summary: string | null
          status: string
          submission_id: string
          updated_at: string
          validity_days: number | null
          version: number
        }
        Insert: {
          bid_date?: string | null
          bidder_name?: string | null
          confidence?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          document_kind?: string | null
          exclusions?: string[]
          id?: string
          inclusions?: string[]
          model?: string | null
          notable_terms?: string[]
          org_id: string
          prevailing_wage?: string | null
          prevailing_wage_evidence?: string | null
          project_id: string
          project_match?: string | null
          scope_summary?: string | null
          status?: string
          submission_id: string
          updated_at?: string
          validity_days?: number | null
          version?: number
        }
        Update: {
          bid_date?: string | null
          bidder_name?: string | null
          confidence?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          document_kind?: string | null
          exclusions?: string[]
          id?: string
          inclusions?: string[]
          model?: string | null
          notable_terms?: string[]
          org_id?: string
          prevailing_wage?: string | null
          prevailing_wage_evidence?: string | null
          project_id?: string
          project_match?: string | null
          scope_summary?: string | null
          status?: string
          submission_id?: string
          updated_at?: string
          validity_days?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bid_extractions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_extractions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_extractions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "bid_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_invites: {
        Row: {
          created_at: string
          created_by: string | null
          decline_reason: string | null
          deleted_at: string | null
          id: string
          member_id: string
          opened_at: string | null
          org_id: string
          package_id: string
          project_id: string
          responded_at: string | null
          sent_at: string
          status: string
          sub_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decline_reason?: string | null
          deleted_at?: string | null
          id?: string
          member_id: string
          opened_at?: string | null
          org_id: string
          package_id: string
          project_id: string
          responded_at?: string | null
          sent_at?: string
          status?: string
          sub_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decline_reason?: string | null
          deleted_at?: string | null
          id?: string
          member_id?: string
          opened_at?: string | null
          org_id?: string
          package_id?: string
          project_id?: string
          responded_at?: string | null
          sent_at?: string
          status?: string
          sub_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bid_invites_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "project_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_invites_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "bid_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_invites_sub_id_fkey"
            columns: ["sub_id"]
            isOneToOne: false
            referencedRelation: "subs"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_leveling: {
        Row: {
          comparable: boolean
          flags: Json
          is_backup: boolean
          is_duplicate: boolean
          notes: string
          project_id: string
          reassigned_package_id: string | null
          submission_id: string
          updated_at: string
          version: number
        }
        Insert: {
          comparable?: boolean
          flags?: Json
          is_backup?: boolean
          is_duplicate?: boolean
          notes?: string
          project_id: string
          reassigned_package_id?: string | null
          submission_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          comparable?: boolean
          flags?: Json
          is_backup?: boolean
          is_duplicate?: boolean
          notes?: string
          project_id?: string
          reassigned_package_id?: string | null
          submission_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bid_leveling_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_leveling_reassigned_package_id_fkey"
            columns: ["reassigned_package_id"]
            isOneToOne: false
            referencedRelation: "bid_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_leveling_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "bid_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_packages: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          org_id: string
          project_id: string
          scope_text: string
          sort: number
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          org_id: string
          project_id: string
          scope_text?: string
          sort?: number
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          org_id?: string
          project_id?: string
          scope_text?: string
          sort?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bid_packages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_packages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_questions: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          member_id: string | null
          number: number
          org_id: string
          package_id: string | null
          project_id: string
          question: string
          source: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          member_id?: string | null
          number: number
          org_id: string
          package_id?: string | null
          project_id: string
          question: string
          source?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          member_id?: string | null
          number?: number
          org_id?: string
          package_id?: string | null
          project_id?: string
          question?: string
          source?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bid_questions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "project_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_questions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_questions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "bid_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_questions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_submissions: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          file_id: string
          id: string
          is_late: boolean
          member_id: string
          org_id: string
          package_id: string
          project_id: string
          receipt_number: number
          received_at: string
          source: string
          superseded_by: string | null
          updated_at: string
          version: number
          version_no: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          file_id: string
          id?: string
          is_late?: boolean
          member_id: string
          org_id: string
          package_id: string
          project_id: string
          receipt_number: number
          received_at?: string
          source?: string
          superseded_by?: string | null
          updated_at?: string
          version?: number
          version_no?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          file_id?: string
          id?: string
          is_late?: boolean
          member_id?: string
          org_id?: string
          package_id?: string
          project_id?: string
          receipt_number?: number
          received_at?: string
          source?: string
          superseded_by?: string | null
          updated_at?: string
          version?: number
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "bid_submissions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_submissions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "project_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_submissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_submissions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "bid_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_submissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_submissions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "bid_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      dead_jobs: {
        Row: {
          attempts: number
          died_at: string
          id: string
          kind: string
          last_error: string | null
          payload: Json
          project_id: string | null
        }
        Insert: {
          attempts: number
          died_at?: string
          id: string
          kind: string
          last_error?: string | null
          payload: Json
          project_id?: string | null
        }
        Update: {
          attempts?: number
          died_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dead_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      downloads: {
        Row: {
          at: string
          file_id: string
          id: number
          ip: unknown
          project_id: string
          share_link_id: string | null
          user_id: string | null
          variant: string
        }
        Insert: {
          at?: string
          file_id: string
          id?: never
          ip?: unknown
          project_id: string
          share_link_id?: string | null
          user_id?: string | null
          variant?: string
        }
        Update: {
          at?: string
          file_id?: string
          id?: never
          ip?: unknown
          project_id?: string
          share_link_id?: string | null
          user_id?: string | null
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "downloads_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downloads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          event_id: string
          event_type: string
          id: number
          payload: Json
          received_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          id?: never
          payload: Json
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          id?: never
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      email_inbound: {
        Row: {
          attachment_file_ids: string[]
          classification: string | null
          created_at: string
          dkim_pass: boolean
          from_email: string
          from_name: string | null
          id: string
          message_id: string
          org_id: string | null
          project_id: string | null
          raw_path: string
          sender_member_id: string | null
          spf_pass: boolean
          status: string
          subject: string
          text_body: string | null
          thread_token: string | null
          to_address: string
          updated_at: string
          version: number
        }
        Insert: {
          attachment_file_ids?: string[]
          classification?: string | null
          created_at?: string
          dkim_pass?: boolean
          from_email: string
          from_name?: string | null
          id?: string
          message_id: string
          org_id?: string | null
          project_id?: string | null
          raw_path: string
          sender_member_id?: string | null
          spf_pass?: boolean
          status?: string
          subject?: string
          text_body?: string | null
          thread_token?: string | null
          to_address: string
          updated_at?: string
          version?: number
        }
        Update: {
          attachment_file_ids?: string[]
          classification?: string | null
          created_at?: string
          dkim_pass?: boolean
          from_email?: string
          from_name?: string | null
          id?: string
          message_id?: string
          org_id?: string | null
          project_id?: string | null
          raw_path?: string
          sender_member_id?: string | null
          spf_pass?: boolean
          status?: string
          subject?: string
          text_body?: string | null
          thread_token?: string | null
          to_address?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_inbound_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_inbound_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_inbound_sender_member_id_fkey"
            columns: ["sender_member_id"]
            isOneToOne: false
            referencedRelation: "project_members"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbound: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          error: string | null
          first_opened_at: string | null
          id: string
          kind: string
          org_id: string | null
          project_id: string | null
          provider_message_id: string | null
          status: string
          status_at: string | null
          subject: string
          to_email: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          first_opened_at?: string | null
          id?: string
          kind: string
          org_id?: string | null
          project_id?: string | null
          provider_message_id?: string | null
          status?: string
          status_at?: string | null
          subject: string
          to_email: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          first_opened_at?: string | null
          id?: string
          kind?: string
          org_id?: string | null
          project_id?: string | null
          provider_message_id?: string | null
          status?: string
          status_at?: string | null
          subject?: string
          to_email?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_outbound_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbound_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          created_at: string
          email: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string
        }
        Relationships: []
      }
      file_pages: {
        Row: {
          file_id: string
          id: string
          page_no: number
          project_id: string
          sheet_number: string | null
          sheet_title: string | null
          text: string
          thumbnail_path: string | null
          tsv: unknown
        }
        Insert: {
          file_id: string
          id?: string
          page_no: number
          project_id: string
          sheet_number?: string | null
          sheet_title?: string | null
          text?: string
          thumbnail_path?: string | null
          tsv?: unknown
        }
        Update: {
          file_id?: string
          id?: string
          page_no?: number
          project_id?: string
          sheet_number?: string | null
          sheet_title?: string | null
          text?: string
          thumbnail_path?: string | null
          tsv?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "file_pages_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_pages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          folder_id: string
          id: string
          mime: string
          org_id: string
          original_name: string
          page_count: number | null
          project_id: string
          scan_status: string
          scanned_at: string | null
          sha256: string | null
          size: number
          storage_path: string
          superseded_by: string | null
          text_status: string
          updated_at: string
          upload_complete: boolean
          version: number
          version_group_id: string
          version_no: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          folder_id: string
          id?: string
          mime?: string
          org_id: string
          original_name: string
          page_count?: number | null
          project_id: string
          scan_status?: string
          scanned_at?: string | null
          sha256?: string | null
          size?: number
          storage_path: string
          superseded_by?: string | null
          text_status?: string
          updated_at?: string
          upload_complete?: boolean
          version?: number
          version_group_id?: string
          version_no?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          folder_id?: string
          id?: string
          mime?: string
          org_id?: string
          original_name?: string
          page_count?: number | null
          project_id?: string
          scan_status?: string
          scanned_at?: string | null
          sha256?: string | null
          size?: number
          storage_path?: string
          superseded_by?: string | null
          text_status?: string
          updated_at?: string
          upload_complete?: boolean
          version?: number
          version_group_id?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_access: {
        Row: {
          can_read: boolean
          can_write: boolean
          capability: string | null
          created_at: string
          created_by: string | null
          folder_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          can_read?: boolean
          can_write?: boolean
          capability?: string | null
          created_at?: string
          created_by?: string | null
          folder_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          can_read?: boolean
          can_write?: boolean
          capability?: string | null
          created_at?: string
          created_by?: string | null
          folder_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folder_access_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          kind: string
          name: string
          org_id: string
          parent_id: string | null
          project_id: string
          proprietary: boolean
          updated_at: string
          version: number
          view_only: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          kind?: string
          name: string
          org_id: string
          parent_id?: string | null
          project_id: string
          proprietary?: boolean
          updated_at?: string
          version?: number
          view_only?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          kind?: string
          name?: string
          org_id?: string
          parent_id?: string | null
          project_id?: string
          proprietary?: boolean
          updated_at?: string
          version?: number
          view_only?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "folders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      job_kinds: {
        Row: {
          kind: string
          max_attempts: number
          required_capability: string | null
          visibility_timeout_sec: number
        }
        Insert: {
          kind: string
          max_attempts?: number
          required_capability?: string | null
          visibility_timeout_sec?: number
        }
        Update: {
          kind?: string
          max_attempts?: number
          required_capability?: string | null
          visibility_timeout_sec?: number
        }
        Relationships: []
      }
      login_sync_state: {
        Row: {
          id: number
          last_seen: string
        }
        Insert: {
          id?: number
          last_seen?: string
        }
        Update: {
          id?: number
          last_seen?: string
        }
        Relationships: []
      }
      member_scopes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          project_member_id: string
          scope_id: string
          scope_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_member_id: string
          scope_id: string
          scope_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_member_id?: string
          scope_id?: string
          scope_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_scopes_project_member_id_fkey"
            columns: ["project_member_id"]
            isOneToOne: false
            referencedRelation: "project_members"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          org_role: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          org_role: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          org_role?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          intake_address: string | null
          kind: string
          name: string
          settings: Json
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          intake_address?: string | null
          kind: string
          name: string
          settings?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          intake_address?: string | null
          kind?: string
          name?: string
          settings?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      owner_lookup: {
        Row: {
          entity_type: string
          owner_column: string
          table_name: string
        }
        Insert: {
          entity_type: string
          owner_column?: string
          table_name: string
        }
        Update: {
          entity_type?: string
          owner_column?: string
          table_name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cert_numbers: Json
          company: string | null
          created_at: string
          email: string
          full_name: string
          phone: string | null
          signature_path: string | null
          timezone: string
          timezone_set_by_user: boolean
          title: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          cert_numbers?: Json
          company?: string | null
          created_at?: string
          email: string
          full_name?: string
          phone?: string | null
          signature_path?: string | null
          timezone?: string
          timezone_set_by_user?: boolean
          title?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          cert_numbers?: Json
          company?: string | null
          created_at?: string
          email?: string
          full_name?: string
          phone?: string | null
          signature_path?: string | null
          timezone?: string
          timezone_set_by_user?: boolean
          title?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      project_counters: {
        Row: {
          kind: string
          next_value: number
          project_id: string
        }
        Insert: {
          kind: string
          next_value?: number
          project_id: string
        }
        Update: {
          kind?: string
          next_value?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          access_ends_at: string | null
          created_at: string
          created_by: string | null
          id: string
          invite_email: string
          invited_by: string | null
          member_org_id: string | null
          org_id: string
          project_id: string
          revoked_at: string | null
          role: string
          start_numbers: Json
          status: string
          updated_at: string
          user_id: string | null
          version: number
        }
        Insert: {
          access_ends_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invite_email: string
          invited_by?: string | null
          member_org_id?: string | null
          org_id: string
          project_id: string
          revoked_at?: string | null
          role: string
          start_numbers?: Json
          status?: string
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Update: {
          access_ends_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invite_email?: string
          invited_by?: string | null
          member_org_id?: string | null
          org_id?: string
          project_id?: string
          revoked_at?: string | null
          role?: string
          start_numbers?: Json
          status?: string
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_members_member_org_id_fkey"
            columns: ["member_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_org_fk"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "project_members_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          bid_due_at: string | null
          bid_sealed: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          delivery_token_hash: string | null
          funding: string | null
          id: string
          inbound_address: string | null
          job_type: string | null
          modules: string[]
          name: string
          number: string | null
          org_id: string
          prevailing_wage: boolean
          request_token_hash: string | null
          settings: Json
          stage: string
          timezone: string
          updated_at: string
          version: number
        }
        Insert: {
          address?: string | null
          bid_due_at?: string | null
          bid_sealed?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_token_hash?: string | null
          funding?: string | null
          id?: string
          inbound_address?: string | null
          job_type?: string | null
          modules?: string[]
          name: string
          number?: string | null
          org_id: string
          prevailing_wage?: boolean
          request_token_hash?: string | null
          settings?: Json
          stage?: string
          timezone?: string
          updated_at?: string
          version?: number
        }
        Update: {
          address?: string | null
          bid_due_at?: string | null
          bid_sealed?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_token_hash?: string | null
          funding?: string | null
          id?: string
          inbound_address?: string | null
          job_type?: string | null
          modules?: string[]
          name?: string
          number?: string | null
          org_id?: string
          prevailing_wage?: boolean
          request_token_hash?: string | null
          settings?: Json
          stage?: string
          timezone?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      published_answers: {
        Row: {
          answer: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          number: number
          org_id: string
          package_id: string | null
          project_id: string
          published_at: string
          question_text: string
          updated_at: string
          version: number
        }
        Insert: {
          answer: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          number: number
          org_id: string
          package_id?: string | null
          project_id: string
          published_at?: string
          question_text: string
          updated_at?: string
          version?: number
        }
        Update: {
          answer?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          number?: number
          org_id?: string
          package_id?: string | null
          project_id?: string
          published_at?: string
          question_text?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "published_answers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_answers_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "bid_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_answers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          failures: number
          id: string
          keys: Json
          last_success_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          failures?: number
          id?: string
          keys: Json
          last_success_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          failures?: number
          id?: string
          keys?: Json
          last_success_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          key: string
          tokens: number
          updated_at: string
        }
        Insert: {
          key: string
          tokens: number
          updated_at?: string
        }
        Update: {
          key?: string
          tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      read_marks: {
        Row: {
          last_seen_at: string
          project_id: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          project_id: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "read_marks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          capability: string
          requires_aal2: boolean
          role: string
        }
        Insert: {
          capability: string
          requires_aal2?: boolean
          role: string
        }
        Update: {
          capability?: string
          requires_aal2?: boolean
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      roles: {
        Row: {
          description: string
          name: string
        }
        Insert: {
          description?: string
          name: string
        }
        Update: {
          description?: string
          name?: string
        }
        Relationships: []
      }
      share_links: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_used_at: string | null
          member_id: string | null
          org_id: string
          project_id: string
          recipient_email: string
          revoked_at: string | null
          target_id: string
          target_type: string
          use_count: number
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_used_at?: string | null
          member_id?: string | null
          org_id: string
          project_id: string
          recipient_email: string
          revoked_at?: string | null
          target_id: string
          target_type: string
          use_count?: number
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_used_at?: string | null
          member_id?: string | null
          org_id?: string
          project_id?: string
          recipient_email?: string
          revoked_at?: string | null
          target_id?: string
          target_type?: string
          use_count?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "share_links_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "project_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      signin_allowlist: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      sub_history: {
        Row: {
          at: string
          details: Json
          id: number
          kind: string
          org_id: string
          project_id: string | null
          sub_id: string
        }
        Insert: {
          at?: string
          details?: Json
          id?: never
          kind: string
          org_id: string
          project_id?: string | null
          sub_id: string
        }
        Update: {
          at?: string
          details?: Json
          id?: never
          kind?: string
          org_id?: string
          project_id?: string | null
          sub_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_history_sub_id_fkey"
            columns: ["sub_id"]
            isOneToOne: false
            referencedRelation: "subs"
            referencedColumns: ["id"]
          },
        ]
      }
      subs: {
        Row: {
          company: string
          contacts: Json
          created_at: string
          created_by: string | null
          cslb_checked_at: string | null
          cslb_number: string | null
          cslb_status: string | null
          deleted_at: string | null
          dir_number: string | null
          id: string
          notes: string
          org_id: string
          region: string | null
          trades: string[]
          updated_at: string
          version: number
        }
        Insert: {
          company: string
          contacts?: Json
          created_at?: string
          created_by?: string | null
          cslb_checked_at?: string | null
          cslb_number?: string | null
          cslb_status?: string | null
          deleted_at?: string | null
          dir_number?: string | null
          id?: string
          notes?: string
          org_id: string
          region?: string | null
          trades?: string[]
          updated_at?: string
          version?: number
        }
        Update: {
          company?: string
          contacts?: Json
          created_at?: string
          created_by?: string | null
          cslb_checked_at?: string | null
          cslb_number?: string | null
          cslb_status?: string | null
          deleted_at?: string | null
          dir_number?: string | null
          id?: string
          notes?: string
          org_id?: string
          region?: string | null
          trades?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "subs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_user_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          done_at: string | null
          done_by: string | null
          due_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          org_id: string
          payload: Json
          project_id: string
          requires_signature: boolean
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          assignee_user_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          done_at?: string | null
          done_by?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          org_id: string
          payload?: Json
          project_id: string
          requires_signature?: boolean
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          assignee_user_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          done_at?: string | null
          done_by?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          org_id?: string
          payload?: Json
          project_id?: string
          requires_signature?: boolean
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      transmittals: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          delivery_status: string
          file_ids: string[]
          first_opened_at: string | null
          from_user: string
          id: string
          message: string
          number: number
          org_id: string
          project_id: string
          provider_message_id: string | null
          sent_at: string | null
          share_link_ids: string[]
          subject: string
          to_emails: string[]
          to_members: string[]
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          delivery_status?: string
          file_ids?: string[]
          first_opened_at?: string | null
          from_user: string
          id?: string
          message?: string
          number: number
          org_id: string
          project_id: string
          provider_message_id?: string | null
          sent_at?: string | null
          share_link_ids?: string[]
          subject?: string
          to_emails?: string[]
          to_members?: string[]
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          delivery_status?: string
          file_ids?: string[]
          first_opened_at?: string | null
          from_user?: string
          id?: string
          message?: string
          number?: number
          org_id?: string
          project_id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          share_link_ids?: string[]
          subject?: string
          to_emails?: string[]
          to_members?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "transmittals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transmittals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_layout: {
        Row: {
          calendar_types: string[]
          collapsed: Json
          created_at: string
          docked_panel: string
          main_default: string
          notification_kinds: string[]
          rail_items: string[]
          recent_project_ids: string[]
          updated_at: string
          user_id: string
          version: number
          whats_new_enabled: boolean
        }
        Insert: {
          calendar_types?: string[]
          collapsed?: Json
          created_at?: string
          docked_panel?: string
          main_default?: string
          notification_kinds?: string[]
          rail_items?: string[]
          recent_project_ids?: string[]
          updated_at?: string
          user_id: string
          version?: number
          whats_new_enabled?: boolean
        }
        Update: {
          calendar_types?: string[]
          collapsed?: Json
          created_at?: string
          docked_panel?: string
          main_default?: string
          notification_kinds?: string[]
          rail_items?: string[]
          recent_project_ids?: string[]
          updated_at?: string
          user_id?: string
          version?: number
          whats_new_enabled?: boolean
        }
        Relationships: []
      }
      worker_heartbeat: {
        Row: {
          id: number
          last_seen: string
          version: string | null
        }
        Insert: {
          id?: number
          last_seen?: string
          version?: string | null
        }
        Update: {
          id?: number
          last_seen?: string
          version?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invites: { Args: never; Returns: number }
      acknowledge_addendum: {
        Args: { p_addendum_id: string }
        Returns: undefined
      }
      answer_bid_question: {
        Args: {
          p_answer: string
          p_package_only?: boolean
          p_question_id: string
          p_question_text: string
        }
        Returns: {
          answer: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          number: number
          org_id: string
          package_id: string | null
          project_id: string
          published_at: string
          question_text: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "published_answers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ask_bid_question: {
        Args: { p_package_id: string; p_project_id: string; p_question: string }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          member_id: string | null
          number: number
          org_id: string
          package_id: string | null
          project_id: string
          question: string
          source: string
          status: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "bid_questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_version: {
        Args: { p_expected: number; p_id: string; p_table: unknown }
        Returns: undefined
      }
      audit: {
        Args: {
          p_action: string
          p_actor_kind?: string
          p_content_hash?: string
          p_details?: Json
          p_entity_id: string
          p_entity_type: string
          p_org_id?: string
          p_project_id: string
        }
        Returns: number
      }
      authorize_download: {
        Args: { p_file_id: string; p_variant?: string }
        Returns: {
          mime: string
          original_name: string
          storage_path: string
        }[]
      }
      bid_coverage: {
        Args: { p_project_id: string }
        Returns: {
          code: string
          declined: number
          intends: number
          invited: number
          late: number
          name: string
          opened: number
          package_id: string
          submitted: number
        }[]
      }
      bidder_page: { Args: { p_project_id: string }; Returns: Json }
      bids_open: { Args: { p_project_id: string }; Returns: boolean }
      board_feed: {
        Args: { p_before?: string; p_limit?: number; p_project_id?: string }
        Returns: {
          actor_user_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          kind: string
          project_id: string
          project_name: string
          summary: string
          unread: boolean
        }[]
      }
      complete_task: {
        Args: { p_task_id: string; p_version: number }
        Returns: {
          assignee_user_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          done_at: string | null
          done_by: string | null
          due_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          org_id: string
          payload: Json
          project_id: string
          requires_signature: boolean
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_rate_limit: {
        Args: {
          p_capacity: number
          p_cost?: number
          p_key: string
          p_refill_per_sec: number
        }
        Returns: boolean
      }
      create_addendum: {
        Args: {
          p_body: string
          p_file_ids?: string[]
          p_project_id: string
          p_title: string
        }
        Returns: {
          body: string
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          file_ids: string[]
          id: string
          issued_at: string | null
          number: number
          org_id: string
          project_id: string
          signed_at: string | null
          signed_by: string | null
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "addenda"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_org: { Args: { p_kind: string; p_name: string }; Returns: string }
      create_project: {
        Args: {
          p_address?: string
          p_bid_due_at?: string
          p_job_type?: string
          p_name: string
          p_number?: string
          p_org_id: string
          p_prevailing_wage?: boolean
          p_stage: string
        }
        Returns: string
      }
      create_task: {
        Args: {
          p_assignee: string
          p_due_at?: string
          p_entity_id?: string
          p_entity_type?: string
          p_kind: string
          p_payload?: Json
          p_project_id: string
          p_requires_signature?: boolean
          p_title: string
        }
        Returns: string
      }
      create_transmittal: {
        Args: {
          p_file_ids: string[]
          p_message: string
          p_project_id: string
          p_subject: string
          p_to_emails: string[]
          p_to_members: string[]
        }
        Returns: {
          created_at: string
          created_by: string
          deleted_at: string | null
          delivery_status: string
          file_ids: string[]
          first_opened_at: string | null
          from_user: string
          id: string
          message: string
          number: number
          org_id: string
          project_id: string
          provider_message_id: string | null
          sent_at: string | null
          share_link_ids: string[]
          subject: string
          to_emails: string[]
          to_members: string[]
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "transmittals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enqueue_job: {
        Args: {
          p_hold_until?: string
          p_idempotency_key?: string
          p_kind: string
          p_payload: Json
          p_project_id?: string
        }
        Returns: string
      }
      file_storage_path: {
        Args: {
          p_file_id: string
          p_folder_id: string
          p_name: string
          p_project_id: string
        }
        Returns: string
      }
      folder_can_read: { Args: { p_folder_id: string }; Returns: boolean }
      folder_can_write: { Args: { p_folder_id: string }; Returns: boolean }
      folder_effective_id: { Args: { p_folder_id: string }; Returns: string }
      has_capability: {
        Args: { p_cap: string; p_project_id: string }
        Returns: boolean
      }
      has_scope: {
        Args: { p_project_id: string; p_scope_id: string; p_scope_type: string }
        Returns: boolean
      }
      is_member: { Args: { p_project_id: string }; Returns: boolean }
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      is_owner_of: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: boolean
      }
      is_service_role: { Args: never; Returns: boolean }
      issue_addendum: {
        Args: { p_addendum_id: string; p_content_hash: string }
        Returns: {
          body: string
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          file_ids: string[]
          id: string
          issued_at: string | null
          number: number
          org_id: string
          project_id: string
          signed_at: string | null
          signed_by: string | null
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "addenda"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      jwt_role: { Args: never; Returns: string }
      log_view: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_project_id: string
        }
        Returns: undefined
      }
      mark_invite_opened: { Args: { p_project_id: string }; Returns: undefined }
      my_bidder_member_id: { Args: { p_project_id: string }; Returns: string }
      my_orgs: {
        Args: never
        Returns: {
          kind: string
          name: string
          org_id: string
          org_role: string
          version: number
        }[]
      }
      my_projects: {
        Args: never
        Returns: {
          modules: string[]
          name: string
          number: string
          org_name: string
          project_id: string
          role: string
          stage: string
          timezone: string
        }[]
      }
      next_author_number: {
        Args: { p_kind: string; p_project_id: string }
        Returns: number
      }
      next_number: {
        Args: { p_kind: string; p_project_id: string }
        Returns: number
      }
      peek_author_number: {
        Args: { p_kind: string; p_project_id: string }
        Returns: number
      }
      people_display: {
        Args: { p_project_id: string }
        Returns: {
          access_ends_at: string
          company: string
          full_name: string
          member_id: string
          role: string
          status: string
          user_id: string
        }[]
      }
      post_activity: {
        Args: {
          p_audience_capability?: string
          p_entity_id?: string
          p_entity_type?: string
          p_kind: string
          p_project_id: string
          p_recipient_user_ids?: string[]
          p_summary: string
        }
        Returns: string
      }
      queue_health: {
        Args: never
        Returns: {
          dead: number
          queued: number
          running: number
          worker_last_seen: string
          worker_stale: boolean
        }[]
      }
      register_file: {
        Args: {
          p_folder_id: string
          p_mime?: string
          p_original_name: string
          p_size?: number
        }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          folder_id: string
          id: string
          mime: string
          org_id: string
          original_name: string
          page_count: number | null
          project_id: string
          scan_status: string
          scanned_at: string | null
          sha256: string | null
          size: number
          storage_path: string
          superseded_by: string | null
          text_status: string
          updated_at: string
          upload_complete: boolean
          version: number
          version_group_id: string
          version_no: number
        }
        SetofOptions: {
          from: "*"
          to: "files"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_held_jobs: { Args: never; Returns: number }
      reopen_task: {
        Args: { p_task_id: string; p_version: number }
        Returns: {
          assignee_user_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          done_at: string | null
          done_by: string | null
          due_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          org_id: string
          payload: Json
          project_id: string
          requires_signature: boolean
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_access_link: {
        Args: { p_link_id: string; p_token_hash: string }
        Returns: {
          invite_email: string
          project_id: string
          project_name: string
          role: string
          status: string
        }[]
      }
      role_is_walled: { Args: { p_role: string }; Returns: boolean }
      session_aal: { Args: never; Returns: string }
      set_bid_intent: {
        Args: { p_intent: string; p_invite_id: string; p_reason?: string }
        Returns: {
          created_at: string
          created_by: string | null
          decline_reason: string | null
          deleted_at: string | null
          id: string
          member_id: string
          opened_at: string | null
          org_id: string
          package_id: string
          project_id: string
          responded_at: string | null
          sent_at: string
          status: string
          sub_id: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "bid_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_bid: {
        Args: { p_file_id: string; p_package_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          file_id: string
          id: string
          is_late: boolean
          member_id: string
          org_id: string
          package_id: string
          project_id: string
          receipt_number: number
          received_at: string
          source: string
          superseded_by: string | null
          updated_at: string
          version: number
          version_no: number
        }
        SetofOptions: {
          from: "*"
          to: "bid_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_detected_timezone: { Args: { p_zone: string }; Returns: string }
      sync_login_audit: { Args: never; Returns: number }
      worker_ack_job: {
        Args: { p_job_id: string; p_msg_id: number }
        Returns: undefined
      }
      worker_fail_job: {
        Args: { p_error: string; p_job_id: string; p_msg_id: number }
        Returns: string
      }
      worker_heartbeat_ping: { Args: { p_version: string }; Returns: undefined }
      worker_read_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          job_id: string
          kind: string
          msg_id: number
          payload: Json
          project_id: string
        }[]
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
  public: {
    Enums: {},
  },
} as const
