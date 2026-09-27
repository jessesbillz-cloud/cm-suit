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
          postmark_message_id: string | null
          project_id: string | null
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
          postmark_message_id?: string | null
          project_id?: string | null
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
          postmark_message_id?: string | null
          project_id?: string | null
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
      postmark_events: {
        Row: {
          id: number
          message_id: string
          payload: Json
          received_at: string
          record_type: string
        }
        Insert: {
          id?: never
          message_id: string
          payload: Json
          received_at?: string
          record_type: string
        }
        Update: {
          id?: never
          message_id?: string
          payload?: Json
          received_at?: string
          record_type?: string
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
          postmark_message_id: string | null
          project_id: string
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
          postmark_message_id?: string | null
          project_id: string
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
          postmark_message_id?: string | null
          project_id?: string
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
          postmark_message_id: string | null
          project_id: string
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
      jwt_role: { Args: never; Returns: string }
      log_view: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_project_id: string
        }
        Returns: undefined
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
