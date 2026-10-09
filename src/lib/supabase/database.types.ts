export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      bookings: {
        Row: {
          attended_at: string | null
          booked_by: Database["public"]["Enums"]["booked_by"]
          booked_by_staff_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          center_id: string
          created_at: string
          id: string
          member_id: string
          member_pass_id: string | null
          pass_deducted: boolean
          promoted_at: string | null
          session_id: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          waitlist_position: number | null
        }
        Insert: {
          attended_at?: string | null
          booked_by?: Database["public"]["Enums"]["booked_by"]
          booked_by_staff_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          center_id: string
          created_at?: string
          id?: string
          member_id: string
          member_pass_id?: string | null
          pass_deducted?: boolean
          promoted_at?: string | null
          session_id: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          waitlist_position?: number | null
        }
        Update: {
          attended_at?: string | null
          booked_by?: Database["public"]["Enums"]["booked_by"]
          booked_by_staff_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          center_id?: string
          created_at?: string
          id?: string
          member_id?: string
          member_pass_id?: string | null
          pass_deducted?: boolean
          promoted_at?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_member_fk"
            columns: ["member_id", "center_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "bookings_pass_center_fk"
            columns: ["member_pass_id", "center_id"]
            isOneToOne: false
            referencedRelation: "member_passes"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "bookings_pass_member_fk"
            columns: ["member_pass_id", "member_id"]
            isOneToOne: false
            referencedRelation: "member_passes"
            referencedColumns: ["id", "member_id"]
          },
          {
            foreignKeyName: "bookings_session_fk"
            columns: ["session_id", "center_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "bookings_staff_fk"
            columns: ["booked_by_staff_id", "center_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      centers: {
        Row: {
          address: string | null
          booking_settings: NonNullable<Json>
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          notify_sms_fallback: boolean
          phone: string | null
          plan_id: string | null
          status: Database["public"]["Enums"]["center_status"]
          status_changed_at: string | null
          timezone: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          booking_settings?: NonNullable<Json>
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          notify_sms_fallback?: boolean
          phone?: string | null
          plan_id?: string | null
          status?: Database["public"]["Enums"]["center_status"]
          status_changed_at?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          booking_settings?: NonNullable<Json>
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          notify_sms_fallback?: boolean
          phone?: string | null
          plan_id?: string | null
          status?: Database["public"]["Enums"]["center_status"]
          status_changed_at?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "centers_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          center_id: string
          created_at: string
          due_date: string
          id: string
          memo: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          plan_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          center_id: string
          created_at?: string
          due_date: string
          id?: string
          memo?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          center_id?: string
          created_at?: string
          due_date?: string
          id?: string
          memo?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      member_invites: {
        Row: {
          center_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          member_id: string
          revoked_at: string | null
          token_hash: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          center_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          member_id: string
          revoked_at?: string | null
          token_hash: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          center_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          member_id?: string
          revoked_at?: string | null
          token_hash?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_invites_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_invites_created_by_fk"
            columns: ["created_by", "center_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "member_invites_member_fk"
            columns: ["member_id", "center_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      member_passes: {
        Row: {
          center_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          end_date: string | null
          id: string
          member_id: string
          memo: string | null
          name: string
          paid_amount: number
          paid_at: string | null
          period_limit_count: number | null
          period_limit_unit: Database["public"]["Enums"]["period_unit"] | null
          product_id: string | null
          remaining_count: number | null
          start_date: string
          status: Database["public"]["Enums"]["pass_status"]
          total_count: number | null
          type: Database["public"]["Enums"]["pass_type"]
          updated_at: string
        }
        Insert: {
          center_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          member_id: string
          memo?: string | null
          name: string
          paid_amount?: number
          paid_at?: string | null
          period_limit_count?: number | null
          period_limit_unit?: Database["public"]["Enums"]["period_unit"] | null
          product_id?: string | null
          remaining_count?: number | null
          start_date: string
          status?: Database["public"]["Enums"]["pass_status"]
          total_count?: number | null
          type: Database["public"]["Enums"]["pass_type"]
          updated_at?: string
        }
        Update: {
          center_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          member_id?: string
          memo?: string | null
          name?: string
          paid_amount?: number
          paid_at?: string | null
          period_limit_count?: number | null
          period_limit_unit?: Database["public"]["Enums"]["period_unit"] | null
          product_id?: string | null
          remaining_count?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["pass_status"]
          total_count?: number | null
          type?: Database["public"]["Enums"]["pass_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_passes_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_passes_created_by_fk"
            columns: ["created_by", "center_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "member_passes_member_fk"
            columns: ["member_id", "center_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "member_passes_product_fk"
            columns: ["product_id", "center_id"]
            isOneToOne: false
            referencedRelation: "pass_products"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      members: {
        Row: {
          birth: string | null
          center_id: string
          created_at: string
          deleted_at: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          id: string
          joined_at: string
          marketing_agreed_at: string | null
          memo: string | null
          name: string
          notify_enabled: boolean
          onboarded_at: string | null
          phone: string | null
          phone_last4: string | null
          privacy_agreed_at: string | null
          status: Database["public"]["Enums"]["member_status"]
          tags: string[]
          updated_at: string
          user_id: string | null
          withdrawn_at: string | null
        }
        Insert: {
          birth?: string | null
          center_id: string
          created_at?: string
          deleted_at?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          joined_at?: string
          marketing_agreed_at?: string | null
          memo?: string | null
          name: string
          notify_enabled?: boolean
          onboarded_at?: string | null
          phone?: string | null
          phone_last4?: never
          privacy_agreed_at?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          tags?: string[]
          updated_at?: string
          user_id?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          birth?: string | null
          center_id?: string
          created_at?: string
          deleted_at?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          joined_at?: string
          marketing_agreed_at?: string | null
          memo?: string | null
          name?: string
          notify_enabled?: boolean
          onboarded_at?: string | null
          phone?: string | null
          phone_last4?: never
          privacy_agreed_at?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          tags?: string[]
          updated_at?: string
          user_id?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          attempts: number
          center_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          dedupe_key: string | null
          error: string | null
          fallback_used: boolean
          id: string
          locked_at: string | null
          member_id: string | null
          payload: NonNullable<Json>
          provider: string | null
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template_code: string
          type: string
        }
        Insert: {
          attempts?: number
          center_id: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          fallback_used?: boolean
          id?: string
          locked_at?: string | null
          member_id?: string | null
          payload?: NonNullable<Json>
          provider?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_code: string
          type: string
        }
        Update: {
          attempts?: number
          center_id?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          fallback_used?: boolean
          id?: string
          locked_at?: string | null
          member_id?: string | null
          payload?: NonNullable<Json>
          provider?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_code?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_member_fk"
            columns: ["member_id", "center_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      pass_holds: {
        Row: {
          center_id: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          member_pass_id: string
          reason: string | null
          start_date: string
        }
        Insert: {
          center_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          member_pass_id: string
          reason?: string | null
          start_date: string
        }
        Update: {
          center_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          member_pass_id?: string
          reason?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "pass_holds_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pass_holds_created_by_fk"
            columns: ["created_by", "center_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "pass_holds_pass_fk"
            columns: ["member_pass_id", "center_id"]
            isOneToOne: false
            referencedRelation: "member_passes"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      pass_products: {
        Row: {
          center_id: string
          created_at: string
          deleted_at: string | null
          duration_days: number | null
          id: string
          is_active: boolean
          name: string
          period_limit_count: number | null
          period_limit_unit: Database["public"]["Enums"]["period_unit"] | null
          price: number
          sort_order: number
          total_count: number | null
          type: Database["public"]["Enums"]["pass_type"]
          updated_at: string
        }
        Insert: {
          center_id: string
          created_at?: string
          deleted_at?: string | null
          duration_days?: number | null
          id?: string
          is_active?: boolean
          name: string
          period_limit_count?: number | null
          period_limit_unit?: Database["public"]["Enums"]["period_unit"] | null
          price?: number
          sort_order?: number
          total_count?: number | null
          type: Database["public"]["Enums"]["pass_type"]
          updated_at?: string
        }
        Update: {
          center_id?: string
          created_at?: string
          deleted_at?: string | null
          duration_days?: number | null
          id?: string
          is_active?: boolean
          name?: string
          period_limit_count?: number | null
          period_limit_unit?: Database["public"]["Enums"]["period_unit"] | null
          price?: number
          sort_order?: number
          total_count?: number | null
          type?: Database["public"]["Enums"]["pass_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pass_products_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          max_members: number | null
          max_staff: number | null
          monthly_price: number
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_members?: number | null
          max_staff?: number | null
          monthly_price: number
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_members?: number | null
          max_staff?: number | null
          monthly_price?: number
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_center_notes: {
        Row: {
          center_id: string
          memo: string
          updated_at: string
        }
        Insert: {
          center_id: string
          memo?: string
          updated_at?: string
        }
        Update: {
          center_id?: string
          memo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_center_notes_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: true
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      program_allowed_products: {
        Row: {
          center_id: string
          created_at: string
          product_id: string
          program_id: string
        }
        Insert: {
          center_id: string
          created_at?: string
          product_id: string
          program_id: string
        }
        Update: {
          center_id?: string
          created_at?: string
          product_id?: string
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_allowed_products_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_allowed_products_product_fk"
            columns: ["product_id", "center_id"]
            isOneToOne: false
            referencedRelation: "pass_products"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "program_allowed_products_program_fk"
            columns: ["program_id", "center_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      programs: {
        Row: {
          center_id: string
          color: string
          created_at: string
          default_capacity: number
          default_instructor_id: string | null
          deleted_at: string | null
          description: string | null
          duration_min: number
          id: string
          is_active: boolean
          name: string
          sort_order: number
          type: Database["public"]["Enums"]["program_type"]
          updated_at: string
        }
        Insert: {
          center_id: string
          color?: string
          created_at?: string
          default_capacity?: number
          default_instructor_id?: string | null
          deleted_at?: string | null
          description?: string | null
          duration_min?: number
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          type?: Database["public"]["Enums"]["program_type"]
          updated_at?: string
        }
        Update: {
          center_id?: string
          color?: string
          created_at?: string
          default_capacity?: number
          default_instructor_id?: string | null
          deleted_at?: string | null
          description?: string | null
          duration_min?: number
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          type?: Database["public"]["Enums"]["program_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_instructor_fk"
            columns: ["default_instructor_id", "center_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          center_id: string
          created_at: string
          endpoint: string
          id: string
          member_id: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          center_id: string
          created_at?: string
          endpoint: string
          id?: string
          member_id: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          center_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          member_id?: string
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_member_fk"
            columns: ["member_id", "center_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      sessions: {
        Row: {
          booked_count: number
          cancel_reason: string | null
          cancelled_at: string | null
          capacity: number
          center_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_at: string
          id: string
          instructor_id: string | null
          note: string | null
          program_id: string
          recurrence_group_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          updated_at: string
          waitlist_count: number
        }
        Insert: {
          booked_count?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          capacity: number
          center_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at: string
          id?: string
          instructor_id?: string | null
          note?: string | null
          program_id: string
          recurrence_group_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          waitlist_count?: number
        }
        Update: {
          booked_count?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          capacity?: number
          center_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string
          id?: string
          instructor_id?: string | null
          note?: string | null
          program_id?: string
          recurrence_group_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          waitlist_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_created_by_fk"
            columns: ["created_by", "center_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "sessions_instructor_fk"
            columns: ["instructor_id", "center_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "sessions_program_fk"
            columns: ["program_id", "center_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      staff: {
        Row: {
          center_id: string
          color: string
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          invited_at: string | null
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["staff_role"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          center_id: string
          color?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          invited_at?: string | null
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          center_id?: string
          color?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          invited_at?: string | null
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_member_invite: { Args: { p_token: string }; Returns: Json }
      admin_find_user_id_by_email: {
        Args: { p_email: string }
        Returns: string
      }
      book_session: {
        Args: { p_member_pass_id?: string; p_session_id: string }
        Returns: Json
      }
      cancel_booking: {
        Args: { p_booking_id: string; p_waive_penalty?: boolean }
        Returns: Json
      }
      cancel_session: {
        Args: { p_reason?: string; p_session_id: string }
        Returns: Json
      }
      center_plan_usage: { Args: { p_center_id: string }; Returns: Json }
      center_stats: {
        Args: { p_center_id: string; p_count?: number; p_unit: string }
        Returns: {
          attended: number
          bookings: number
          bucket: string
          new_members: number
          renewals: number
        }[]
      }
      claim_notifications: {
        Args: { p_center_id?: string; p_limit?: number }
        Returns: {
          attempts: number
          center_id: string
          center_name: string
          center_timezone: string
          id: string
          member_id: string
          member_name: string
          payload: Json
          phone: string
          push_subscriptions: Json
          sms_fallback: boolean
          template_code: string
          type: string
        }[]
      }
      complete_onboarding: {
        Args: { p_marketing_agreed?: boolean }
        Returns: Json
      }
      create_hold: {
        Args: {
          p_end_date: string
          p_member_pass_id: string
          p_reason?: string
          p_start_date: string
        }
        Returns: Json
      }
      create_member_invite: {
        Args: { p_invite_url_base?: string; p_member_id: string }
        Returns: Json
      }
      delete_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      enqueue_scheduled_notifications: {
        Args: { p_center_id?: string; p_now?: string }
        Returns: number
      }
      finish_notification: {
        Args: {
          p_error?: string
          p_fallback_used?: boolean
          p_id: string
          p_ok: boolean
          p_provider?: string
          p_retry?: boolean
        }
        Returns: Database["public"]["Enums"]["notification_status"]
      }
      get_invite: { Args: { p_token: string }; Returns: Json }
      grant_member_pass: {
        Args: {
          p_member_id: string
          p_memo?: string
          p_paid_amount: number
          p_paid_at?: string
          p_product_id: string
          p_start_date: string
        }
        Returns: Json
      }
      import_members: {
        Args: { p_center_id: string; p_rows: Json }
        Returns: Json
      }
      member_bookings: {
        Args: { p_center_id: string; p_limit?: number; p_upcoming: boolean }
        Returns: {
          booking_id: string
          cancel_reason: string
          ends_at: string
          instructor_name: string
          pass_name: string
          pass_type: Database["public"]["Enums"]["pass_type"]
          program_color: string
          program_name: string
          session_id: string
          session_status: Database["public"]["Enums"]["session_status"]
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          waitlist_position: number
        }[]
      }
      member_schedule: {
        Args: { p_center_id: string; p_from: string; p_to: string }
        Returns: {
          booked_count: number
          capacity: number
          ends_at: string
          instructor_name: string
          my_booking_id: string
          my_pass_type: Database["public"]["Enums"]["pass_type"]
          my_status: Database["public"]["Enums"]["booking_status"]
          my_waitlist_position: number
          program_color: string
          program_id: string
          program_name: string
          session_id: string
          starts_at: string
          waitlist_count: number
        }[]
      }
      my_blocked_centers: {
        Args: Record<PropertyKey, never>
        Returns: {
          center_id: string
          center_name: string
          status: Database["public"]["Enums"]["center_status"]
          via: string
        }[]
      }
      my_memberships: {
        Args: Record<PropertyKey, never>
        Returns: {
          center_id: string
          center_name: string
          center_timezone: string
          marketing_agreed_at: string
          member_id: string
          name: string
          notify_enabled: boolean
          onboarded_at: string
        }[]
      }
      platform_centers: {
        Args: {
          p_center_id?: string
          p_query?: string
          p_status?: Database["public"]["Enums"]["center_status"]
        }
        Returns: {
          address: string
          created_at: string
          id: string
          max_members: number
          max_staff: number
          member_count: number
          memo: string
          monthly_price: number
          name: string
          overdue_count: number
          owner_email: string
          owner_linked: boolean
          owner_name: string
          phone: string
          plan_id: string
          plan_name: string
          staff_count: number
          status: Database["public"]["Enums"]["center_status"]
          status_changed_at: string
          trial_ends_at: string
          unpaid_amount: number
          unpaid_count: number
        }[]
      }
      platform_create_center: {
        Args: {
          p_address?: string
          p_name: string
          p_owner_email: string
          p_owner_name: string
          p_phone?: string
          p_plan_id: string
          p_status: Database["public"]["Enums"]["center_status"]
          p_trial_ends_at?: string
        }
        Returns: Json
      }
      platform_create_invoice: {
        Args: {
          p_amount: number
          p_center_id: string
          p_due_date: string
          p_memo?: string
          p_period_end: string
          p_period_start: string
        }
        Returns: string
      }
      platform_issue_monthly_invoices: {
        Args: { p_month: string }
        Returns: number
      }
      platform_set_invoice_status: {
        Args: {
          p_invoice_id: string
          p_paid_at?: string
          p_status: Database["public"]["Enums"]["invoice_status"]
        }
        Returns: Json
      }
      platform_summary: { Args: { p_month?: string }; Returns: Json }
      platform_update_center: {
        Args: {
          p_center_id: string
          p_memo?: string
          p_plan_id: string
          p_status: Database["public"]["Enums"]["center_status"]
          p_trial_ends_at?: string
        }
        Returns: Json
      }
      preview_booking: { Args: { p_session_id: string }; Returns: Json }
      remove_push_subscriptions: {
        Args: { p_endpoints: string[] }
        Returns: number
      }
      repeat_last_week_candidates: {
        Args: { p_center_id: string }
        Returns: {
          bookable: boolean
          booked_count: number
          capacity: number
          ends_at: string
          instructor_name: string
          program_color: string
          program_name: string
          session_id: string
          starts_at: string
          waitlist_count: number
        }[]
      }
      save_program: {
        Args: {
          p_allowed_product_ids: string[]
          p_center_id: string
          p_color: string
          p_default_capacity: number
          p_default_instructor_id?: string
          p_description?: string
          p_duration_min: number
          p_id?: string
          p_name: string
          p_type: Database["public"]["Enums"]["program_type"]
        }
        Returns: string
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_center_id: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      search_members: {
        Args: {
          p_center_id: string
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_sort?: string
        }
        Returns: {
          id: string
          joined_at: string
          linked: boolean
          name: string
          pass_days_left: number
          pass_end_date: string
          pass_id: string
          pass_name: string
          pass_remaining: number
          pass_state: string
          pass_type: Database["public"]["Enums"]["pass_type"]
          phone: string
          tags: string[]
          total_count: number
        }[]
      }
      set_attendance: {
        Args: {
          p_booking_id: string
          p_status: Database["public"]["Enums"]["booking_status"]
        }
        Returns: Json
      }
      staff_book_for_member: {
        Args: {
          p_allow_over_capacity?: boolean
          p_member_id: string
          p_member_pass_id?: string
          p_override_rules?: boolean
          p_session_id: string
          p_waitlist?: boolean
        }
        Returns: Json
      }
      today_followups: {
        Args: { p_center_id: string; p_limit?: number }
        Returns: {
          days_left: number
          last_attended_at: string
          member_id: string
          name: string
          pass_id: string
          pass_name: string
          phone: string
          reason: string
          remaining: number
        }[]
      }
      today_summary: {
        Args: { p_center_id: string; p_date?: string }
        Returns: Json
      }
      update_my_settings: {
        Args: {
          p_center_id: string
          p_marketing_agreed: boolean
          p_notify_enabled: boolean
        }
        Returns: undefined
      }
      update_session: {
        Args: {
          p_capacity?: number
          p_clear_instructor?: boolean
          p_ends_at?: string
          p_instructor_id?: string
          p_note?: string
          p_notify?: boolean
          p_scope?: string
          p_session_id: string
          p_starts_at?: string
        }
        Returns: Json
      }
      withdraw_member: { Args: { p_member_id: string }; Returns: Json }
    }
    Enums: {
      booked_by: "member" | "staff"
      booking_status:
        | "booked"
        | "waitlisted"
        | "cancelled"
        | "late_cancelled"
        | "attended"
        | "no_show"
      center_status: "trial" | "active" | "suspended" | "closed"
      gender: "male" | "female" | "other"
      invoice_status: "pending" | "paid" | "void"
      member_status: "active" | "withdrawn"
      notification_channel: "alimtalk" | "sms" | "webpush"
      notification_status: "pending" | "sending" | "sent" | "failed" | "skipped"
      pass_status: "active" | "cancelled"
      pass_type: "period" | "count" | "period_count"
      period_unit: "week" | "month"
      program_type: "group" | "private"
      session_status: "scheduled" | "cancelled"
      staff_role: "owner" | "staff"
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
      booked_by: ["member", "staff"],
      booking_status: [
        "booked",
        "waitlisted",
        "cancelled",
        "late_cancelled",
        "attended",
        "no_show",
      ],
      center_status: ["trial", "active", "suspended", "closed"],
      gender: ["male", "female", "other"],
      invoice_status: ["pending", "paid", "void"],
      member_status: ["active", "withdrawn"],
      notification_channel: ["alimtalk", "sms", "webpush"],
      notification_status: ["pending", "sending", "sent", "failed", "skipped"],
      pass_status: ["active", "cancelled"],
      pass_type: ["period", "count", "period_count"],
      period_unit: ["week", "month"],
      program_type: ["group", "private"],
      session_status: ["scheduled", "cancelled"],
      staff_role: ["owner", "staff"],
    },
  },
} as const

