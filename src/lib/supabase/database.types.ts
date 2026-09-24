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
          phone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          booking_settings?: NonNullable<Json>
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          booking_settings?: NonNullable<Json>
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
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
          member_id: string | null
          payload: NonNullable<Json>
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
          member_id?: string | null
          payload?: NonNullable<Json>
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
          member_id?: string | null
          payload?: NonNullable<Json>
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
      sessions: {
        Row: {
          booked_count: number
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
      [_ in never]: never
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
      gender: "male" | "female" | "other"
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
      gender: ["male", "female", "other"],
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

