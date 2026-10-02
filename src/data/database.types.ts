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
      bid_form_items: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_on: string | null
          file_id: string | null
          id: string
          name: string
          note: string
          org_id: string
          project_id: string
          reference: string
          required: boolean
          sort: number
          status: string
          template_id: string | null
          timing: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_on?: string | null
          file_id?: string | null
          id?: string
          name: string
          note?: string
          org_id: string
          project_id: string
          reference?: string
          required?: boolean
          sort?: number
          status?: string
          template_id?: string | null
          timing: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_on?: string | null
          file_id?: string | null
          id?: string
          name?: string
          note?: string
          org_id?: string
          project_id?: string
          reference?: string
          required?: boolean
          sort?: number
          status?: string
          template_id?: string | null
          timing?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bid_form_items_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_form_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_form_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_form_items_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "bid_form_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "bid_form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_form_templates: {
        Row: {
          created_at: string
          id: string
          if_dsa: boolean | null
          if_job_types: string[] | null
          if_prevailing_wage: boolean | null
          name: string
          org_id: string | null
          reference: string
          required: boolean
          sort: number
          timing: string
        }
        Insert: {
          created_at?: string
          id?: string
          if_dsa?: boolean | null
          if_job_types?: string[] | null
          if_prevailing_wage?: boolean | null
          name: string
          org_id?: string | null
          reference?: string
          required?: boolean
          sort?: number
          timing: string
        }
        Update: {
          created_at?: string
          id?: string
          if_dsa?: boolean | null
          if_job_types?: string[] | null
          if_prevailing_wage?: boolean | null
          name?: string
          org_id?: string | null
          reference?: string
          required?: boolean
          sort?: number
          timing?: string
        }
        Relationships: [
          {
            foreignKeyName: "bid_form_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
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
          spec_sections: string[]
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
          spec_sections?: string[]
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
          spec_sections?: string[]
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
          member_id: string | null
          org_id: string
          package_id: string
          project_id: string
          receipt_number: number
          received_at: string
          received_by: string | null
          source: string
          sub_id: string | null
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
          member_id?: string | null
          org_id: string
          package_id: string
          project_id: string
          receipt_number: number
          received_at?: string
          received_by?: string | null
          source?: string
          sub_id?: string | null
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
          member_id?: string | null
          org_id?: string
          package_id?: string
          project_id?: string
          receipt_number?: number
          received_at?: string
          received_by?: string | null
          source?: string
          sub_id?: string | null
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
            foreignKeyName: "bid_submissions_sub_id_fkey"
            columns: ["sub_id"]
            isOneToOne: false
            referencedRelation: "subs"
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
      billing_job_rates: {
        Row: {
          created_at: string
          project_id: string
          rate: number | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          project_id: string
          rate?: number | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          project_id?: string
          rate?: number | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_job_rates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_profiles: {
        Row: {
          address: string
          bill_to: string
          business_name: string
          created_at: string
          next_invoice_number: number
          rate: number | null
          terms: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          address?: string
          bill_to?: string
          business_name?: string
          created_at?: string
          next_invoice_number?: number
          rate?: number | null
          terms?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          address?: string
          bill_to?: string
          business_name?: string
          created_at?: string
          next_invoice_number?: number
          rate?: number | null
          terms?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      calendar_entries: {
        Row: {
          all_day: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_at: string | null
          id: string
          kind: string
          location: string | null
          org_id: string
          project_id: string
          read_capability: string
          source_id: string | null
          source_type: string
          starts_at: string
          status: string | null
          title: string
          updated_at: string
          user_id: string | null
          version: number
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          kind: string
          location?: string | null
          org_id: string
          project_id: string
          read_capability?: string
          source_id?: string | null
          source_type?: string
          starts_at: string
          status?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Update: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          location?: string | null
          org_id?: string
          project_id?: string
          read_capability?: string
          source_id?: string | null
          source_type?: string
          starts_at?: string
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "calendar_entries_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      calendar_feed_tokens: {
        Row: {
          created_at: string
          last_used_at: string | null
          rotated_at: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_used_at?: string | null
          rotated_at?: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_used_at?: string | null
          rotated_at?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      comment_edits: {
        Row: {
          body: string
          comment_id: string
          id: string
          org_id: string
          project_id: string
          replaced_at: string
          replaced_by: string | null
          version: number
          written_at: string
        }
        Insert: {
          body: string
          comment_id: string
          id?: string
          org_id: string
          project_id: string
          replaced_at?: string
          replaced_by?: string | null
          version: number
          written_at: string
        }
        Update: {
          body?: string
          comment_id?: string
          id?: string
          org_id?: string
          project_id?: string
          replaced_at?: string
          replaced_by?: string | null
          version?: number
          written_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_edits_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_edits_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          edited_at: string | null
          entity_id: string
          entity_type: string
          id: string
          org_id: string
          project_id: string
          request_key: string | null
          seq: number
          updated_at: string
          version: number
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          edited_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          org_id: string
          project_id: string
          request_key?: string | null
          seq?: never
          updated_at?: string
          version?: number
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          org_id?: string
          project_id?: string
          request_key?: string | null
          seq?: never
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "comments_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      correction_history: {
        Row: {
          action: string
          actor_user_id: string | null
          correction_id: string
          created_at: string
          from_status: string | null
          id: string
          note: string
          org_id: string
          photo_ids: string[]
          prev_closed_at: string | null
          project_id: string
          seq: number
          to_status: string | null
          undoes: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          correction_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string
          org_id: string
          photo_ids?: string[]
          prev_closed_at?: string | null
          project_id: string
          seq?: never
          to_status?: string | null
          undoes?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          correction_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string
          org_id?: string
          photo_ids?: string[]
          prev_closed_at?: string | null
          project_id?: string
          seq?: never
          to_status?: string | null
          undoes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "correction_history_correction_id_fkey"
            columns: ["correction_id"]
            isOneToOne: false
            referencedRelation: "corrections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_history_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "correction_history_undoes_fkey"
            columns: ["undoes"]
            isOneToOne: false
            referencedRelation: "correction_history"
            referencedColumns: ["id"]
          },
        ]
      }
      corrections: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string
          id: string
          location: string
          notice_file_id: string | null
          notice_ref: string
          number: number
          org_id: string
          photo_ids: string[]
          project_id: string
          request_key: string
          spec_tags: string[]
          status: string
          status_changed_at: string
          title: string
          trade: string
          updated_at: string
          version: number
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string
          id?: string
          location?: string
          notice_file_id?: string | null
          notice_ref?: string
          number: number
          org_id: string
          photo_ids?: string[]
          project_id: string
          request_key: string
          spec_tags?: string[]
          status?: string
          status_changed_at?: string
          title: string
          trade?: string
          updated_at?: string
          version?: number
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string
          id?: string
          location?: string
          notice_file_id?: string | null
          notice_ref?: string
          number?: number
          org_id?: string
          photo_ids?: string[]
          project_id?: string
          request_key?: string
          spec_tags?: string[]
          status?: string
          status_changed_at?: string
          title?: string
          trade?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "corrections_notice_file_id_fkey"
            columns: ["notice_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      csi_divisions: {
        Row: {
          number: string
          reserved: boolean
          title: string
        }
        Insert: {
          number: string
          reserved?: boolean
          title: string
        }
        Update: {
          number?: string
          reserved?: boolean
          title?: string
        }
        Relationships: []
      }
      csi_sections: {
        Row: {
          division: string
          level: number
          number: string
          title: string
        }
        Insert: {
          division: string
          level: number
          number: string
          title: string
        }
        Update: {
          division?: string
          level?: number
          number?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "csi_sections_division_fkey"
            columns: ["division"]
            isOneToOne: false
            referencedRelation: "csi_divisions"
            referencedColumns: ["number"]
          },
        ]
      }
      daily_author_folders: {
        Row: {
          author_id: string
          folder_id: string
          kind: string
          project_id: string
        }
        Insert: {
          author_id: string
          folder_id: string
          kind: string
          project_id: string
        }
        Update: {
          author_id?: string
          folder_id?: string
          kind?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_author_folders_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_author_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_photos: {
        Row: {
          caption: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          file_id: string
          id: string
          org_id: string
          project_id: string
          report_id: string
          row_key: string | null
          taken_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          caption?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          file_id: string
          id?: string
          org_id: string
          project_id: string
          report_id: string
          row_key?: string | null
          taken_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          caption?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          file_id?: string
          id?: string
          org_id?: string
          project_id?: string
          report_id?: string
          row_key?: string | null
          taken_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_photos_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_report_photos_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "daily_report_photos_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          author_id: string
          content: Json
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          filename: string | null
          header: Json
          hours: number | null
          id: string
          number: number | null
          org_id: string
          pdf_file_id: string | null
          project_id: string
          report_date: string
          report_type: string
          sign_pending_at: string | null
          sign_pending_hash: string | null
          signed_at: string | null
          signed_by: string | null
          signed_version: number | null
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          author_id: string
          content?: Json
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          filename?: string | null
          header?: Json
          hours?: number | null
          id?: string
          number?: number | null
          org_id: string
          pdf_file_id?: string | null
          project_id: string
          report_date: string
          report_type: string
          sign_pending_at?: string | null
          sign_pending_hash?: string | null
          signed_at?: string | null
          signed_by?: string | null
          signed_version?: number | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          author_id?: string
          content?: Json
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          filename?: string | null
          header?: Json
          hours?: number | null
          id?: string
          number?: number | null
          org_id?: string
          pdf_file_id?: string | null
          project_id?: string
          report_date?: string
          report_type?: string
          sign_pending_at?: string | null
          sign_pending_hash?: string | null
          signed_at?: string | null
          signed_by?: string | null
          signed_version?: number | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_pdf_file_id_fkey"
            columns: ["pdf_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      daily_setups: {
        Row: {
          author_id: string
          chosen_at: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          project_id: string
          report_type: string
          settings: Json
          updated_at: string
          version: number
        }
        Insert: {
          author_id: string
          chosen_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          project_id: string
          report_type: string
          settings?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          author_id?: string
          chosen_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          project_id?: string
          report_type?: string
          settings?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_setups_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
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
      deliveries: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_name: string | null
          delivery_date: string
          description: string
          duration_min: number
          file_ids: string[]
          id: string
          number: number
          org_id: string
          posted_name: string
          project_id: string
          standby: boolean
          starts_at: string | null
          updated_at: string
          version: number
          via_link: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_name?: string | null
          delivery_date: string
          description: string
          duration_min?: number
          file_ids?: string[]
          id?: string
          number: number
          org_id: string
          posted_name: string
          project_id: string
          standby?: boolean
          starts_at?: string | null
          updated_at?: string
          version?: number
          via_link?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_name?: string | null
          delivery_date?: string
          description?: string
          duration_min?: number
          file_ids?: string[]
          id?: string
          number?: number
          org_id?: string
          posted_name?: string
          project_id?: string
          standby?: boolean
          starts_at?: string | null
          updated_at?: string
          version?: number
          via_link?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_company_id_project_id_fkey"
            columns: ["company_id", "project_id"]
            isOneToOne: false
            referencedRelation: "delivery_companies"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "deliveries_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      delivery_companies: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string
          project_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          project_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          project_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_companies_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      delivery_link_log: {
        Row: {
          id: string
          new_hash: string
          old_hash: string | null
          project_id: string
          rotated_at: string
          rotated_by: string
          undone_at: string | null
        }
        Insert: {
          id?: string
          new_hash: string
          old_hash?: string | null
          project_id: string
          rotated_at?: string
          rotated_by: string
          undone_at?: string | null
        }
        Update: {
          id?: string
          new_hash?: string
          old_hash?: string | null
          project_id?: string
          rotated_at?: string
          rotated_by?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_link_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_reviews: {
        Row: {
          company: string
          created_at: string
          created_by: string
          id: string
          month: string
          name: string
          org_id: string
          project_id: string
        }
        Insert: {
          company?: string
          created_at?: string
          created_by: string
          id?: string
          month: string
          name: string
          org_id: string
          project_id: string
        }
        Update: {
          company?: string
          created_at?: string
          created_by?: string
          id?: string
          month?: string
          name?: string
          org_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_reviews_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
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
          scan_skipped_at: string | null
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
          scan_skipped_at?: string | null
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
          scan_skipped_at?: string | null
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
      folder_templates: {
        Row: {
          access_capability: string | null
          ai_reads: boolean
          applies_to: string
          company_kind: string
          created_at: string
          folder_kind: string
          id: string
          name: string
          sort: number
        }
        Insert: {
          access_capability?: string | null
          ai_reads?: boolean
          applies_to?: string
          company_kind: string
          created_at?: string
          folder_kind: string
          id?: string
          name: string
          sort: number
        }
        Update: {
          access_capability?: string | null
          ai_reads?: boolean
          applies_to?: string
          company_kind?: string
          created_at?: string
          folder_kind?: string
          id?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      folders: {
        Row: {
          ai_reads: boolean
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
          sort: number
          updated_at: string
          version: number
          view_only: boolean
        }
        Insert: {
          ai_reads?: boolean
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
          sort?: number
          updated_at?: string
          version?: number
          view_only?: boolean
        }
        Update: {
          ai_reads?: boolean
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
          sort?: number
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
      inspection_requests: {
        Row: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        Insert: {
          attachment_ids?: string[]
          attendance?: string | null
          company: string
          confirm_note?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_kind?: string
          duration_min?: number | null
          gc_at?: string | null
          gc_by?: string | null
          gc_note?: string | null
          helper_at?: string | null
          helper_id?: string | null
          helper_note?: string | null
          helper_report?: string | null
          id?: string
          ir_file_id?: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id?: string | null
          pdf_postponed?: boolean
          pdf_stale?: boolean
          permit_id?: string | null
          postpone_count?: number
          postpone_note?: string | null
          postpone_reason?: string | null
          postpone_until?: string | null
          postponed_at?: string | null
          project_id: string
          request_date: string
          requested_by?: string | null
          requester_email?: string | null
          requester_name?: string | null
          requester_phone?: string | null
          result?: string | null
          result_at?: string | null
          result_by?: string | null
          result_note?: string | null
          result_photo_ids?: string[]
          results_sent_at?: string | null
          signed_at?: string | null
          signed_by?: string | null
          special_kind_id?: string | null
          start_time?: string | null
          status: string
          summary?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          attachment_ids?: string[]
          attendance?: string | null
          company?: string
          confirm_note?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_kind?: string
          duration_min?: number | null
          gc_at?: string | null
          gc_by?: string | null
          gc_note?: string | null
          helper_at?: string | null
          helper_id?: string | null
          helper_note?: string | null
          helper_report?: string | null
          id?: string
          ir_file_id?: string | null
          items?: string
          kind?: string
          notice_ack_at?: string
          number?: number
          org_id?: string
          owner_id?: string | null
          pdf_postponed?: boolean
          pdf_stale?: boolean
          permit_id?: string | null
          postpone_count?: number
          postpone_note?: string | null
          postpone_reason?: string | null
          postpone_until?: string | null
          postponed_at?: string | null
          project_id?: string
          request_date?: string
          requested_by?: string | null
          requester_email?: string | null
          requester_name?: string | null
          requester_phone?: string | null
          result?: string | null
          result_at?: string | null
          result_by?: string | null
          result_note?: string | null
          result_photo_ids?: string[]
          results_sent_at?: string | null
          signed_at?: string | null
          signed_by?: string | null
          special_kind_id?: string | null
          start_time?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inspection_requests_ir_file_id_fkey"
            columns: ["ir_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_requests_permit_id_project_id_fkey"
            columns: ["permit_id", "project_id"]
            isOneToOne: false
            referencedRelation: "permits"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "inspection_requests_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "inspection_requests_special_kind_id_fkey"
            columns: ["special_kind_id"]
            isOneToOne: false
            referencedRelation: "ir_special_kinds"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          bill_to: string
          created_at: string
          created_by: string | null
          from_address: string
          from_name: string
          id: string
          issued_on: string
          lines: Json
          number: number
          paid_at: string | null
          period: string
          sent_at: string | null
          status: string
          terms: string
          total_amount: number
          total_hours: number
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          bill_to: string
          created_at?: string
          created_by?: string | null
          from_address: string
          from_name: string
          id?: string
          issued_on: string
          lines: Json
          number: number
          paid_at?: string | null
          period: string
          sent_at?: string | null
          status?: string
          terms: string
          total_amount: number
          total_hours: number
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          bill_to?: string
          created_at?: string
          created_by?: string | null
          from_address?: string
          from_name?: string
          id?: string
          issued_on?: string
          lines?: Json
          number?: number
          paid_at?: string | null
          period?: string
          sent_at?: string | null
          status?: string
          terms?: string
          total_amount?: number
          total_hours?: number
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      ir_blocks: {
        Row: {
          block_date: string
          created_at: string
          created_by: string
          deleted_at: string | null
          end_time: string | null
          id: string
          org_id: string
          project_id: string
          repeat_until: string | null
          repeat_weekly: boolean
          start_time: string | null
          updated_at: string
          version: number
        }
        Insert: {
          block_date: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          end_time?: string | null
          id?: string
          org_id: string
          project_id: string
          repeat_until?: string | null
          repeat_weekly?: boolean
          start_time?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          block_date?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          end_time?: string | null
          id?: string
          org_id?: string
          project_id?: string
          repeat_until?: string | null
          repeat_weekly?: boolean
          start_time?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ir_blocks_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      ir_events: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          id: number
          org_id: string
          project_id: string
          request_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: never
          org_id: string
          project_id: string
          request_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: never
          org_id?: string
          project_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ir_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "inspection_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ir_link_receipts: {
        Row: {
          created_at: string
          request_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          request_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          request_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "ir_link_receipts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "inspection_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ir_special_kinds: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      job_hours_budgets: {
        Row: {
          baseline_hours: number
          baseline_through: string | null
          contract_hours: number
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          project_id: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          baseline_hours?: number
          baseline_through?: string | null
          contract_hours: number
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          project_id: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          baseline_hours?: number
          baseline_through?: string | null
          contract_hours?: number
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          project_id?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_hours_budgets_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
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
      org_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          id: string
          invite_email: string
          org_id: string
          org_role: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invite_email: string
          org_id: string
          org_role: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invite_email?: string
          org_id?: string
          org_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
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
          logo_path: string | null
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
          logo_path?: string | null
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
          logo_path?: string | null
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
      permit_approved_sets: {
        Row: {
          content_hash: string
          created_at: string
          id: string
          note: string | null
          org_id: string
          permit_id: string
          permit_number: string | null
          position: number
          project_id: string
          set_no: number
          source_file_id: string
          source_sha256: string | null
          stamped_at: string
          stamped_by: string
          stamped_file_id: string
          stamped_sha256: string | null
          superseded_at: string | null
          superseded_by: number | null
        }
        Insert: {
          content_hash: string
          created_at?: string
          id?: string
          note?: string | null
          org_id: string
          permit_id: string
          permit_number?: string | null
          position: number
          project_id: string
          set_no: number
          source_file_id: string
          source_sha256?: string | null
          stamped_at: string
          stamped_by: string
          stamped_file_id: string
          stamped_sha256?: string | null
          superseded_at?: string | null
          superseded_by?: number | null
        }
        Update: {
          content_hash?: string
          created_at?: string
          id?: string
          note?: string | null
          org_id?: string
          permit_id?: string
          permit_number?: string | null
          position?: number
          project_id?: string
          set_no?: number
          source_file_id?: string
          source_sha256?: string | null
          stamped_at?: string
          stamped_by?: string
          stamped_file_id?: string
          stamped_sha256?: string | null
          superseded_at?: string | null
          superseded_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "permit_approved_sets_permit_id_project_id_fkey"
            columns: ["permit_id", "project_id"]
            isOneToOne: false
            referencedRelation: "permits"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "permit_approved_sets_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "permit_approved_sets_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_approved_sets_stamped_file_id_fkey"
            columns: ["stamped_file_id"]
            isOneToOne: true
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_comments: {
        Row: {
          body: string
          closed_at: string | null
          closed_by: string | null
          closed_cycle: number | null
          code_ref: string
          created_at: string
          created_by: string
          detail: string
          earlier_answers: Json
          id: string
          number: number
          org_id: string
          permit_id: string
          project_id: string
          request_key: string | null
          responded_at: string | null
          responded_by: string | null
          response: string | null
          review_id: string
          sheet: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          closed_at?: string | null
          closed_by?: string | null
          closed_cycle?: number | null
          code_ref?: string
          created_at?: string
          created_by: string
          detail?: string
          earlier_answers?: Json
          id?: string
          number: number
          org_id: string
          permit_id: string
          project_id: string
          request_key?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          review_id: string
          sheet?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string
          closed_at?: string | null
          closed_by?: string | null
          closed_cycle?: number | null
          code_ref?: string
          created_at?: string
          created_by?: string
          detail?: string
          earlier_answers?: Json
          id?: string
          number?: number
          org_id?: string
          permit_id?: string
          project_id?: string
          request_key?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          review_id?: string
          sheet?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "permit_comments_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_comments_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "permit_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_reviews: {
        Row: {
          created_at: string
          created_by: string
          cycle: number
          id: string
          kind: string
          org_id: string
          outcome: string | null
          permit_id: string
          project_id: string
          received_on: string
          request_key: string | null
          returned_on: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          cycle: number
          id?: string
          kind: string
          org_id: string
          outcome?: string | null
          permit_id: string
          project_id: string
          received_on: string
          request_key?: string | null
          returned_on?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          cycle?: number
          id?: string
          kind?: string
          org_id?: string
          outcome?: string | null
          permit_id?: string
          project_id?: string
          received_on?: string
          request_key?: string | null
          returned_on?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "permit_reviews_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "permits"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_stage_events: {
        Row: {
          actor: string | null
          at: string
          id: number
          note: string | null
          org_id: string
          permit_id: string
          prior: Json
          project_id: string
          stage: string
          undone_at: string | null
          undone_by: string | null
        }
        Insert: {
          actor?: string | null
          at?: string
          id?: never
          note?: string | null
          org_id: string
          permit_id: string
          prior?: Json
          project_id: string
          stage: string
          undone_at?: string | null
          undone_by?: string | null
        }
        Update: {
          actor?: string | null
          at?: string
          id?: never
          note?: string | null
          org_id?: string
          permit_id?: string
          prior?: Json
          project_id?: string
          stage?: string
          undone_at?: string | null
          undone_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permit_stage_events_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "permits"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_stamped_copies: {
        Row: {
          content_hash: string
          created_at: string
          permit_id: string
          permit_number: string
          source_file_id: string
          source_sha256: string
          stamped_at: string
          stamped_by: string
          stamped_file_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          permit_id: string
          permit_number: string
          source_file_id: string
          source_sha256: string
          stamped_at: string
          stamped_by: string
          stamped_file_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          permit_id?: string
          permit_number?: string
          source_file_id?: string
          source_sha256?: string
          stamped_at?: string
          stamped_by?: string
          stamped_file_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_stamped_copies_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_stamped_copies_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_stamped_copies_stamped_file_id_fkey"
            columns: ["stamped_file_id"]
            isOneToOne: true
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      permits: {
        Row: {
          agency_numbers: string[]
          approved_folder_id: string | null
          assigned_to: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          expires_on: string | null
          extensions: number
          id: string
          issued_on: string | null
          kind: string
          notes: string
          org_id: string
          primary_number: string
          project_id: string
          request_key: string | null
          stage: string
          stage_since: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          agency_numbers?: string[]
          approved_folder_id?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          expires_on?: string | null
          extensions?: number
          id?: string
          issued_on?: string | null
          kind?: string
          notes?: string
          org_id: string
          primary_number: string
          project_id: string
          request_key?: string | null
          stage?: string
          stage_since?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          agency_numbers?: string[]
          approved_folder_id?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          expires_on?: string | null
          extensions?: number
          id?: string
          issued_on?: string | null
          kind?: string
          notes?: string
          org_id?: string
          primary_number?: string
          project_id?: string
          request_key?: string | null
          stage?: string
          stage_since?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "permits_approved_folder_id_fkey"
            columns: ["approved_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permits_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
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
          is_dsa: boolean
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
          is_dsa?: boolean
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
          is_dsa?: boolean
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
      request_hubs: {
        Row: {
          created_at: string
          id: string
          rotated_at: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rotated_at?: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rotated_at?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      request_link_log: {
        Row: {
          id: string
          new_hash: string
          old_hash: string | null
          project_id: string
          rotated_at: string
          rotated_by: string
          undone_at: string | null
        }
        Insert: {
          id?: string
          new_hash: string
          old_hash?: string | null
          project_id: string
          rotated_at?: string
          rotated_by: string
          undone_at?: string | null
        }
        Update: {
          id?: string
          new_hash?: string
          old_hash?: string | null
          project_id?: string
          rotated_at?: string
          rotated_by?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_link_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rfi_events: {
        Row: {
          actor: string | null
          at: string
          id: number
          kind: string
          note: string | null
          org_id: string
          project_id: string
          rfi_id: string
          step: number | null
        }
        Insert: {
          actor?: string | null
          at?: string
          id?: never
          kind: string
          note?: string | null
          org_id: string
          project_id: string
          rfi_id: string
          step?: number | null
        }
        Update: {
          actor?: string | null
          at?: string
          id?: never
          kind?: string
          note?: string | null
          org_id?: string
          project_id?: string
          rfi_id?: string
          step?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rfi_events_rfi_id_fkey"
            columns: ["rfi_id"]
            isOneToOne: false
            referencedRelation: "rfis"
            referencedColumns: ["id"]
          },
        ]
      }
      rfi_route_steps: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          position: number
          project_id: string
          role: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          position: number
          project_id: string
          role?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          position?: number
          project_id?: string
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfi_route_steps_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "rfi_route_steps_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      rfi_settings: {
        Row: {
          answer_days: number
          impact_days: number
          org_id: string
          project_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          answer_days?: number
          impact_days?: number
          org_id: string
          project_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          answer_days?: number
          impact_days?: number
          org_id?: string
          project_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rfi_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfi_settings_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      rfi_steps: {
        Row: {
          label: string
          position: number
          rfi_id: string
          role: string | null
          user_id: string | null
        }
        Insert: {
          label: string
          position: number
          rfi_id: string
          role?: string | null
          user_id?: string | null
        }
        Update: {
          label?: string
          position?: number
          rfi_id?: string
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfi_steps_rfi_id_fkey"
            columns: ["rfi_id"]
            isOneToOne: false
            referencedRelation: "rfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfi_steps_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      rfis: {
        Row: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        Insert: {
          answer?: string | null
          answer_file_ids?: string[]
          answered_at?: string | null
          answered_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          cost_impact?: boolean | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          due_at?: string | null
          held_opened_at?: string | null
          held_since?: string
          id?: string
          impact_claimed_at?: string | null
          impact_cost?: boolean | null
          impact_gc_note?: string | null
          impact_note?: string | null
          impact_time?: boolean | null
          impact_until?: string | null
          issued_at?: string | null
          issued_by?: string | null
          issued_hash?: string | null
          needed_by?: string | null
          number?: number | null
          org_id: string
          pdf_file_id?: string | null
          pdf_hash?: string | null
          photo_ids?: string[]
          project_id: string
          question: string
          refs?: string
          request_key?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_hash?: string | null
          status?: string
          step?: number
          suggestion?: string
          time_impact?: boolean | null
          title: string
          updated_at?: string
          version?: number
          void_note?: string | null
        }
        Update: {
          answer?: string | null
          answer_file_ids?: string[]
          answered_at?: string | null
          answered_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          cost_impact?: boolean | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          due_at?: string | null
          held_opened_at?: string | null
          held_since?: string
          id?: string
          impact_claimed_at?: string | null
          impact_cost?: boolean | null
          impact_gc_note?: string | null
          impact_note?: string | null
          impact_time?: boolean | null
          impact_until?: string | null
          issued_at?: string | null
          issued_by?: string | null
          issued_hash?: string | null
          needed_by?: string | null
          number?: number | null
          org_id?: string
          pdf_file_id?: string | null
          pdf_hash?: string | null
          photo_ids?: string[]
          project_id?: string
          question?: string
          refs?: string
          request_key?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_hash?: string | null
          status?: string
          step?: number
          suggestion?: string
          time_impact?: boolean | null
          title?: string
          updated_at?: string
          version?: number
          void_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfis_pdf_file_id_fkey"
            columns: ["pdf_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfis_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
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
          recommended_tools: string[]
        }
        Insert: {
          description?: string
          name: string
          recommended_tools?: string[]
        }
        Update: {
          description?: string
          name?: string
          recommended_tools?: string[]
        }
        Relationships: []
      }
      security_switches: {
        Row: {
          enabled: boolean
          key: string
          note: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          note?: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          note?: string
          updated_at?: string
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
      signin_keys: {
        Row: {
          created_at: string
          email: string
          id: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
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
          certifications: string | null
          city: string | null
          company: string
          contacts: Json
          created_at: string
          created_by: string | null
          cslb_checked_at: string | null
          cslb_number: string | null
          cslb_status: string | null
          deleted_at: string | null
          dir_number: string | null
          extra: Json
          id: string
          license_classes: string | null
          notes: string
          org_id: string
          region: string | null
          trades: string[]
          updated_at: string
          version: number
          zip: string | null
        }
        Insert: {
          certifications?: string | null
          city?: string | null
          company: string
          contacts?: Json
          created_at?: string
          created_by?: string | null
          cslb_checked_at?: string | null
          cslb_number?: string | null
          cslb_status?: string | null
          deleted_at?: string | null
          dir_number?: string | null
          extra?: Json
          id?: string
          license_classes?: string | null
          notes?: string
          org_id: string
          region?: string | null
          trades?: string[]
          updated_at?: string
          version?: number
          zip?: string | null
        }
        Update: {
          certifications?: string | null
          city?: string | null
          company?: string
          contacts?: Json
          created_at?: string
          created_by?: string | null
          cslb_checked_at?: string | null
          cslb_number?: string | null
          cslb_status?: string | null
          deleted_at?: string | null
          dir_number?: string | null
          extra?: Json
          id?: string
          license_classes?: string | null
          notes?: string
          org_id?: string
          region?: string | null
          trades?: string[]
          updated_at?: string
          version?: number
          zip?: string | null
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
      testing_role_home: {
        Row: {
          created_at: string
          project_id: string
          real_role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          real_role: string
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          real_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "testing_role_home_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testing_role_home_real_role_fkey"
            columns: ["real_role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      testing_superusers: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_job_rail: {
        Row: {
          created_at: string
          project_id: string
          tools: string[] | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          project_id: string
          tools?: string[] | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          project_id?: string
          tools?: string[] | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_job_rail_project_id_fkey"
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
          rail_items: string[] | null
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
          rail_items?: string[] | null
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
          rail_items?: string[] | null
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
      add_comment: {
        Args: {
          p_body: string
          p_entity_id: string
          p_entity_type: string
          p_key?: string
          p_project_id: string
        }
        Returns: {
          author_id: string
          body: string
          created_at: string
          edited_at: string | null
          entity_id: string
          entity_type: string
          id: string
          org_id: string
          project_id: string
          request_key: string | null
          seq: number
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_daily_photo: {
        Args: {
          p_caption: string
          p_file_id: string
          p_report_id: string
          p_row_key: string
          p_taken_at: string
        }
        Returns: {
          caption: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          file_id: string
          id: string
          org_id: string
          project_id: string
          report_id: string
          row_key: string | null
          taken_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "daily_report_photos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_template_folders: {
        Args: {
          p_applies: string[]
          p_created_by: string
          p_project_id: string
        }
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
      attach_delivery_file: {
        Args: { p_delivery_id: string; p_file_id: string }
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
      authorize_ir_file: {
        Args: { p_file_id: string; p_request_id: string }
        Returns: {
          mime: string
          original_name: string
          storage_path: string
        }[]
      }
      authorize_preview: {
        Args: { p_file_id: string; p_request_id?: string; p_rfi_id?: string }
        Returns: {
          mime: string
          original_name: string
          storage_path: string
        }[]
      }
      begin_daily_submit: {
        Args: {
          p_content_hash: string
          p_photos_stamp: string
          p_report_id: string
          p_version: number
        }
        Returns: {
          author_id: string
          content: Json
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          filename: string | null
          header: Json
          hours: number | null
          id: string
          number: number | null
          org_id: string
          pdf_file_id: string | null
          project_id: string
          report_date: string
          report_type: string
          sign_pending_at: string | null
          sign_pending_hash: string | null
          signed_at: string | null
          signed_by: string | null
          signed_version: number | null
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "daily_reports"
          isOneToOne: true
          isSetofReturn: false
        }
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
      bid_flags: {
        Args: { p_project_id: string }
        Returns: {
          detail: string
          kind: string
          package_id: string
          submission_id: string
        }[]
      }
      bid_leveling_board: {
        Args: { p_project_id: string }
        Returns: {
          base_amount: number
          base_evidence: string
          base_page: number
          bid_date: string
          bidder: string
          bidder_key: string
          comparable: boolean
          document_kind: string
          exclusions: string[]
          extraction_status: string
          file_id: string
          is_backup: boolean
          is_duplicate: boolean
          is_late: boolean
          leveling_version: number
          notes: string
          original_package_id: string
          package_code: string
          package_id: string
          prevailing_wage: string
          project_match: string
          pw_adder_amount: number
          receipt_number: number
          received_at: string
          replaced_by: string
          state: string
          submission_id: string
          valid_until: string
          validity_days: number
        }[]
      }
      bid_pipeline: {
        Args: never
        Returns: {
          bid_due_at: string
          bids_in: number
          invited: number
          name: string
          number: string
          open_questions: number
          org_name: string
          packages: number
          packages_covered: number
          project_id: string
          stage: string
          timezone: string
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
      board_line_readable: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_kind: string
          p_project_id: string
        }
        Returns: boolean
      }
      calendar_feed_lines: {
        Args: { p_token_hash: string }
        Returns: {
          all_day: boolean
          ends_at: string
          id: string
          kind: string
          location: string
          project_id: string
          project_name: string
          starts_at: string
          status: string
          timezone: string
          title: string
          updated_at: string
        }[]
      }
      calendar_inspections: {
        Args: { p_from: string; p_project_id: string; p_to: string }
        Returns: {
          attachment_ids: string[]
          attendance: string
          company: string
          duration_kind: string
          duration_min: number
          full_detail: boolean
          helper_id: string
          id: string
          is_block: boolean
          items: string
          kind: string
          mine: boolean
          number: number
          owner_id: string
          postpone_count: number
          postpone_reason: string
          postpone_until: string
          request_date: string
          result: string
          special_kind: string
          start_time: string
          status: string
          status_key: string
          version: number
        }[]
      }
      calendar_mirror: {
        Args: {
          p_all_day?: boolean
          p_ends_at?: string
          p_kind: string
          p_location?: string
          p_project_id: string
          p_read_capability?: string
          p_source_id: string
          p_source_type: string
          p_starts_at: string
          p_status?: string
          p_title: string
          p_visible_to?: string
        }
        Returns: string
      }
      calendar_unmirror: {
        Args: { p_source_id: string; p_source_type: string }
        Returns: undefined
      }
      can_manage_subs: { Args: { p_org_id: string }; Returns: boolean }
      choose_daily_form: {
        Args: {
          p_project_id: string
          p_report_type: string
          p_settings_if_new: Json
        }
        Returns: {
          author_id: string
          chosen_at: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          project_id: string
          report_type: string
          settings: Json
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "daily_setups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      comment_check_body: { Args: { p_body: string }; Returns: string }
      comment_list: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_project_id: string
        }
        Returns: Json
      }
      comment_readable: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_project_id: string
        }
        Returns: boolean
      }
      comment_target_readable: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_project_id: string
        }
        Returns: boolean
      }
      comment_tell: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_kind: string
          p_project_id: string
          p_what: string
        }
        Returns: undefined
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
      correction_files_ok: {
        Args: { p_ids: string[]; p_images_only: boolean; p_project_id: string }
        Returns: boolean
      }
      correction_label: { Args: { p_number: number }; Returns: string }
      correction_may_see: { Args: { p_project_id: string }; Returns: boolean }
      correction_photo_folder: {
        Args: { p_project_id: string }
        Returns: string
      }
      correction_reinspect_tasks_for: {
        Args: { p_correction_id: string }
        Returns: undefined
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
      create_correction: {
        Args: {
          p_description?: string
          p_location?: string
          p_notice_file_id?: string
          p_notice_ref?: string
          p_photo_ids?: string[]
          p_project_id: string
          p_request_key: string
          p_spec_tags?: string[]
          p_title: string
          p_trade?: string
        }
        Returns: {
          closed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string
          id: string
          location: string
          notice_file_id: string | null
          notice_ref: string
          number: number
          org_id: string
          photo_ids: string[]
          project_id: string
          request_key: string
          spec_tags: string[]
          status: string
          status_changed_at: string
          title: string
          trade: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_daily_report: {
        Args: {
          p_project_id: string
          p_report_date: string
          p_report_type: string
        }
        Returns: string
      }
      create_invoice: {
        Args: { p_period: string }
        Returns: {
          bill_to: string
          created_at: string
          created_by: string | null
          from_address: string
          from_name: string
          id: string
          issued_on: string
          lines: Json
          number: number
          paid_at: string | null
          period: string
          sent_at: string | null
          status: string
          terms: string
          total_amount: number
          total_hours: number
          updated_at: string
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_org: { Args: { p_kind: string; p_name: string }; Returns: string }
      create_project: {
        Args: {
          p_address?: string
          p_bid_due_at?: string
          p_is_dsa?: boolean
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
      daily_author_folder: {
        Args: { p_author: string; p_kind: string; p_project_id: string }
        Returns: string
      }
      daily_carryover: { Args: { p_prev: Json }; Returns: Json }
      daily_ensure_at: {
        Args: {
          p_at: string
          p_project_id: string
          p_report_type: string
          p_settings_if_new: Json
        }
        Returns: string
      }
      daily_is_scheduled: {
        Args: { p_day: string; p_settings: Json }
        Returns: boolean
      }
      daily_local_date: {
        Args: { p_at: string; p_tz: string }
        Returns: string
      }
      daily_make_report: {
        Args: {
          p_day: string
          p_setup: Database["public"]["Tables"]["daily_setups"]["Row"]
        }
        Returns: string
      }
      daily_may_see: {
        Args: { p_author_id: string; p_project_id: string; p_status: string }
        Returns: boolean
      }
      daily_note_ir: { Args: { p_request_id: string }; Returns: undefined }
      daily_own_report: {
        Args: { p_report_id: string }
        Returns: {
          author_id: string
          content: Json
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          filename: string | null
          header: Json
          hours: number | null
          id: string
          number: number | null
          org_id: string
          pdf_file_id: string | null
          project_id: string
          report_date: string
          report_type: string
          sign_pending_at: string | null
          sign_pending_hash: string | null
          signed_at: string | null
          signed_by: string | null
          signed_version: number | null
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "daily_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      daily_photo_folder: { Args: { p_project_id: string }; Returns: string }
      daily_reports_folder: { Args: { p_project_id: string }; Returns: string }
      daily_settings_ok: { Args: { p_settings: Json }; Returns: boolean }
      delete_daily_draft: {
        Args: { p_report_id: string; p_version: number }
        Returns: undefined
      }
      delete_delivery: {
        Args: { p_id: string; p_name: string; p_version: number }
        Returns: undefined
      }
      delivery_board_fields: {
        Args: {
          d: Database["public"]["Tables"]["deliveries"]["Row"]
          p_company: string
        }
        Returns: Json
      }
      delivery_clean: {
        Args: { p_max: number; p_text: string }
        Returns: string
      }
      delivery_company_id: {
        Args: { p_name: string; p_org_id: string; p_project_id: string }
        Returns: string
      }
      delivery_company_list: {
        Args: { p_project_id: string }
        Returns: {
          name: string
          uses: number
        }[]
      }
      delivery_company_options: {
        Args: { p_project_id: string }
        Returns: {
          name: string
          uses: number
        }[]
      }
      delivery_folder: { Args: { p_project_id: string }; Returns: string }
      delivery_history: {
        Args: { p_delivery_id: string }
        Returns: {
          action: string
          actor_name: string
          at: string
          details: Json
        }[]
      }
      delivery_insert: {
        Args: {
          p_company: string
          p_date: string
          p_description: string
          p_duration: number
          p_posted_name: string
          p_project_id: string
          p_time: string
          p_via_link: boolean
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_name: string | null
          delivery_date: string
          description: string
          duration_min: number
          file_ids: string[]
          id: string
          number: number
          org_id: string
          posted_name: string
          project_id: string
          standby: boolean
          starts_at: string | null
          updated_at: string
          version: number
          via_link: boolean
        }
        SetofOptions: {
          from: "*"
          to: "deliveries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delivery_link_project: {
        Args: { p_project_id: string; p_token_hash: string }
        Returns: {
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
          is_dsa: boolean
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
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delivery_link_state: {
        Args: { p_project_id: string }
        Returns: {
          active: boolean
          since: string
        }[]
      }
      delivery_may_change: {
        Args: { p_created_by: string; p_project_id: string }
        Returns: boolean
      }
      delivery_may_see: { Args: { p_project_id: string }; Returns: boolean }
      delivery_overlaps: {
        Args: {
          p_duration: number
          p_exclude: string
          p_project_id: string
          p_starts_at: string
        }
        Returns: boolean
      }
      edit_comment: {
        Args: { p_body: string; p_comment_id: string; p_version: number }
        Returns: {
          author_id: string
          body: string
          created_at: string
          edited_at: string | null
          entity_id: string
          entity_type: string
          id: string
          org_id: string
          project_id: string
          request_key: string | null
          seq: number
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "comments"
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
      ensure_todays_draft: {
        Args: {
          p_project_id: string
          p_report_type: string
          p_settings_if_new?: Json
        }
        Returns: string
      }
      file_may_see: {
        Args: {
          p_created_by: string
          p_folder_id: string
          p_project_id: string
        }
        Returns: boolean
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
      finish_daily_submit: {
        Args: {
          p_content_hash: string
          p_file_id: string
          p_filename: string
          p_report_id: string
          p_version: number
        }
        Returns: {
          author_id: string
          content: Json
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          filename: string | null
          header: Json
          hours: number | null
          id: string
          number: number | null
          org_id: string
          pdf_file_id: string | null
          project_id: string
          report_date: string
          report_type: string
          sign_pending_at: string | null
          sign_pending_hash: string | null
          signed_at: string | null
          signed_by: string | null
          signed_version: number | null
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "daily_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      folder_can_read: { Args: { p_folder_id: string }; Returns: boolean }
      folder_can_write: { Args: { p_folder_id: string }; Returns: boolean }
      folder_effective_id: { Args: { p_folder_id: string }; Returns: string }
      folder_name_reserved: {
        Args: { p_name: string; p_parent_id: string; p_project_id: string }
        Returns: boolean
      }
      folder_server_only: { Args: { p_folder_id: string }; Returns: boolean }
      has_capability: {
        Args: { p_cap: string; p_project_id: string }
        Returns: boolean
      }
      has_scope: {
        Args: { p_project_id: string; p_scope_id: string; p_scope_type: string }
        Returns: boolean
      }
      hours_amount_ok: {
        Args: { p_max: number; p_places: number; p_value: number }
        Returns: boolean
      }
      import_subs: {
        Args: { p_org_id: string; p_rows: Json }
        Returns: {
          added: number
          unchanged: number
          updated: number
        }[]
      }
      inspector_admin_backfill: { Args: never; Returns: number }
      invoice_lines: {
        Args: { p_owner: string; p_period: string }
        Returns: Json
      }
      invoice_snapshot: { Args: { p_period: string }; Returns: Json }
      ir_assign_helper: {
        Args: { p_helper_id?: string; p_request_id: string; p_version: number }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_attach_folder_id: { Args: { p_project_id: string }; Returns: string }
      ir_attach_pdf: {
        Args: {
          p_content_hash: string
          p_file_id: string
          p_postponed: boolean
          p_request_id: string
        }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_calendar: {
        Args: { p_from: string; p_project_id: string; p_to: string }
        Returns: {
          attendance: string
          company: string
          duration_kind: string
          duration_min: number
          full_detail: boolean
          helper_id: string
          id: string
          is_block: boolean
          items: string
          kind: string
          mine: boolean
          number: number
          owner_id: string
          postpone_reason: string
          postpone_until: string
          request_date: string
          result: string
          special_kind: string
          start_time: string
          status: string
          status_key: string
          version: number
        }[]
      }
      ir_calendar_rows: {
        Args: {
          p_decide: boolean
          p_from: string
          p_project_id: string
          p_team: boolean
          p_to: string
          p_viewer: string
        }
        Returns: {
          attendance: string
          company: string
          duration_kind: string
          duration_min: number
          full_detail: boolean
          helper_id: string
          id: string
          is_block: boolean
          items: string
          kind: string
          mine: boolean
          number: number
          owner_id: string
          postpone_reason: string
          postpone_until: string
          request_date: string
          result: string
          special_kind: string
          start_time: string
          status: string
          status_key: string
          version: number
        }[]
      }
      ir_claim: {
        Args: { p_request_id: string; p_version: number }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_confirm: {
        Args: { p_note?: string; p_request_id: string; p_version: number }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_decider: {
        Args: { p_request_id: string; p_version: number }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_delete_pdf: {
        Args: { p_request_id: string; p_version: number }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_first_status: { Args: { p_project_id: string }; Returns: string }
      ir_folder: {
        Args: { p_project_id: string; p_which: string }
        Returns: string
      }
      ir_folder_make: {
        Args: { p_project_id: string; p_which: string }
        Returns: string
      }
      ir_for_update: {
        Args: { p_request_id: string; p_version: number }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_form_context: { Args: { p_project_id: string }; Returns: Json }
      ir_gc_decide: {
        Args: {
          p_approve: boolean
          p_note?: string
          p_request_id: string
          p_version: number
        }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_helper_report: {
        Args: {
          p_note?: string
          p_report?: string
          p_request_id: string
          p_version: number
        }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_mark_sent: {
        Args: {
          p_recipient_ids?: string[]
          p_request_id: string
          p_transmittal_id: string
        }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_may_see: {
        Args: { p_project_id: string; p_requested_by: string }
        Returns: boolean
      }
      ir_member_decides: {
        Args: { p_member: string; p_project_id: string }
        Returns: boolean
      }
      ir_move: {
        Args: {
          p_duration_kind?: string
          p_duration_min?: number
          p_request_date: string
          p_request_id: string
          p_start_time?: string
          p_version: number
        }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_owner_ok: {
        Args: { p_owner: string; p_project_id: string }
        Returns: boolean
      }
      ir_postpone: {
        Args: {
          p_note?: string
          p_reason: string
          p_request_id: string
          p_until?: string
          p_version: number
        }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_recipients: {
        Args: { p_request_id: string }
        Returns: {
          company: string
          full_name: string
          member_id: string
          preselect: boolean
          role: string
          user_id: string
        }[]
      }
      ir_restore: {
        Args: { p_request_id: string; p_version: number }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_set_attendance: {
        Args: { p_attendance?: string; p_request_id: string; p_version: number }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_set_result: {
        Args: {
          p_note?: string
          p_photo_ids?: string[]
          p_request_id: string
          p_result?: string
          p_version: number
        }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_setting: {
        Args: { p_key: string; p_project_id: string }
        Returns: boolean
      }
      ir_sign: {
        Args: {
          p_content_hash: string
          p_request_id: string
          p_version: number
        }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_status_key: {
        Args: { p_helper: string; p_result: string; p_status: string }
        Returns: string
      }
      ir_submit: {
        Args: {
          p_attachment_ids?: string[]
          p_company: string
          p_duration_kind?: string
          p_duration_min?: number
          p_items: string
          p_kind: string
          p_notice_ack: boolean
          p_project_id: string
          p_request_date: string
          p_special_kind_id?: string
          p_start_time?: string
        }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_tell_inspector: {
        Args: {
          p_kind: string
          p_request: Database["public"]["Tables"]["inspection_requests"]["Row"]
          p_summary: string
        }
        Returns: undefined
      }
      ir_tell_requester: {
        Args: {
          p_kind: string
          p_request: Database["public"]["Tables"]["inspection_requests"]["Row"]
          p_summary: string
        }
        Returns: undefined
      }
      ir_type_label: {
        Args: { p_kind: string; p_special: string }
        Returns: string
      }
      ir_unconfirm: {
        Args: { p_request_id: string; p_version: number }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ir_when_label: {
        Args: { p_date: string; p_time: string }
        Returns: string
      }
      ir_withdraw: {
        Args: { p_request_id: string; p_version: number }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
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
      job_rail_ok: { Args: { p_tools: string[] }; Returns: boolean }
      job_rail_tools: { Args: never; Returns: string[] }
      jwt_role: { Args: never; Returns: string }
      link_delivery_board: {
        Args: {
          p_from: string
          p_project_id: string
          p_to: string
          p_token_hash: string
        }
        Returns: Json
      }
      link_delivery_receipt: {
        Args: {
          p_delivery_id: string
          p_project_id: string
          p_token_hash: string
        }
        Returns: Json
      }
      link_post_delivery: {
        Args: {
          p_company: string
          p_date: string
          p_description: string
          p_duration: number
          p_name: string
          p_project_id: string
          p_time?: string
          p_token_hash: string
        }
        Returns: Json
      }
      link_request_answer: { Args: { p_request_id: string }; Returns: Json }
      link_request_calendar: {
        Args: {
          p_day?: string
          p_hub_id?: string
          p_project_id: string
          p_token_hash: string
        }
        Returns: Json
      }
      link_request_files: {
        Args: {
          p_files: Json
          p_hub_id: string
          p_project_id: string
          p_token_hash: string
        }
        Returns: Json
      }
      link_request_hub: {
        Args: { p_hub_id: string; p_token_hash: string }
        Returns: Json
      }
      link_request_join: {
        Args: {
          p_company: string
          p_email: string
          p_hub_id: string
          p_name: string
          p_project_id: string
          p_token_hash: string
        }
        Returns: Json
      }
      link_request_open: {
        Args: { p_hub_id?: string; p_project_id: string; p_token_hash: string }
        Returns: Json
      }
      link_request_status: {
        Args: { p_project_id: string; p_receipt_hash: string }
        Returns: Json
      }
      link_request_submit: {
        Args: {
          p_attachment_ids?: string[]
          p_company: string
          p_duration_kind?: string
          p_duration_min?: number
          p_email: string
          p_hub_id: string
          p_items: string
          p_kind: string
          p_name: string
          p_notice_ack: boolean
          p_phone: string
          p_project_id: string
          p_request_date: string
          p_special_kind_id?: string
          p_start_time?: string
          p_token_hash: string
        }
        Returns: Json
      }
      log_invoice_pdf: {
        Args: { p_invoice_id: string; p_sha256: string }
        Returns: undefined
      }
      log_view: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_project_id: string
        }
        Returns: undefined
      }
      mark_invite_opened: { Args: { p_project_id: string }; Returns: undefined }
      merge_sub_contacts: {
        Args: { p_existing: Json; p_incoming: Json }
        Returns: Json
      }
      my_bidder_member_id: { Args: { p_project_id: string }; Returns: string }
      my_daily_today: {
        Args: never
        Returns: {
          label: string
          next_number: number
          number: number
          project_id: string
          project_name: string
          report_id: string
          report_type: string
          schedule_days: number[]
          scheduled_today: boolean
          status: string
          today: string
        }[]
      }
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
      my_permits: {
        Args: never
        Returns: {
          agency_numbers: string[]
          assigned_name: string
          assigned_to: string
          expires_on: string
          extensions: number
          id: string
          issued_on: string
          kind: string
          open_comments: number
          primary_number: string
          project_id: string
          project_name: string
          review_cycle: number
          stage: string
          stage_since: string
          timezone: string
          title: string
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
      my_recommended_tools: {
        Args: { p_project_id?: string }
        Returns: {
          project_id: string
          tools: string[]
        }[]
      }
      my_tool_counts: {
        Args: { p_project_id?: string }
        Returns: {
          entity_type: string
          n: number
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
      open_bid_forms: { Args: { p_project_id: string }; Returns: string }
      org_logo_org: { Args: { p_name: string }; Returns: string }
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
      permit_approved: { Args: { p_permit_id: string }; Returns: Json }
      permit_approved_root: { Args: { p_project_id: string }; Returns: string }
      permit_check: {
        Args: {
          p_kind: string
          p_notes: string
          p_numbers: string[]
          p_primary: string
          p_title: string
        }
        Returns: undefined
      }
      permit_clean_numbers: {
        Args: { p_numbers: string[]; p_primary: string }
        Returns: string[]
      }
      permit_comment_add: {
        Args: {
          p_body: string
          p_code_ref?: string
          p_detail?: string
          p_key?: string
          p_review_id: string
          p_sheet?: string
        }
        Returns: {
          body: string
          closed_at: string | null
          closed_by: string | null
          closed_cycle: number | null
          code_ref: string
          created_at: string
          created_by: string
          detail: string
          earlier_answers: Json
          id: string
          number: number
          org_id: string
          permit_id: string
          project_id: string
          request_key: string | null
          responded_at: string | null
          responded_by: string | null
          response: string | null
          review_id: string
          sheet: string
          status: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "permit_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      permit_comment_close: {
        Args: { p_closed?: boolean; p_comment_id: string; p_version: number }
        Returns: {
          body: string
          closed_at: string | null
          closed_by: string | null
          closed_cycle: number | null
          code_ref: string
          created_at: string
          created_by: string
          detail: string
          earlier_answers: Json
          id: string
          number: number
          org_id: string
          permit_id: string
          project_id: string
          request_key: string | null
          responded_at: string | null
          responded_by: string | null
          response: string | null
          review_id: string
          sheet: string
          status: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "permit_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      permit_comment_respond: {
        Args: { p_comment_id: string; p_response: string; p_version: number }
        Returns: {
          body: string
          closed_at: string | null
          closed_by: string | null
          closed_cycle: number | null
          code_ref: string
          created_at: string
          created_by: string
          detail: string
          earlier_answers: Json
          id: string
          number: number
          org_id: string
          permit_id: string
          project_id: string
          request_key: string | null
          responded_at: string | null
          responded_by: string | null
          response: string | null
          review_id: string
          sheet: string
          status: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "permit_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      permit_create: {
        Args: {
          p_agency_numbers?: string[]
          p_assigned_to?: string
          p_key?: string
          p_kind?: string
          p_notes?: string
          p_primary_number: string
          p_project_id: string
          p_stage?: string
          p_title: string
        }
        Returns: {
          agency_numbers: string[]
          approved_folder_id: string | null
          assigned_to: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          expires_on: string | null
          extensions: number
          id: string
          issued_on: string | null
          kind: string
          notes: string
          org_id: string
          primary_number: string
          project_id: string
          request_key: string | null
          stage: string
          stage_since: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "permits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      permit_cycle: { Args: { p_permit_id: string }; Returns: number }
      permit_detail: { Args: { p_permit_id: string }; Returns: Json }
      permit_folder_ensure: {
        Args: {
          p_cap: string
          p_kind: string
          p_name: string
          p_parent_id: string
          p_project_id: string
          p_read: boolean
          p_sort: number
          p_write: boolean
        }
        Returns: string
      }
      permit_folder_make: {
        Args: {
          p_kind: string
          p_name: string
          p_parent_id: string
          p_project_id: string
          p_sort: number
        }
        Returns: string
      }
      permit_items_retired_0054: {
        Args: { p_items: Json }
        Returns: {
          content_hash: string
          ord: number
          source_file_id: string
          stamped_at: string
          stamped_file_id: string
        }[]
      }
      permit_label: { Args: { p_number: string }; Returns: string }
      permit_list: {
        Args: { p_project_id?: string }
        Returns: {
          agency_numbers: string[]
          assigned_name: string
          assigned_to: string
          expires_on: string
          extensions: number
          id: string
          issued_on: string
          kind: string
          open_comments: number
          primary_number: string
          project_id: string
          project_name: string
          review_cycle: number
          stage: string
          stage_since: string
          timezone: string
          title: string
          version: number
        }[]
      }
      permit_lock: {
        Args: { p_permit_id: string; p_version: number }
        Returns: {
          agency_numbers: string[]
          approved_folder_id: string | null
          assigned_to: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          expires_on: string | null
          extensions: number
          id: string
          issued_on: string | null
          kind: string
          notes: string
          org_id: string
          primary_number: string
          project_id: string
          request_key: string | null
          stage: string
          stage_since: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "permits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      permit_move: {
        Args: {
          p_note?: string
          p_permit_id: string
          p_stage: string
          p_version: number
        }
        Returns: {
          agency_numbers: string[]
          approved_folder_id: string | null
          assigned_to: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          expires_on: string | null
          extensions: number
          id: string
          issued_on: string | null
          kind: string
          notes: string
          org_id: string
          primary_number: string
          project_id: string
          request_key: string | null
          stage: string
          stage_since: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "permits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      permit_next_stages: { Args: { p_stage: string }; Returns: string[] }
      permit_number_free: {
        Args: { p_except: string; p_number: string; p_project_id: string }
        Returns: undefined
      }
      permit_numbers_ok: { Args: { p_numbers: string[] }; Returns: boolean }
      permit_official_ok: {
        Args: { p_person: string; p_project_id: string }
        Returns: boolean
      }
      permit_officials: {
        Args: { p_assigned_to: string; p_project_id: string }
        Returns: string[]
      }
      permit_people: {
        Args: { p_project_id: string }
        Returns: {
          name: string
          user_id: string
        }[]
      }
      permit_progress: {
        Args: { p_permit_id?: string; p_project_id?: string }
        Returns: {
          days: number
          entered_at: string
          left_at: string
          permit_id: string
          position: number
          stage: string
          state: string
        }[]
      }
      permit_record_stamped_set: {
        Args: {
          p_note?: string
          p_permit_id: string
          p_stamped_file_ids: string[]
          p_version: number
        }
        Returns: Json
      }
      permit_record_stamped_set_retired_0054: {
        Args: {
          p_items: Json
          p_note?: string
          p_permit_id: string
          p_version: number
        }
        Returns: Json
      }
      permit_review_close: {
        Args: {
          p_outcome: string
          p_returned_on?: string
          p_review_id: string
          p_version: number
        }
        Returns: {
          created_at: string
          created_by: string
          cycle: number
          id: string
          kind: string
          org_id: string
          outcome: string | null
          permit_id: string
          project_id: string
          received_on: string
          request_key: string | null
          returned_on: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "permit_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      permit_review_open: {
        Args: {
          p_key?: string
          p_kind?: string
          p_permit_id: string
          p_received_on?: string
        }
        Returns: {
          created_at: string
          created_by: string
          cycle: number
          id: string
          kind: string
          org_id: string
          outcome: string | null
          permit_id: string
          project_id: string
          received_on: string
          request_key: string | null
          returned_on: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "permit_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      permit_set_folder: { Args: { p_permit_id: string }; Returns: string }
      permit_stage_label: { Args: { p_stage: string }; Returns: string }
      permit_stage_pos: { Args: { p_stage: string }; Returns: number }
      permit_stamp_folders: { Args: { p_permit_id: string }; Returns: Json }
      permit_stamp_mode: { Args: { p_stage: string }; Returns: string }
      permit_stamp_source: {
        Args: { p_file_id: string; p_permit_id: string }
        Returns: {
          mime: string
          original_name: string
          size: number
          storage_path: string
        }[]
      }
      permit_stamp_sources: {
        Args: { p_permit_id: string }
        Returns: {
          created_at: string
          folder_id: string
          folder_kind: string
          folder_name: string
          id: string
          name: string
          size: number
        }[]
      }
      permit_tell: {
        Args: {
          p_kind: string
          p_people: string[]
          p_permit: Database["public"]["Tables"]["permits"]["Row"]
          p_summary: string
        }
        Returns: undefined
      }
      permit_today: { Args: { p_project_id: string }; Returns: string }
      permit_undo_move: {
        Args: { p_permit_id: string; p_version: number }
        Returns: {
          agency_numbers: string[]
          approved_folder_id: string | null
          assigned_to: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          expires_on: string | null
          extensions: number
          id: string
          issued_on: string | null
          kind: string
          notes: string
          org_id: string
          primary_number: string
          project_id: string
          request_key: string | null
          stage: string
          stage_since: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "permits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      permit_update: {
        Args: {
          p_agency_numbers: string[]
          p_assigned_to: string
          p_expires_on: string
          p_extensions: number
          p_issued_on: string
          p_kind: string
          p_notes: string
          p_permit_id: string
          p_primary_number: string
          p_title: string
          p_version: number
        }
        Returns: {
          agency_numbers: string[]
          approved_folder_id: string | null
          assigned_to: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          expires_on: string | null
          extensions: number
          id: string
          issued_on: string | null
          kind: string
          notes: string
          org_id: string
          primary_number: string
          project_id: string
          request_key: string | null
          stage: string
          stage_since: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "permits"
          isOneToOne: true
          isSetofReturn: false
        }
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
      post_delivery: {
        Args: {
          p_company: string
          p_date: string
          p_description: string
          p_duration: number
          p_project_id: string
          p_time?: string
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
      record_cslb_check: {
        Args: { p_status: string; p_sub_id: string; p_version: number }
        Returns: {
          certifications: string | null
          city: string | null
          company: string
          contacts: Json
          created_at: string
          created_by: string | null
          cslb_checked_at: string | null
          cslb_number: string | null
          cslb_status: string | null
          deleted_at: string | null
          dir_number: string | null
          extra: Json
          id: string
          license_classes: string | null
          notes: string
          org_id: string
          region: string | null
          trades: string[]
          updated_at: string
          version: number
          zip: string | null
        }
        SetofOptions: {
          from: "*"
          to: "subs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_received_bid: {
        Args: { p_file_id: string; p_package_id: string; p_sub_id?: string }
        Returns: {
          receipt_number: number
          submission_id: string
        }[]
      }
      refresh_invoice: {
        Args: { p_invoice_id: string; p_version: number }
        Returns: {
          bill_to: string
          created_at: string
          created_by: string | null
          from_address: string
          from_name: string
          id: string
          issued_on: string
          lines: Json
          number: number
          paid_at: string | null
          period: string
          sent_at: string | null
          status: string
          terms: string
          total_amount: number
          total_hours: number
          updated_at: string
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
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
          scan_skipped_at: string | null
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
      remove_daily_photo: {
        Args: { p_photo_id: string; p_version: number }
        Returns: undefined
      }
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
      request_hub_decides: { Args: { p_person: string }; Returns: boolean }
      request_hub_list: {
        Args: { p_owner: string }
        Returns: {
          name: string
          project_id: string
        }[]
      }
      request_hub_owner: {
        Args: { p_hub_id: string; p_token_hash: string }
        Returns: string
      }
      request_hub_state: {
        Args: never
        Returns: {
          decides: boolean
          hub_id: string
          jobs: number
          made_at: string
        }[]
      }
      request_link_job: {
        Args: { p_hub_id: string; p_project_id: string; p_token_hash: string }
        Returns: {
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
          is_dsa: boolean
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
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_link_on: { Args: { p_project_id: string }; Returns: boolean }
      request_link_state: {
        Args: { p_project_id: string }
        Returns: {
          active: boolean
          since: string
        }[]
      }
      request_link_token: { Args: never; Returns: string }
      requester_backfill: { Args: never; Returns: number }
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
      restore_delivery: { Args: { p_id: string }; Returns: undefined }
      review_delivery_month: {
        Args: {
          p_company: string
          p_month: string
          p_name: string
          p_project_id: string
        }
        Returns: undefined
      }
      rfi_active_member: {
        Args: { p_person: string; p_project_id: string }
        Returns: boolean
      }
      rfi_answer: {
        Args: {
          p_answer: string
          p_file_ids?: string[]
          p_rfi_id: string
          p_version: number
        }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_attach_pdf: {
        Args: { p_content_hash: string; p_file_id: string; p_rfi_id: string }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_authorize_file: {
        Args: { p_file_id: string; p_rfi_id: string }
        Returns: {
          mime: string
          original_name: string
          storage_path: string
        }[]
      }
      rfi_check_text: {
        Args: {
          p_question: string
          p_refs: string
          p_suggestion: string
          p_title: string
        }
        Returns: undefined
      }
      rfi_claim_impact: {
        Args: {
          p_cost: boolean
          p_note?: string
          p_rfi_id: string
          p_time: boolean
        }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_close: {
        Args: { p_rfi_id: string; p_version: number }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_create: {
        Args: {
          p_cost_impact?: boolean
          p_key?: string
          p_needed_by?: string
          p_photo_ids?: string[]
          p_project_id: string
          p_question: string
          p_refs?: string
          p_suggestion?: string
          p_time_impact?: boolean
          p_title: string
        }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_default_days: { Args: never; Returns: number }
      rfi_detail: { Args: { p_rfi_id: string }; Returns: Json }
      rfi_event: {
        Args: {
          p_kind: string
          p_note: string
          p_rfi_id: string
          p_step: number
        }
        Returns: undefined
      }
      rfi_files_ok: {
        Args: { p_existing: string[]; p_ids: string[]; p_project_id: string }
        Returns: boolean
      }
      rfi_folder: { Args: { p_project_id: string }; Returns: string }
      rfi_forward: {
        Args: { p_note?: string; p_rfi_id: string; p_version: number }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_gc_note: {
        Args: { p_note: string; p_rfi_id: string }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_hand_over: { Args: { p_rfi_id: string }; Returns: undefined }
      rfi_holder_ids: { Args: { p_rfi_id: string }; Returns: string[] }
      rfi_holder_label: {
        Args: {
          p_created_by: string
          p_rfi_id: string
          p_status: string
          p_step: number
        }
        Returns: string
      }
      rfi_holds: {
        Args: {
          p_created_by: string
          p_project_id: string
          p_rfi_id: string
          p_status: string
          p_step: number
        }
        Returns: boolean
      }
      rfi_label: { Args: { p_number: number }; Returns: string }
      rfi_list: {
        Args: { p_project_id: string }
        Returns: {
          answered_at: string
          closed_at: string
          created_at: string
          created_by: string
          due_at: string
          held_opened_at: string
          held_since: string
          holder_label: string
          id: string
          impact_claimed_at: string
          impact_until: string
          is_mine_to_act: boolean
          issued_at: string
          number: number
          originator_name: string
          sent_at: string
          status: string
          title: string
          version: number
        }[]
      }
      rfi_lock: {
        Args: { p_rfi_id: string; p_version: number }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_may_see: {
        Args: {
          p_created_by: string
          p_project_id: string
          p_rfi_id: string
          p_status: string
          p_step: number
        }
        Returns: boolean
      }
      rfi_on_route: {
        Args: { p_project_id: string; p_rfi_id: string; p_upto: number }
        Returns: boolean
      }
      rfi_person_company: {
        Args: { p_person: string; p_project_id: string }
        Returns: string
      }
      rfi_person_name: { Args: { p_person: string }; Returns: string }
      rfi_progress: {
        Args: { p_project_id: string }
        Returns: {
          days: number
          due_at: string
          entered_at: string
          kind: string
          label: string
          left_at: string
          person_name: string
          position: number
          rfi_id: string
          state: string
        }[]
      }
      rfi_role_label: { Args: { p_role: string }; Returns: string }
      rfi_save_settings: {
        Args: {
          p_answer_days: number
          p_impact_days: number
          p_project_id: string
          p_route: Json
          p_version: number
        }
        Returns: Json
      }
      rfi_send_back: {
        Args: { p_note: string; p_rfi_id: string; p_version: number }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_settings_for: { Args: { p_project_id: string }; Returns: Json }
      rfi_sign_issue: {
        Args: { p_content_hash: string; p_rfi_id: string; p_version: number }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_sign_send: {
        Args: { p_content_hash: string; p_rfi_id: string; p_version: number }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_step_count: { Args: { p_rfi_id: string }; Returns: number }
      rfi_step_holders: {
        Args: { p_project_id: string; p_rfi_id: string; p_step: number }
        Returns: string[]
      }
      rfi_step_label: {
        Args: { p_person: string; p_role: string }
        Returns: string
      }
      rfi_tell: {
        Args: {
          p_kind: string
          p_people: string[]
          p_rfi_id: string
          p_summary: string
        }
        Returns: undefined
      }
      rfi_update: {
        Args: {
          p_cost_impact?: boolean
          p_needed_by?: string
          p_photo_ids: string[]
          p_question: string
          p_refs: string
          p_rfi_id: string
          p_suggestion: string
          p_time_impact?: boolean
          p_title: string
          p_version: number
        }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_users_with_cap: {
        Args: { p_cap: string; p_project_id: string }
        Returns: string[]
      }
      rfi_users_with_role: {
        Args: { p_project_id: string; p_role: string }
        Returns: string[]
      }
      rfi_void: {
        Args: { p_note?: string; p_rfi_id: string; p_version: number }
        Returns: {
          answer: string | null
          answer_file_ids: string[]
          answered_at: string | null
          answered_by: string | null
          closed_at: string | null
          closed_by: string | null
          cost_impact: boolean | null
          created_at: string
          created_by: string
          deleted_at: string | null
          due_at: string | null
          held_opened_at: string | null
          held_since: string
          id: string
          impact_claimed_at: string | null
          impact_cost: boolean | null
          impact_gc_note: string | null
          impact_note: string | null
          impact_time: boolean | null
          impact_until: string | null
          issued_at: string | null
          issued_by: string | null
          issued_hash: string | null
          needed_by: string | null
          number: number | null
          org_id: string
          pdf_file_id: string | null
          pdf_hash: string | null
          photo_ids: string[]
          project_id: string
          question: string
          refs: string
          request_key: string | null
          sent_at: string | null
          sent_by: string | null
          sent_hash: string | null
          status: string
          step: number
          suggestion: string
          time_impact: boolean | null
          title: string
          updated_at: string
          version: number
          void_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rfi_waiting: {
        Args: never
        Returns: {
          due_at: string
          held_opened_at: string
          held_since: string
          holder_label: string
          id: string
          number: number
          project_id: string
          project_name: string
          reason: string
          status: string
          title: string
        }[]
      }
      role_is_walled: { Args: { p_role: string }; Returns: boolean }
      rotate_calendar_feed: { Args: never; Returns: string }
      rotate_delivery_link: { Args: { p_project_id: string }; Returns: string }
      rotate_request_hub: {
        Args: never
        Returns: {
          hub_id: string
          made_at: string
          token: string
        }[]
      }
      rotate_request_link: {
        Args: { p_project_id: string }
        Returns: {
          made_at: string
          token: string
        }[]
      }
      save_billing_profile: {
        Args: {
          p_address: string
          p_bill_to: string
          p_business_name: string
          p_next_invoice_number: number
          p_rate: number
          p_terms: string
          p_version?: number
        }
        Returns: {
          address: string
          bill_to: string
          business_name: string
          created_at: string
          next_invoice_number: number
          rate: number | null
          terms: string
          updated_at: string
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "billing_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_daily_content: {
        Args: { p_content: Json; p_report_id: string; p_version: number }
        Returns: {
          author_id: string
          content: Json
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          filename: string | null
          header: Json
          hours: number | null
          id: string
          number: number | null
          org_id: string
          pdf_file_id: string | null
          project_id: string
          report_date: string
          report_type: string
          sign_pending_at: string | null
          sign_pending_hash: string | null
          signed_at: string | null
          signed_by: string | null
          signed_version: number | null
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "daily_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_daily_photo: {
        Args: {
          p_caption: string
          p_description?: string
          p_photo_id: string
          p_version: number
        }
        Returns: {
          caption: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          file_id: string
          id: string
          org_id: string
          project_id: string
          report_id: string
          row_key: string | null
          taken_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "daily_report_photos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_daily_setup: {
        Args: {
          p_project_id: string
          p_report_type: string
          p_settings: Json
          p_version?: number
        }
        Returns: {
          author_id: string
          chosen_at: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          project_id: string
          report_type: string
          settings: Json
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "daily_setups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_hours_budget: {
        Args: {
          p_baseline: number
          p_contract: number
          p_project_id: string
          p_through: string
          p_version?: number
        }
        Returns: {
          baseline_hours: number
          baseline_through: string | null
          contract_hours: number
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          project_id: string
          updated_at: string
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "job_hours_budgets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_job_rail: {
        Args: { p_project_id: string; p_tools: string[]; p_version?: number }
        Returns: {
          created_at: string
          project_id: string
          tools: string[] | null
          updated_at: string
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "user_job_rail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      set_bid_leveling: {
        Args: { p_patch: Json; p_submission_id: string; p_version: number }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "bid_leveling"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_correction_status: {
        Args: {
          p_id: string
          p_note?: string
          p_photo_ids?: string[]
          p_status: string
          p_version: number
        }
        Returns: {
          closed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string
          id: string
          location: string
          notice_file_id: string | null
          notice_ref: string
          number: number
          org_id: string
          photo_ids: string[]
          project_id: string
          request_key: string
          spec_tags: string[]
          status: string
          status_changed_at: string
          title: string
          trade: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_daily_hours: {
        Args: { p_hours: number; p_report_id: string; p_version: number }
        Returns: {
          author_id: string
          content: Json
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          filename: string | null
          header: Json
          hours: number | null
          id: string
          number: number | null
          org_id: string
          pdf_file_id: string | null
          project_id: string
          report_date: string
          report_type: string
          sign_pending_at: string | null
          sign_pending_hash: string | null
          signed_at: string | null
          signed_by: string | null
          signed_version: number | null
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "daily_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_daily_start_number: {
        Args: { p_project_id: string; p_report_type: string; p_start: number }
        Returns: number
      }
      set_invoice_status: {
        Args: { p_invoice_id: string; p_status: string; p_version: number }
        Returns: {
          bill_to: string
          created_at: string
          created_by: string | null
          from_address: string
          from_name: string
          id: string
          issued_on: string
          lines: Json
          number: number
          paid_at: string | null
          period: string
          sent_at: string | null
          status: string
          terms: string
          total_amount: number
          total_hours: number
          updated_at: string
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_job_rate: {
        Args: { p_project_id: string; p_rate: number; p_version?: number }
        Returns: {
          created_at: string
          project_id: string
          rate: number | null
          updated_at: string
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "billing_job_rates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_org_logo: {
        Args: { p_org_id: string; p_path: string }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          intake_address: string | null
          kind: string
          logo_path: string | null
          name: string
          settings: Json
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "orgs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_request_permit: {
        Args: { p_permit_id: string; p_request_id: string; p_version: number }
        Returns: {
          attachment_ids: string[]
          attendance: string | null
          company: string
          confirm_note: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_kind: string
          duration_min: number | null
          gc_at: string | null
          gc_by: string | null
          gc_note: string | null
          helper_at: string | null
          helper_id: string | null
          helper_note: string | null
          helper_report: string | null
          id: string
          ir_file_id: string | null
          items: string
          kind: string
          notice_ack_at: string
          number: number
          org_id: string
          owner_id: string | null
          pdf_postponed: boolean
          pdf_stale: boolean
          permit_id: string | null
          postpone_count: number
          postpone_note: string | null
          postpone_reason: string | null
          postpone_until: string | null
          postponed_at: string | null
          project_id: string
          request_date: string
          requested_by: string | null
          requester_email: string | null
          requester_name: string | null
          requester_phone: string | null
          result: string | null
          result_at: string | null
          result_by: string | null
          result_note: string | null
          result_photo_ids: string[]
          results_sent_at: string | null
          signed_at: string | null
          signed_by: string | null
          special_kind_id: string | null
          start_time: string | null
          status: string
          summary: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inspection_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_submission_sub: {
        Args: { p_sub_id: string; p_submission_id: string }
        Returns: undefined
      }
      sign_timesheet: {
        Args: { p_content_hash: string; p_org_id: string; p_period: string }
        Returns: string
      }
      signed_in_recently: { Args: never; Returns: boolean }
      signin_key_email: { Args: { p_token_hash: string }; Returns: string }
      submit_bid: {
        Args: { p_file_id: string; p_package_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          file_id: string
          id: string
          is_late: boolean
          member_id: string | null
          org_id: string
          package_id: string
          project_id: string
          receipt_number: number
          received_at: string
          received_by: string | null
          source: string
          sub_id: string | null
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
      testing_relaxed_login: { Args: never; Returns: boolean }
      testing_view_as: { Args: { p_role: string }; Returns: Json }
      testing_view_as_state: { Args: never; Returns: Json }
      undo_correction: {
        Args: { p_id: string; p_version: number }
        Returns: {
          closed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string
          id: string
          location: string
          notice_file_id: string | null
          notice_ref: string
          number: number
          org_id: string
          photo_ids: string[]
          project_id: string
          request_key: string
          spec_tags: string[]
          status: string
          status_changed_at: string
          title: string
          trade: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      undo_delivery_link_rotation: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      undo_request_link_rotation: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      update_delivery: {
        Args: {
          p_company: string
          p_date: string
          p_description: string
          p_duration: number
          p_id: string
          p_time?: string
          p_version: number
        }
        Returns: number
      }
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
