// Tipos do esquema do banco — ARQUIVO GERADO, não editar à mão.
//
// Serve para o compilador acusar divergência entre o app e o banco: nome de
// tabela, de coluna, de RPC e de parâmetro passam a ser conferidos na hora do
// `typecheck`, e não só quando a tela quebra.
//
// Regerar depois de cada migration nova:
//   npx supabase gen types typescript --project-id <ref do projeto> > src/types/database.ts
// (e recolocar este cabeçalho).
//
// Fica fora do barril `types/index.ts` de propósito: aqui moram centenas de
// nomes gerados, e o barril é para os tipos de domínio que as telas usam.

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
      accounts: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          time_zone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          time_zone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          time_zone?: string
          updated_at?: string
        }
        Relationships: []
      }
      admins: {
        Row: {
          account_id: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admins_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          created_at: string
          created_by_account: string | null
          effective_from: string
          effective_to: string | null
          id: string
          min_grade: number
          symptom_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_account?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          min_grade: number
          symptom_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_account?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          min_grade?: number
          symptom_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_created_by_account_fkey"
            columns: ["created_by_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_symptom_id_fkey"
            columns: ["symptom_id"]
            isOneToOne: false
            referencedRelation: "symptoms"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          alert_rule_id: string
          assigned_at: string | null
          assigned_professional_id: string | null
          conduct_at: string | null
          conduct_kind: Database["public"]["Enums"]["alert_conduct_kind"] | null
          conduct_notes: string | null
          created_at: string
          diary_entry_id: string
          grade: number
          id: string
          patient_id: string
          resolved_at: string | null
          resolved_by_professional_id: string | null
          source_actor_kind: Database["public"]["Enums"]["diary_actor_kind"]
          status: Database["public"]["Enums"]["alert_status"]
          symptom_id: string
          symptom_report_id: string
          triaged_at: string | null
          triaged_by_professional_id: string | null
          updated_at: string
        }
        Insert: {
          alert_rule_id: string
          assigned_at?: string | null
          assigned_professional_id?: string | null
          conduct_at?: string | null
          conduct_kind?:
            | Database["public"]["Enums"]["alert_conduct_kind"]
            | null
          conduct_notes?: string | null
          created_at?: string
          diary_entry_id: string
          grade: number
          id?: string
          patient_id: string
          resolved_at?: string | null
          resolved_by_professional_id?: string | null
          source_actor_kind: Database["public"]["Enums"]["diary_actor_kind"]
          status?: Database["public"]["Enums"]["alert_status"]
          symptom_id: string
          symptom_report_id: string
          triaged_at?: string | null
          triaged_by_professional_id?: string | null
          updated_at?: string
        }
        Update: {
          alert_rule_id?: string
          assigned_at?: string | null
          assigned_professional_id?: string | null
          conduct_at?: string | null
          conduct_kind?:
            | Database["public"]["Enums"]["alert_conduct_kind"]
            | null
          conduct_notes?: string | null
          created_at?: string
          diary_entry_id?: string
          grade?: number
          id?: string
          patient_id?: string
          resolved_at?: string | null
          resolved_by_professional_id?: string | null
          source_actor_kind?: Database["public"]["Enums"]["diary_actor_kind"]
          status?: Database["public"]["Enums"]["alert_status"]
          symptom_id?: string
          symptom_report_id?: string
          triaged_at?: string | null
          triaged_by_professional_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_alert_rule_id_fkey"
            columns: ["alert_rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_assigned_professional_id_fkey"
            columns: ["assigned_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_diary_entry_id_fkey"
            columns: ["diary_entry_id"]
            isOneToOne: false
            referencedRelation: "diary_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_resolved_by_professional_id_fkey"
            columns: ["resolved_by_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_symptom_id_fkey"
            columns: ["symptom_id"]
            isOneToOne: false
            referencedRelation: "symptoms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_symptom_report_id_fkey"
            columns: ["symptom_report_id"]
            isOneToOne: true
            referencedRelation: "diary_symptom_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_triaged_by_professional_id_fkey"
            columns: ["triaged_by_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_status_reasons: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          status_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          status_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          status_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_status_reasons_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "appointment_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_statuses: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_terminal: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_terminal?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_terminal?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      appointment_types: {
        Row: {
          code: string
          color: string | null
          created_at: string
          icon_name: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_type_id: string
          confirmed_at: string | null
          confirmed_by_account_id: string | null
          created_at: string
          created_by_account_id: string
          ends_at: string
          id: string
          location_address: string | null
          location_label: string
          location_phone: string | null
          origin_specialty_id: string | null
          patient_id: string
          patient_notes: string | null
          professional_id: string | null
          rescheduled_from_id: string | null
          starts_at: string
          status_id: string
          status_reason_id: string | null
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["clinical_visibility"]
        }
        Insert: {
          appointment_type_id: string
          confirmed_at?: string | null
          confirmed_by_account_id?: string | null
          created_at?: string
          created_by_account_id: string
          ends_at: string
          id?: string
          location_address?: string | null
          location_label: string
          location_phone?: string | null
          origin_specialty_id?: string | null
          patient_id: string
          patient_notes?: string | null
          professional_id?: string | null
          rescheduled_from_id?: string | null
          starts_at: string
          status_id: string
          status_reason_id?: string | null
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["clinical_visibility"]
        }
        Update: {
          appointment_type_id?: string
          confirmed_at?: string | null
          confirmed_by_account_id?: string | null
          created_at?: string
          created_by_account_id?: string
          ends_at?: string
          id?: string
          location_address?: string | null
          location_label?: string
          location_phone?: string | null
          origin_specialty_id?: string | null
          patient_id?: string
          patient_notes?: string | null
          professional_id?: string | null
          rescheduled_from_id?: string | null
          starts_at?: string
          status_id?: string
          status_reason_id?: string | null
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["clinical_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "appointments_appointment_type_id_fkey"
            columns: ["appointment_type_id"]
            isOneToOne: false
            referencedRelation: "appointment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_confirmed_by_account_id_fkey"
            columns: ["confirmed_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_account_id_fkey"
            columns: ["created_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_origin_specialty_id_fkey"
            columns: ["origin_specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_rescheduled_from_id_fkey"
            columns: ["rescheduled_from_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "appointment_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_status_reason_id_fkey"
            columns: ["status_reason_id"]
            isOneToOne: false
            referencedRelation: "appointment_status_reasons"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_account_id: string | null
          actor_capacity:
            | Database["public"]["Enums"]["audit_actor_capacity"]
            | null
          id: number
          is_restricted_material: boolean
          occurred_at: string
          origin: string | null
          patient_id: string | null
          resource_id: string | null
          resource_table: string
          row_count: number | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_account_id?: string | null
          actor_capacity?:
            | Database["public"]["Enums"]["audit_actor_capacity"]
            | null
          id?: never
          is_restricted_material?: boolean
          occurred_at?: string
          origin?: string | null
          patient_id?: string | null
          resource_id?: string | null
          resource_table: string
          row_count?: number | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_account_id?: string | null
          actor_capacity?:
            | Database["public"]["Enums"]["audit_actor_capacity"]
            | null
          id?: never
          is_restricted_material?: boolean
          occurred_at?: string
          origin?: string | null
          patient_id?: string | null
          resource_id?: string | null
          resource_table?: string
          row_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_account_id_fkey"
            columns: ["actor_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      caregiver_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_account: string | null
          cancelled_at: string | null
          channel: Database["public"]["Enums"]["caregiver_invitation_channel"]
          created_at: string
          destination: string
          expires_at: string | null
          id: string
          invited_by_account: string | null
          patient_id: string
          status: Database["public"]["Enums"]["caregiver_invitation_status"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_account?: string | null
          cancelled_at?: string | null
          channel: Database["public"]["Enums"]["caregiver_invitation_channel"]
          created_at?: string
          destination: string
          expires_at?: string | null
          id?: string
          invited_by_account?: string | null
          patient_id: string
          status?: Database["public"]["Enums"]["caregiver_invitation_status"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_account?: string | null
          cancelled_at?: string | null
          channel?: Database["public"]["Enums"]["caregiver_invitation_channel"]
          created_at?: string
          destination?: string
          expires_at?: string | null
          id?: string
          invited_by_account?: string | null
          patient_id?: string
          status?: Database["public"]["Enums"]["caregiver_invitation_status"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_invitations_accepted_by_account_fkey"
            columns: ["accepted_by_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caregiver_invitations_invited_by_account_fkey"
            columns: ["invited_by_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caregiver_invitations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      caregivers: {
        Row: {
          account_id: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caregivers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cid10: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          accepted_at: string
          account_id: string
          created_at: string
          document_version_id: string
          id: string
          revoked_at: string | null
        }
        Insert: {
          accepted_at?: string
          account_id: string
          created_at?: string
          document_version_id: string
          id?: string
          revoked_at?: string | null
        }
        Update: {
          accepted_at?: string
          account_id?: string
          created_at?: string
          document_version_id?: string
          id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "legal_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      content_attachments: {
        Row: {
          byte_size: number
          content_version_id: string
          created_at: string
          id: string
          mime_type: string
          storage_path: string
        }
        Insert: {
          byte_size: number
          content_version_id: string
          created_at?: string
          id?: string
          mime_type: string
          storage_path: string
        }
        Update: {
          byte_size?: number
          content_version_id?: string
          created_at?: string
          id?: string
          mime_type?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_attachments_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      content_categories: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          specialty_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order: number
          specialty_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          specialty_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_categories_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      content_cid10: {
        Row: {
          cid10_id: string
          content_item_id: string
          created_at: string
        }
        Insert: {
          cid10_id: string
          content_item_id: string
          created_at?: string
        }
        Update: {
          cid10_id?: string
          content_item_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_cid10_cid10_id_fkey"
            columns: ["cid10_id"]
            isOneToOne: false
            referencedRelation: "cid10"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_cid10_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          author_professional_id: string
          authored_by: string
          category_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          author_professional_id: string
          authored_by: string
          category_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_professional_id?: string
          authored_by?: string
          category_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_author_professional_id_fkey"
            columns: ["author_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_authored_by_fkey"
            columns: ["authored_by"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "content_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      content_version_reviews: {
        Row: {
          action: Database["public"]["Enums"]["content_review_action"]
          comment: string | null
          content_version_id: string
          created_at: string
          id: string
          reviewer_account_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["content_review_action"]
          comment?: string | null
          content_version_id: string
          created_at?: string
          id?: string
          reviewer_account_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["content_review_action"]
          comment?: string | null
          content_version_id?: string
          created_at?: string
          id?: string
          reviewer_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_version_reviews_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_version_reviews_reviewer_account_id_fkey"
            columns: ["reviewer_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          body: string
          content_item_id: string
          created_at: string
          created_by: string
          created_by_professional_id: string
          estimated_reading_minutes: number | null
          id: string
          media_kind: Database["public"]["Enums"]["content_media_kind"]
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
          version_no: number
          video_url: string | null
        }
        Insert: {
          body: string
          content_item_id: string
          created_at?: string
          created_by: string
          created_by_professional_id: string
          estimated_reading_minutes?: number | null
          id?: string
          media_kind?: Database["public"]["Enums"]["content_media_kind"]
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
          version_no?: number
          video_url?: string | null
        }
        Update: {
          body?: string
          content_item_id?: string
          created_at?: string
          created_by?: string
          created_by_professional_id?: string
          estimated_reading_minutes?: number | null
          id?: string
          media_kind?: Database["public"]["Enums"]["content_media_kind"]
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
          version_no?: number
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_versions_created_by_professional_id_fkey"
            columns: ["created_by_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_assignments: {
        Row: {
          assigned_at: string
          conversation_id: string
          id: string
          professional_id: string
          released_at: string | null
          specialty_id: string
        }
        Insert: {
          assigned_at?: string
          conversation_id: string
          id?: string
          professional_id: string
          released_at?: string | null
          specialty_id: string
        }
        Update: {
          assigned_at?: string
          conversation_id?: string
          id?: string
          professional_id?: string
          released_at?: string | null
          specialty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_assignments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_read_marks: {
        Row: {
          account_id: string
          conversation_id: string
          last_read_at: string
        }
        Insert: {
          account_id: string
          conversation_id: string
          last_read_at?: string
        }
        Update: {
          account_id?: string
          conversation_id?: string
          last_read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_read_marks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_read_marks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_subjects: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          specialty_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          specialty_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          specialty_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_subjects_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_professional_id: string | null
          created_at: string
          id: string
          last_message_at: string
          opened_by: string
          origin_specialty_id: string | null
          patient_id: string
          resolved_at: string | null
          resolved_by_professional_id: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          subject_id: string
          team_last_read_at: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["clinical_visibility"]
        }
        Insert: {
          assigned_professional_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          opened_by: string
          origin_specialty_id?: string | null
          patient_id: string
          resolved_at?: string | null
          resolved_by_professional_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject_id: string
          team_last_read_at?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["clinical_visibility"]
        }
        Update: {
          assigned_professional_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          opened_by?: string
          origin_specialty_id?: string | null
          patient_id?: string
          resolved_at?: string | null
          resolved_by_professional_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject_id?: string
          team_last_read_at?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["clinical_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_professional_id_fkey"
            columns: ["assigned_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_origin_specialty_id_fkey"
            columns: ["origin_specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_resolved_by_professional_id_fkey"
            columns: ["resolved_by_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "conversation_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      data_subject_requests: {
        Row: {
          account_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          executed_at: string | null
          id: string
          request_type: Database["public"]["Enums"]["data_subject_request_type"]
          status: Database["public"]["Enums"]["data_subject_request_status"]
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          executed_at?: string | null
          id?: string
          request_type: Database["public"]["Enums"]["data_subject_request_type"]
          status?: Database["public"]["Enums"]["data_subject_request_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          executed_at?: string | null
          id?: string
          request_type?: Database["public"]["Enums"]["data_subject_request_type"]
          status?: Database["public"]["Enums"]["data_subject_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_subject_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_subject_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          account_id: string
          created_at: string
          id: string
          is_active: boolean
          last_seen_at: string
          platform: Database["public"]["Enums"]["device_platform"]
          token: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform: Database["public"]["Enums"]["device_platform"]
          token: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["device_platform"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      diary_entries: {
        Row: {
          acting_as: Database["public"]["Enums"]["diary_actor_kind"]
          authored_by: string
          created_at: string
          entry_date: string
          free_text: string | null
          id: string
          patient_id: string
          status: Database["public"]["Enums"]["diary_entry_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          acting_as: Database["public"]["Enums"]["diary_actor_kind"]
          authored_by: string
          created_at?: string
          entry_date?: string
          free_text?: string | null
          id?: string
          patient_id: string
          status?: Database["public"]["Enums"]["diary_entry_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          acting_as?: Database["public"]["Enums"]["diary_actor_kind"]
          authored_by?: string
          created_at?: string
          entry_date?: string
          free_text?: string | null
          id?: string
          patient_id?: string
          status?: Database["public"]["Enums"]["diary_entry_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diary_entries_authored_by_fkey"
            columns: ["authored_by"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diary_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      diary_symptom_reports: {
        Row: {
          created_at: string
          diary_entry_id: string
          grade: number
          id: string
          symptom_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          diary_entry_id: string
          grade: number
          id?: string
          symptom_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          diary_entry_id?: string
          grade?: number
          id?: string
          symptom_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diary_symptom_reports_diary_entry_id_fkey"
            columns: ["diary_entry_id"]
            isOneToOne: false
            referencedRelation: "diary_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diary_symptom_reports_symptom_id_fkey"
            columns: ["symptom_id"]
            isOneToOne: false
            referencedRelation: "symptoms"
            referencedColumns: ["id"]
          },
        ]
      }
      external_refs: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          entity_type: string
          external_key: Json
          id: string
          link_status: Database["public"]["Enums"]["external_link_status"]
          local_id: string
          system: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          entity_type: string
          external_key: Json
          id?: string
          link_status?: Database["public"]["Enums"]["external_link_status"]
          local_id: string
          system?: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          entity_type?: string
          external_key?: Json
          id?: string
          link_status?: Database["public"]["Enums"]["external_link_status"]
          local_id?: string
          system?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_refs_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      gemed_outbox: {
        Row: {
          attempt_count: number
          created_at: string
          dedup_key: string
          entity_id: string
          give_up_at: string
          id: number
          kind: string
          last_error: string | null
          next_attempt_at: string
          patient_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["gemed_outbox_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          dedup_key: string
          entity_id: string
          give_up_at?: string
          id?: never
          kind: string
          last_error?: string | null
          next_attempt_at?: string
          patient_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["gemed_outbox_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          dedup_key?: string
          entity_id?: string
          give_up_at?: string
          id?: never
          kind?: string
          last_error?: string | null
          next_attempt_at?: string
          patient_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["gemed_outbox_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gemed_outbox_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_document_versions: {
        Row: {
          body: string
          created_at: string
          id: string
          is_current: boolean
          kind: Database["public"]["Enums"]["legal_document_kind"]
          published_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_current?: boolean
          kind: Database["public"]["Enums"]["legal_document_kind"]
          published_at?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_current?: boolean
          kind?: Database["public"]["Enums"]["legal_document_kind"]
          published_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      message_attachments: {
        Row: {
          byte_size: number
          created_at: string
          id: string
          message_id: string
          mime_type: string
          storage_path: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          id?: string
          message_id: string
          mime_type: string
          storage_path: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          id?: string
          message_id?: string
          mime_type?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_account_id: string | null
          author_kind: Database["public"]["Enums"]["message_author_kind"]
          author_professional_id: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_account_id?: string | null
          author_kind: Database["public"]["Enums"]["message_author_kind"]
          author_professional_id?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_account_id?: string | null
          author_kind?: Database["public"]["Enums"]["message_author_kind"]
          author_professional_id?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_account_id_fkey"
            columns: ["author_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_author_professional_id_fkey"
            columns: ["author_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          give_up_at: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          notification_id: string
          provider_message_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          give_up_at?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_id: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          give_up_at?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          account_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          is_enabled: boolean
          is_silenceable: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          type_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          is_enabled?: boolean
          is_silenceable?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          type_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          is_enabled?: boolean
          is_silenceable?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_notification_preferences_type"
            columns: ["type_id", "is_silenceable"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["id", "is_silenceable"]
          },
          {
            foreignKeyName: "notification_preferences_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_types: {
        Row: {
          category: string
          code: string
          created_at: string
          icon_name: string | null
          id: string
          is_active: boolean
          is_silenceable: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          is_silenceable?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          is_silenceable?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          archived_at: string | null
          created_at: string
          dedup_key: string
          id: string
          patient_id: string | null
          read_at: string | null
          recipient_account_id: string
          target_id: string | null
          target_table: string | null
          type_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          dedup_key: string
          id?: string
          patient_id?: string | null
          read_at?: string | null
          recipient_account_id: string
          target_id?: string | null
          target_table?: string | null
          type_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          dedup_key?: string
          id?: string
          patient_id?: string | null
          read_at?: string | null
          recipient_account_id?: string
          target_id?: string | null
          target_table?: string | null
          type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_account_id_fkey"
            columns: ["recipient_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          answered_at: string
          comment: string | null
          created_at: string
          id: string
          score: number
          survey_id: string
          updated_at: string
        }
        Insert: {
          answered_at?: string
          comment?: string | null
          created_at?: string
          id?: string
          score: number
          survey_id: string
          updated_at?: string
        }
        Update: {
          answered_at?: string
          comment?: string | null
          created_at?: string
          id?: string
          score?: number
          survey_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: true
            referencedRelation: "nps_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_surveys: {
        Row: {
          created_at: string
          id: string
          milestone_axis: string
          milestone_id: string
          patient_id: string
          triggered_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          milestone_axis?: string
          milestone_id: string
          patient_id: string
          triggered_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          milestone_axis?: string
          milestone_id?: string
          patient_id?: string
          triggered_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_nps_surveys_milestone"
            columns: ["milestone_id", "milestone_axis"]
            isOneToOne: false
            referencedRelation: "treatment_phases"
            referencedColumns: ["id", "axis"]
          },
          {
            foreignKeyName: "nps_surveys_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_caregivers: {
        Row: {
          caregiver_id: string
          created_at: string
          granted_at: string
          id: string
          invitation_id: string | null
          patient_id: string
          revoked_at: string | null
          revoked_by_account: string | null
          status: Database["public"]["Enums"]["caregiver_link_status"]
          updated_at: string
        }
        Insert: {
          caregiver_id: string
          created_at?: string
          granted_at?: string
          id?: string
          invitation_id?: string | null
          patient_id: string
          revoked_at?: string | null
          revoked_by_account?: string | null
          status?: Database["public"]["Enums"]["caregiver_link_status"]
          updated_at?: string
        }
        Update: {
          caregiver_id?: string
          created_at?: string
          granted_at?: string
          id?: string
          invitation_id?: string | null
          patient_id?: string
          revoked_at?: string | null
          revoked_by_account?: string | null
          status?: Database["public"]["Enums"]["caregiver_link_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_caregivers_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "caregivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_caregivers_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "caregiver_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_caregivers_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_caregivers_revoked_by_account_fkey"
            columns: ["revoked_by_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_clinical_history: {
        Row: {
          created_at: string
          cycle_number: number | null
          description: string
          id: string
          kind: Database["public"]["Enums"]["clinical_history_kind"]
          patient_id: string
          recorded_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle_number?: number | null
          description: string
          id?: string
          kind: Database["public"]["Enums"]["clinical_history_kind"]
          patient_id: string
          recorded_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle_number?: number | null
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["clinical_history_kind"]
          patient_id?: string
          recorded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_clinical_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_clinical_history_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_content_states: {
        Row: {
          content_item_id: string
          created_at: string
          is_favorite: boolean
          patient_id: string
          read_at: string | null
          updated_at: string
        }
        Insert: {
          content_item_id: string
          created_at?: string
          is_favorite?: boolean
          patient_id: string
          read_at?: string | null
          updated_at?: string
        }
        Update: {
          content_item_id?: string
          created_at?: string
          is_favorite?: boolean
          patient_id?: string
          read_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_content_states_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_content_states_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_diagnoses: {
        Row: {
          cid10_id: string
          created_at: string
          diagnosed_on: string | null
          id: string
          is_primary: boolean
          patient_id: string
          recorded_by: string | null
          source: Database["public"]["Enums"]["field_source"]
          staging: string | null
          tnm: string | null
          updated_at: string
        }
        Insert: {
          cid10_id: string
          created_at?: string
          diagnosed_on?: string | null
          id?: string
          is_primary?: boolean
          patient_id: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["field_source"]
          staging?: string | null
          tnm?: string | null
          updated_at?: string
        }
        Update: {
          cid10_id?: string
          created_at?: string
          diagnosed_on?: string | null
          id?: string
          is_primary?: boolean
          patient_id?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["field_source"]
          staging?: string | null
          tnm?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_diagnoses_cid10_id_fkey"
            columns: ["cid10_id"]
            isOneToOne: false
            referencedRelation: "cid10"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_diagnoses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_diagnoses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_invitations: {
        Row: {
          accepted_at: string | null
          cancelled_at: string | null
          created_at: string
          destination: string
          expires_at: string
          id: string
          invited_by_account: string
          patient_id: string
          status: Database["public"]["Enums"]["patient_invitation_status"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          destination: string
          expires_at: string
          id?: string
          invited_by_account: string
          patient_id: string
          status?: Database["public"]["Enums"]["patient_invitation_status"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          destination?: string
          expires_at?: string
          id?: string
          invited_by_account?: string
          patient_id?: string
          status?: Database["public"]["Enums"]["patient_invitation_status"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_invitations_invited_by_account_fkey"
            columns: ["invited_by_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_invitations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          account_id: string | null
          address: Json | null
          birth_date: string
          clinical_source: Database["public"]["Enums"]["field_source"]
          clinical_synced_at: string | null
          cpf: string
          created_at: string
          demographics_source: Database["public"]["Enums"]["field_source"]
          demographics_synced_at: string | null
          documents: Json | null
          email: string | null
          full_name: string
          id: string
          insurance_name: string | null
          is_active: boolean
          phone: string | null
          treatment_phase_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          address?: Json | null
          birth_date: string
          clinical_source?: Database["public"]["Enums"]["field_source"]
          clinical_synced_at?: string | null
          cpf: string
          created_at?: string
          demographics_source?: Database["public"]["Enums"]["field_source"]
          demographics_synced_at?: string | null
          documents?: Json | null
          email?: string | null
          full_name: string
          id?: string
          insurance_name?: string | null
          is_active?: boolean
          phone?: string | null
          treatment_phase_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          address?: Json | null
          birth_date?: string
          clinical_source?: Database["public"]["Enums"]["field_source"]
          clinical_synced_at?: string | null
          cpf?: string
          created_at?: string
          demographics_source?: Database["public"]["Enums"]["field_source"]
          demographics_synced_at?: string | null
          documents?: Json | null
          email?: string | null
          full_name?: string
          id?: string
          insurance_name?: string | null
          is_active?: boolean
          phone?: string | null
          treatment_phase_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_patients_treatment_phase"
            columns: ["treatment_phase_id"]
            isOneToOne: false
            referencedRelation: "treatment_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          id: string
          label: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          label: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      professional_blocks: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          label: string | null
          professional_id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          label?: string | null
          professional_id: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          label?: string | null
          professional_id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_blocks_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_permissions: {
        Row: {
          granted_at: string
          granted_by_account: string | null
          id: string
          permission_id: string
          professional_id: string
          revoked_at: string | null
          revoked_by_account: string | null
        }
        Insert: {
          granted_at?: string
          granted_by_account?: string | null
          id?: string
          permission_id: string
          professional_id: string
          revoked_at?: string | null
          revoked_by_account?: string | null
        }
        Update: {
          granted_at?: string
          granted_by_account?: string | null
          id?: string
          permission_id?: string
          professional_id?: string
          revoked_at?: string | null
          revoked_by_account?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_professional_permissions_revoked_by"
            columns: ["revoked_by_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_permissions_granted_by_account_fkey"
            columns: ["granted_by_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_permissions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_specialties: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          is_primary: boolean
          professional_id: string
          specialty_id: string
          started_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          is_primary?: boolean
          professional_id: string
          specialty_id: string
          started_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          is_primary?: boolean
          professional_id?: string
          specialty_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_specialties_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_specialties_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          account_id: string
          council_registration: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          account_id: string
          council_registration: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          account_id?: string
          council_registration?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professionals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      security_settings: {
        Row: {
          id: number
          require_admin_mfa: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          require_admin_mfa?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          require_admin_mfa?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      specialties: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_confidential: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_confidential?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_confidential?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      specialty_notes: {
        Row: {
          author_professional_id: string
          authored_by: string
          body: string
          created_at: string
          id: string
          origin_specialty_id: string
          patient_id: string
          supersedes_note_id: string | null
          visibility: Database["public"]["Enums"]["clinical_visibility"]
        }
        Insert: {
          author_professional_id: string
          authored_by: string
          body: string
          created_at?: string
          id?: string
          origin_specialty_id: string
          patient_id: string
          supersedes_note_id?: string | null
          visibility?: Database["public"]["Enums"]["clinical_visibility"]
        }
        Update: {
          author_professional_id?: string
          authored_by?: string
          body?: string
          created_at?: string
          id?: string
          origin_specialty_id?: string
          patient_id?: string
          supersedes_note_id?: string | null
          visibility?: Database["public"]["Enums"]["clinical_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "specialty_notes_author_professional_id_fkey"
            columns: ["author_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specialty_notes_authored_by_fkey"
            columns: ["authored_by"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specialty_notes_origin_specialty_id_fkey"
            columns: ["origin_specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specialty_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specialty_notes_supersedes_note_id_fkey"
            columns: ["supersedes_note_id"]
            isOneToOne: true
            referencedRelation: "specialty_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      symptoms: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_psychological: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_psychological?: boolean
          label: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_psychological?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      treatment_phases: {
        Row: {
          axis: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          axis?: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          axis?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      treatment_plans: {
        Row: {
          created_at: string
          current_cycle_number: number | null
          current_cycle_started_on: string | null
          cycles_planned: number | null
          ended_on: string | null
          id: string
          intent: string | null
          patient_id: string
          protocol_name: string
          recorded_by: string | null
          source: Database["public"]["Enums"]["field_source"]
          started_on: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_cycle_number?: number | null
          current_cycle_started_on?: string | null
          cycles_planned?: number | null
          ended_on?: string | null
          id?: string
          intent?: string | null
          patient_id: string
          protocol_name: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["field_source"]
          started_on?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_cycle_number?: number | null
          current_cycle_started_on?: string | null
          cycles_planned?: number | null
          ended_on?: string | null
          id?: string
          intent?: string | null
          patient_id?: string
          protocol_name?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["field_source"]
          started_on?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      specialty_flags: {
        Row: {
          created_at: string | null
          flag_kind: Database["public"]["Enums"]["specialty_flag_kind"] | null
          id: string | null
          origin_specialty_id: string | null
          patient_id: string | null
          raised_by_professional_id: string | null
        }
        Insert: {
          created_at?: string | null
          flag_kind?: Database["public"]["Enums"]["specialty_flag_kind"] | null
          id?: string | null
          origin_specialty_id?: string | null
          patient_id?: string | null
          raised_by_professional_id?: string | null
        }
        Update: {
          created_at?: string | null
          flag_kind?: Database["public"]["Enums"]["specialty_flag_kind"] | null
          id?: string | null
          origin_specialty_id?: string | null
          patient_id?: string | null
          raised_by_professional_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_caregiver_invitation: {
        Args: { p_token: string }
        Returns: string
      }
      accept_legal_terms: { Args: never; Returns: number }
      accept_patient_invitation: {
        Args: { p_birth_date: string; p_cpf: string; p_token: string }
        Returns: string
      }
      add_patient_clinical_history: {
        Args: {
          p_description: string
          p_kind: Database["public"]["Enums"]["clinical_history_kind"]
          p_patient_id: string
        }
        Returns: string
      }
      assign_alert: {
        Args: { p_alert_id: string; p_professional_id: string }
        Returns: undefined
      }
      cancel_caregiver_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      cancel_patient_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      claim_alert: {
        Args: { p_alert_id: string }
        Returns: Database["public"]["Enums"]["alert_status"]
      }
      claim_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      claim_notification_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          give_up_at: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          notification_id: string
          provider_message_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      confirm_appointment: {
        Args: { p_appointment_id: string }
        Returns: undefined
      }
      confirm_external_link: {
        Args: { p_confirm: boolean; p_ref_id: string }
        Returns: undefined
      }
      create_admin: { Args: { p_account_id: string }; Returns: string }
      create_patient: {
        Args: {
          p_address?: Json
          p_birth_date: string
          p_cpf: string
          p_email?: string
          p_full_name: string
          p_insurance_name?: string
          p_phone?: string
        }
        Returns: string
      }
      create_professional: {
        Args: {
          p_account_id: string
          p_council_registration: string
          p_primary_specialty_id?: string
          p_specialty_ids: string[]
        }
        Returns: string
      }
      create_status_reason: {
        Args: {
          p_code: string
          p_label: string
          p_sort_order?: number
          p_status_code: string
        }
        Returns: string
      }
      decide_data_subject_request: {
        Args: {
          p_note?: string
          p_request_id: string
          p_status: Database["public"]["Enums"]["data_subject_request_status"]
        }
        Returns: undefined
      }
      disable_alert_rule: { Args: { p_symptom_id: string }; Returns: undefined }
      get_my_uid: { Args: never; Returns: string }
      grant_professional_permission: {
        Args: { p_code: string; p_professional_id: string }
        Returns: string
      }
      invite_caregiver: {
        Args: {
          p_channel: Database["public"]["Enums"]["caregiver_invitation_channel"]
          p_destination: string
        }
        Returns: {
          invitation_id: string
          token: string
        }[]
      }
      invite_patient: {
        Args: {
          p_destination?: string
          p_patient_id: string
          p_valid_for?: string
        }
        Returns: {
          invitation_id: string
          token: string
        }[]
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_delivery_result: {
        Args: {
          p_delivery_id: string
          p_error?: string
          p_next_attempt_at?: string
          p_provider_message_id?: string
          p_status: Database["public"]["Enums"]["notification_delivery_status"]
        }
        Returns: undefined
      }
      normalize_search_text: { Args: { p_text: string }; Returns: string }
      open_nps_survey: {
        Args: { p_milestone_code: string; p_patient_id: string }
        Returns: string
      }
      publish_legal_document: {
        Args: {
          p_body: string
          p_kind: Database["public"]["Enums"]["legal_document_kind"]
        }
        Returns: string
      }
      raise_specialty_flag: {
        Args: { p_source_note_id: string }
        Returns: string
      }
      read_alert_gemed_status: {
        Args: { p_alert_ids: string[] }
        Returns: {
          alert_id: string
          sent_at: string
          status: Database["public"]["Enums"]["gemed_outbox_status"]
        }[]
      }
      read_alerts: {
        Args: {
          p_before?: string
          p_limit?: number
          p_status?: Database["public"]["Enums"]["alert_status"]
        }
        Returns: {
          alert_rule_id: string
          assigned_at: string | null
          assigned_professional_id: string | null
          conduct_at: string | null
          conduct_kind: Database["public"]["Enums"]["alert_conduct_kind"] | null
          conduct_notes: string | null
          created_at: string
          diary_entry_id: string
          grade: number
          id: string
          patient_id: string
          resolved_at: string | null
          resolved_by_professional_id: string | null
          source_actor_kind: Database["public"]["Enums"]["diary_actor_kind"]
          status: Database["public"]["Enums"]["alert_status"]
          symptom_id: string
          symptom_report_id: string
          triaged_at: string | null
          triaged_by_professional_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "alerts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_appointments: {
        Args: {
          p_from?: string
          p_limit?: number
          p_patient_id: string
          p_to?: string
        }
        Returns: {
          appointment_type_id: string
          confirmed_at: string | null
          confirmed_by_account_id: string | null
          created_at: string
          created_by_account_id: string
          ends_at: string
          id: string
          location_address: string | null
          location_label: string
          location_phone: string | null
          origin_specialty_id: string | null
          patient_id: string
          patient_notes: string | null
          professional_id: string | null
          rescheduled_from_id: string | null
          starts_at: string
          status_id: string
          status_reason_id: string | null
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["clinical_visibility"]
        }[]
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_clinic_agenda: {
        Args: {
          p_appointment_type_id?: string
          p_from: string
          p_limit?: number
          p_offset?: number
          p_specialty_id?: string
          p_status_code?: string
          p_to: string
        }
        Returns: {
          appointment_type_id: string
          confirmed_at: string | null
          confirmed_by_account_id: string | null
          created_at: string
          created_by_account_id: string
          ends_at: string
          id: string
          location_address: string | null
          location_label: string
          location_phone: string | null
          origin_specialty_id: string | null
          patient_id: string
          patient_notes: string | null
          professional_id: string | null
          rescheduled_from_id: string | null
          starts_at: string
          status_id: string
          status_reason_id: string | null
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["clinical_visibility"]
        }[]
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_conversation_assignments: {
        Args: { p_conversation_id: string }
        Returns: {
          assigned_at: string
          conversation_id: string
          id: string
          professional_id: string
          released_at: string | null
          specialty_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "conversation_assignments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_conversations: {
        Args: { p_limit?: number; p_offset?: number; p_patient_id?: string }
        Returns: {
          assigned_professional_id: string | null
          created_at: string
          id: string
          last_message_at: string
          opened_by: string
          origin_specialty_id: string | null
          patient_id: string
          resolved_at: string | null
          resolved_by_professional_id: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          subject_id: string
          team_last_read_at: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["clinical_visibility"]
        }[]
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_diary_entries: {
        Args: { p_before?: string; p_limit?: number; p_patient_id: string }
        Returns: {
          acting_as: Database["public"]["Enums"]["diary_actor_kind"]
          authored_by: string
          created_at: string
          entry_date: string
          free_text: string | null
          id: string
          patient_id: string
          status: Database["public"]["Enums"]["diary_entry_status"]
          submitted_at: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "diary_entries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_diary_symptom_reports: {
        Args: { p_diary_entry_id: string }
        Returns: {
          created_at: string
          diary_entry_id: string
          grade: number
          id: string
          symptom_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "diary_symptom_reports"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_external_refs: {
        Args: {
          p_limit?: number
          p_link_status?: Database["public"]["Enums"]["external_link_status"]
          p_offset?: number
        }
        Returns: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          entity_type: string
          external_key: Json
          id: string
          link_status: Database["public"]["Enums"]["external_link_status"]
          local_id: string
          system: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "external_refs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_message_attachments: {
        Args: { p_conversation_id: string }
        Returns: {
          byte_size: number
          created_at: string
          id: string
          message_id: string
          mime_type: string
          storage_path: string
        }[]
        SetofOptions: {
          from: "*"
          to: "message_attachments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_messages: {
        Args: { p_before?: string; p_conversation_id: string; p_limit?: number }
        Returns: {
          author_account_id: string | null
          author_kind: Database["public"]["Enums"]["message_author_kind"]
          author_professional_id: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_my_agenda: {
        Args: { p_from: string; p_to: string }
        Returns: {
          appointment_type_id: string
          confirmed_at: string | null
          confirmed_by_account_id: string | null
          created_at: string
          created_by_account_id: string
          ends_at: string
          id: string
          location_address: string | null
          location_label: string
          location_phone: string | null
          origin_specialty_id: string | null
          patient_id: string
          patient_notes: string | null
          professional_id: string | null
          rescheduled_from_id: string | null
          starts_at: string
          status_id: string
          status_reason_id: string | null
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["clinical_visibility"]
        }[]
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_patient: {
        Args: { p_patient_id: string }
        Returns: {
          account_id: string | null
          address: Json | null
          birth_date: string
          clinical_source: Database["public"]["Enums"]["field_source"]
          clinical_synced_at: string | null
          cpf: string
          created_at: string
          demographics_source: Database["public"]["Enums"]["field_source"]
          demographics_synced_at: string | null
          documents: Json | null
          email: string | null
          full_name: string
          id: string
          insurance_name: string | null
          is_active: boolean
          phone: string | null
          treatment_phase_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "patients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_patient_alerts: {
        Args: { p_before?: string; p_limit?: number; p_patient_id: string }
        Returns: {
          alert_rule_id: string
          assigned_at: string | null
          assigned_professional_id: string | null
          conduct_at: string | null
          conduct_kind: Database["public"]["Enums"]["alert_conduct_kind"] | null
          conduct_notes: string | null
          created_at: string
          diary_entry_id: string
          grade: number
          id: string
          patient_id: string
          resolved_at: string | null
          resolved_by_professional_id: string | null
          source_actor_kind: Database["public"]["Enums"]["diary_actor_kind"]
          status: Database["public"]["Enums"]["alert_status"]
          symptom_id: string
          symptom_report_id: string
          triaged_at: string | null
          triaged_by_professional_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "alerts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_patient_clinical_history: {
        Args: { p_patient_id: string }
        Returns: {
          created_at: string
          cycle_number: number | null
          description: string
          id: string
          kind: Database["public"]["Enums"]["clinical_history_kind"]
          patient_id: string
          recorded_by: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "patient_clinical_history"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_patient_diagnoses: {
        Args: { p_patient_id: string }
        Returns: {
          cid10_id: string
          created_at: string
          diagnosed_on: string | null
          id: string
          is_primary: boolean
          patient_id: string
          recorded_by: string | null
          source: Database["public"]["Enums"]["field_source"]
          staging: string | null
          tnm: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "patient_diagnoses"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_patient_list: {
        Args: {
          p_cid10_code?: string
          p_is_active?: boolean
          p_limit?: number
          p_offset?: number
          p_order_by?: string
          p_order_desc?: boolean
          p_protocol?: string
          p_search?: string
          p_treatment_phase_id?: string
        }
        Returns: {
          birth_date: string
          cpf_masked: string
          current_cycle_number: number
          full_name: string
          has_account: boolean
          is_active: boolean
          patient_id: string
          primary_cid10_code: string
          primary_cid10_label: string
          protocol_name: string
          total_count: number
          treatment_phase_id: string
          treatment_phase_label: string
        }[]
      }
      read_patients: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          account_id: string | null
          address: Json | null
          birth_date: string
          clinical_source: Database["public"]["Enums"]["field_source"]
          clinical_synced_at: string | null
          cpf: string
          created_at: string
          demographics_source: Database["public"]["Enums"]["field_source"]
          demographics_synced_at: string | null
          documents: Json | null
          email: string | null
          full_name: string
          id: string
          insurance_name: string | null
          is_active: boolean
          phone: string | null
          treatment_phase_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "patients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_specialty_flags: {
        Args: { p_patient_id: string }
        Returns: {
          created_at: string | null
          flag_kind: Database["public"]["Enums"]["specialty_flag_kind"] | null
          id: string | null
          origin_specialty_id: string | null
          patient_id: string | null
          raised_by_professional_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "specialty_flags"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_specialty_notes: {
        Args: { p_before?: string; p_limit?: number; p_patient_id: string }
        Returns: {
          author_professional_id: string
          authored_by: string
          body: string
          created_at: string
          id: string
          origin_specialty_id: string
          patient_id: string
          supersedes_note_id: string | null
          visibility: Database["public"]["Enums"]["clinical_visibility"]
        }[]
        SetofOptions: {
          from: "*"
          to: "specialty_notes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_treatment_plans: {
        Args: { p_patient_id: string }
        Returns: {
          created_at: string
          current_cycle_number: number | null
          current_cycle_started_on: string | null
          cycles_planned: number | null
          ended_on: string | null
          id: string
          intent: string | null
          patient_id: string
          protocol_name: string
          recorded_by: string | null
          source: Database["public"]["Enums"]["field_source"]
          started_on: string | null
          synced_at: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "treatment_plans"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      register_device_token: {
        Args: {
          p_platform: Database["public"]["Enums"]["device_platform"]
          p_token: string
        }
        Returns: string
      }
      request_data_subject_action: {
        Args: {
          p_request_type: Database["public"]["Enums"]["data_subject_request_type"]
        }
        Returns: string
      }
      reschedule_appointment: {
        Args: {
          p_appointment_id: string
          p_ends_at: string
          p_reason_id?: string
          p_starts_at: string
        }
        Returns: string
      }
      resolve_alert: {
        Args: {
          p_alert_id: string
          p_conduct_kind: Database["public"]["Enums"]["alert_conduct_kind"]
          p_conduct_notes?: string
        }
        Returns: undefined
      }
      resolve_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      review_content_version: {
        Args: {
          p_action: Database["public"]["Enums"]["content_review_action"]
          p_comment?: string
          p_content_version_id: string
        }
        Returns: Database["public"]["Enums"]["content_status"]
      }
      revoke_caregiver_link: { Args: { p_link_id: string }; Returns: undefined }
      revoke_consent: { Args: { p_consent_id: string }; Returns: undefined }
      revoke_professional_permission: {
        Args: { p_code: string; p_professional_id: string }
        Returns: undefined
      }
      schedule_appointment: {
        Args: {
          p_appointment_type_id: string
          p_ends_at: string
          p_location_address?: string
          p_location_label: string
          p_location_phone?: string
          p_origin_specialty_id?: string
          p_patient_id: string
          p_patient_notes?: string
          p_professional_id?: string
          p_starts_at: string
          p_title: string
        }
        Returns: string
      }
      set_account_active: {
        Args: { p_account_id: string; p_is_active: boolean }
        Returns: undefined
      }
      set_alert_rule: {
        Args: { p_min_grade: number; p_symptom_id: string }
        Returns: string
      }
      set_appointment_status: {
        Args: {
          p_appointment_id: string
          p_reason_id?: string
          p_status_code: string
        }
        Returns: undefined
      }
      set_patient_active: {
        Args: { p_is_active: boolean; p_patient_id: string }
        Returns: undefined
      }
      set_professional_active: {
        Args: { p_is_active: boolean; p_professional_id: string }
        Returns: undefined
      }
      set_professional_specialties: {
        Args: {
          p_primary_specialty_id?: string
          p_professional_id: string
          p_specialty_ids: string[]
        }
        Returns: undefined
      }
      set_require_admin_mfa: {
        Args: { p_required: boolean }
        Returns: undefined
      }
      set_status_reason_active: {
        Args: { p_is_active: boolean; p_reason_id: string }
        Returns: undefined
      }
      set_treatment_phase: {
        Args: { p_patient_id: string; p_phase_code: string }
        Returns: undefined
      }
      set_treatment_plan: {
        Args: {
          p_cycles_planned?: number
          p_intent?: string
          p_patient_id: string
          p_protocol_name: string
          p_started_on?: string
        }
        Returns: string
      }
      start_conversation: {
        Args: { p_body: string; p_subject_id: string }
        Returns: string
      }
      summarize_appointments: {
        Args: {
          p_appointment_type_id?: string
          p_from: string
          p_granularity?: string
          p_specialty_id?: string
          p_to: string
        }
        Returns: {
          appointment_count: number
          appointment_type_id: string
          appointment_type_label: string
          bucket_start: string
          confirmed_count: number
          patient_count: number
          specialty_id: string
          specialty_label: string
          status_code: string
          status_label: string
          status_reason_id: string
          status_reason_label: string
        }[]
      }
      summarize_chat_response_times: {
        Args: {
          p_from: string
          p_granularity?: string
          p_specialty_id?: string
          p_to: string
        }
        Returns: {
          answered_count: number
          bucket_start: string
          conversation_count: number
          first_response_avg_seconds: number
          first_response_median_seconds: number
          first_response_p90_seconds: number
          specialty_id: string
          specialty_label: string
          unanswered_count: number
        }[]
      }
      summarize_symptoms_by_protocol: {
        Args: {
          p_from: string
          p_protocol?: string
          p_symptom_id?: string
          p_to: string
        }
        Returns: {
          grade: number
          patient_count: number
          protocol_name: string
          report_count: number
          symptom_id: string
          symptom_label: string
        }[]
      }
      transfer_conversation: {
        Args: { p_conversation_id: string; p_to_professional_id: string }
        Returns: undefined
      }
      unconfirm_appointment: {
        Args: { p_appointment_id: string }
        Returns: undefined
      }
      unlink_patient_account: {
        Args: { p_patient_id: string }
        Returns: undefined
      }
      unregister_device_token: { Args: { p_token: string }; Returns: undefined }
      update_patient: {
        Args: {
          p_address?: Json
          p_birth_date?: string
          p_cpf?: string
          p_email?: string
          p_full_name?: string
          p_insurance_name?: string
          p_patient_id: string
          p_phone?: string
        }
        Returns: undefined
      }
      update_professional: {
        Args: { p_council_registration: string; p_professional_id: string }
        Returns: undefined
      }
      update_status_reason: {
        Args: { p_label?: string; p_reason_id: string; p_sort_order?: number }
        Returns: undefined
      }
      upsert_patient_diagnosis: {
        Args: {
          p_cid10_id: string
          p_diagnosed_on?: string
          p_is_primary?: boolean
          p_patient_id: string
          p_staging?: string
          p_tnm?: string
        }
        Returns: string
      }
      uuid_generate_v7: { Args: never; Returns: string }
    }
    Enums: {
      alert_conduct_kind: "guidance" | "scheduling" | "referral"
      alert_status: "open" | "in_progress" | "resolved"
      audit_action: "read" | "create" | "update" | "delete"
      audit_actor_capacity:
        | "patient"
        | "caregiver"
        | "professional"
        | "admin"
        | "system"
      caregiver_invitation_channel: "sms" | "email"
      caregiver_invitation_status: "pending" | "accepted" | "cancelled"
      caregiver_link_status: "active" | "revoked"
      clinical_history_kind: "allergy" | "prior_reaction"
      clinical_visibility: "team" | "specialty_restricted"
      content_media_kind: "text" | "video" | "pdf"
      content_review_action: "approve" | "return" | "reject" | "unpublish"
      content_status: "draft" | "in_review" | "published" | "archived"
      conversation_status: "open" | "resolved"
      data_subject_request_status:
        | "requested"
        | "under_review"
        | "granted"
        | "executed"
        | "refused"
      data_subject_request_type:
        | "access"
        | "rectification"
        | "portability"
        | "consent_revocation"
        | "deletion"
      device_platform: "ios" | "android" | "web"
      diary_actor_kind: "patient" | "caregiver"
      diary_entry_status: "draft" | "saved"
      external_link_status: "proposed" | "confirmed" | "rejected"
      field_source: "local" | "gemed"
      gemed_outbox_status:
        | "pending"
        | "sending"
        | "sent"
        | "failed"
        | "given_up"
      legal_document_kind: "terms_of_use" | "privacy_policy"
      message_author_kind: "patient" | "caregiver" | "professional" | "system"
      notification_channel: "push" | "sms" | "email"
      notification_delivery_status:
        | "pending"
        | "sending"
        | "sent"
        | "failed"
        | "skipped"
        | "given_up"
      patient_invitation_status: "pending" | "accepted" | "cancelled"
      specialty_flag_kind: "distress"
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
    Enums: {
      alert_conduct_kind: ["guidance", "scheduling", "referral"],
      alert_status: ["open", "in_progress", "resolved"],
      audit_action: ["read", "create", "update", "delete"],
      audit_actor_capacity: [
        "patient",
        "caregiver",
        "professional",
        "admin",
        "system",
      ],
      caregiver_invitation_channel: ["sms", "email"],
      caregiver_invitation_status: ["pending", "accepted", "cancelled"],
      caregiver_link_status: ["active", "revoked"],
      clinical_history_kind: ["allergy", "prior_reaction"],
      clinical_visibility: ["team", "specialty_restricted"],
      content_media_kind: ["text", "video", "pdf"],
      content_review_action: ["approve", "return", "reject", "unpublish"],
      content_status: ["draft", "in_review", "published", "archived"],
      conversation_status: ["open", "resolved"],
      data_subject_request_status: [
        "requested",
        "under_review",
        "granted",
        "executed",
        "refused",
      ],
      data_subject_request_type: [
        "access",
        "rectification",
        "portability",
        "consent_revocation",
        "deletion",
      ],
      device_platform: ["ios", "android", "web"],
      diary_actor_kind: ["patient", "caregiver"],
      diary_entry_status: ["draft", "saved"],
      external_link_status: ["proposed", "confirmed", "rejected"],
      field_source: ["local", "gemed"],
      gemed_outbox_status: ["pending", "sending", "sent", "failed", "given_up"],
      legal_document_kind: ["terms_of_use", "privacy_policy"],
      message_author_kind: ["patient", "caregiver", "professional", "system"],
      notification_channel: ["push", "sms", "email"],
      notification_delivery_status: [
        "pending",
        "sending",
        "sent",
        "failed",
        "skipped",
        "given_up",
      ],
      patient_invitation_status: ["pending", "accepted", "cancelled"],
      specialty_flag_kind: ["distress"],
    },
  },
} as const
