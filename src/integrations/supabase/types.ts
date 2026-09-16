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
      admin_action_log: {
        Row: {
          action: string
          admin_id: string
          affected_user_id: string | null
          created_at: string
          details: Json | null
          id: string
        }
        Insert: {
          action: string
          admin_id: string
          affected_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
        }
        Update: {
          action?: string
          admin_id?: string
          affected_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      challenge_badge_thresholds: {
        Row: {
          bronze: number
          challenge_slug: string
          gold: number
          platinum: number
          silver: number
          updated_at: string
        }
        Insert: {
          bronze: number
          challenge_slug: string
          gold: number
          platinum: number
          silver: number
          updated_at?: string
        }
        Update: {
          bronze?: number
          challenge_slug?: string
          gold?: number
          platinum?: number
          silver?: number
          updated_at?: string
        }
        Relationships: []
      }
      challenge_of_the_week: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          week_start: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          week_start: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_of_the_week_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_results: {
        Row: {
          breakdown: Json
          category: string | null
          challenge_completed_at: string | null
          challenge_id: string
          challenge_name: string
          challenge_started_at: string | null
          conditions: string | null
          conditions_list: string[] | null
          created_at: string
          duration_minutes: number | null
          green_speed: string | null
          green_type: string | null
          id: string
          last_edited_at: string | null
          location: string | null
          notes: string | null
          played_at: string
          score: number
          session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          breakdown?: Json
          category?: string | null
          challenge_completed_at?: string | null
          challenge_id: string
          challenge_name: string
          challenge_started_at?: string | null
          conditions?: string | null
          conditions_list?: string[] | null
          created_at?: string
          duration_minutes?: number | null
          green_speed?: string | null
          green_type?: string | null
          id?: string
          last_edited_at?: string | null
          location?: string | null
          notes?: string | null
          played_at?: string
          score: number
          session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          breakdown?: Json
          category?: string | null
          challenge_completed_at?: string | null
          challenge_id?: string
          challenge_name?: string
          challenge_started_at?: string | null
          conditions?: string | null
          conditions_list?: string[] | null
          created_at?: string
          duration_minutes?: number | null
          green_speed?: string | null
          green_type?: string | null
          id?: string
          last_edited_at?: string | null
          location?: string | null
          notes?: string | null
          played_at?: string
          score?: number
          session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_results_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          allow_pause: boolean
          category: string
          config: Json
          created_at: string
          description: string | null
          id: string
          name: string
          rules: Json
          score_label: string
          setup: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          allow_pause?: boolean
          category: string
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          rules?: Json
          score_label?: string
          setup?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allow_pause?: boolean
          category?: string
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          rules?: Json
          score_label?: string
          setup?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      club_audit_log: {
        Row: {
          action: string
          changed_by: string
          club_id: string
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          changed_by: string
          club_id: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          changed_by?: string
          club_id?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "club_audit_log_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_branding: {
        Row: {
          accent_colour: string | null
          club_id: string
          logo_storage_path: string | null
          logo_url: string | null
          managed_branding_enabled: boolean
          primary_colour: string | null
          secondary_colour: string | null
          surface_colour: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accent_colour?: string | null
          club_id: string
          logo_storage_path?: string | null
          logo_url?: string | null
          managed_branding_enabled?: boolean
          primary_colour?: string | null
          secondary_colour?: string | null
          surface_colour?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accent_colour?: string | null
          club_id?: string
          logo_storage_path?: string | null
          logo_url?: string | null
          managed_branding_enabled?: boolean
          primary_colour?: string | null
          secondary_colour?: string | null
          surface_colour?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_branding_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_defaults: {
        Row: {
          allow_member_squad_opt_out: boolean
          auto_add_to_squad: boolean
          auto_assign_default_coach: boolean
          club_id: string
          default_coach_id: string | null
          default_squad_owner_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_member_squad_opt_out?: boolean
          auto_add_to_squad?: boolean
          auto_assign_default_coach?: boolean
          club_id: string
          default_coach_id?: string | null
          default_squad_owner_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_member_squad_opt_out?: boolean
          auto_add_to_squad?: boolean
          auto_assign_default_coach?: boolean
          club_id?: string
          default_coach_id?: string | null
          default_squad_owner_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_defaults_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_memberships: {
        Row: {
          auto_squad_opted_out: boolean
          club_id: string
          created_at: string
          id: string
          joined_at: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_squad_opted_out?: boolean
          club_id: string
          created_at?: string
          id?: string
          joined_at?: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_squad_opted_out?: boolean
          club_id?: string
          created_at?: string
          id?: string
          joined_at?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_memberships_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          join_code: string | null
          join_code_enabled: boolean
          name: string
          short_name: string | null
          slug: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          join_code?: string | null
          join_code_enabled?: boolean
          name: string
          short_name?: string | null
          slug: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          join_code?: string | null
          join_code_enabled?: boolean
          name?: string
          short_name?: string | null
          slug?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      coach_access: {
        Row: {
          accepted_at: string | null
          coach_id: string
          created_at: string
          declined_at: string | null
          id: string
          player_id: string
          requested_at: string
          revoked_at: string | null
          source: string | null
          source_club_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          coach_id: string
          created_at?: string
          declined_at?: string | null
          id?: string
          player_id: string
          requested_at?: string
          revoked_at?: string | null
          source?: string | null
          source_club_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          coach_id?: string
          created_at?: string
          declined_at?: string | null
          id?: string
          player_id?: string
          requested_at?: string
          revoked_at?: string | null
          source?: string | null
          source_club_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_access_source_club_id_fkey"
            columns: ["source_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_notes: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          note_text: string
          player_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          note_text: string
          player_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          note_text?: string
          player_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      drills: {
        Row: {
          bowls_per_end: number
          category: string | null
          created_at: string
          description: string | null
          id: string
          max_score: number
          min_score: number
          name: string
          scoring_config: Json
          setup: string | null
          slug: string
          sort_order: number
          weight: number
        }
        Insert: {
          bowls_per_end?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          max_score: number
          min_score: number
          name: string
          scoring_config?: Json
          setup?: string | null
          slug: string
          sort_order?: number
          weight?: number
        }
        Update: {
          bowls_per_end?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          max_score?: number
          min_score?: number
          name?: string
          scoring_config?: Json
          setup?: string | null
          slug?: string
          sort_order?: number
          weight?: number
        }
        Relationships: []
      }
      exercise_variants: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          difficulty: number
          exercise_id: string
          id: string
          name: string
          scoring_parameters: Json
          setup_parameters: Json
          slug: string
          sort_order: number
          tags: string[]
          target_skill: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          difficulty?: number
          exercise_id: string
          id?: string
          name: string
          scoring_parameters?: Json
          setup_parameters?: Json
          slug: string
          sort_order?: number
          tags?: string[]
          target_skill: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          difficulty?: number
          exercise_id?: string
          id?: string
          name?: string
          scoring_parameters?: Json
          setup_parameters?: Json
          slug?: string
          sort_order?: number
          tags?: string[]
          target_skill?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_variants_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "drills"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          android_install_sent_at: string | null
          club_id: string | null
          club_role: string | null
          created_at: string
          email: string
          expires_at: string
          full_name: string | null
          id: string
          invite_code: string
          invited_by: string | null
          ios_install_sent_at: string | null
          is_tester: boolean
          notes: string | null
          platforms: string[]
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          android_install_sent_at?: string | null
          club_id?: string | null
          club_role?: string | null
          created_at?: string
          email: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invite_code?: string
          invited_by?: string | null
          ios_install_sent_at?: string | null
          is_tester?: boolean
          notes?: string | null
          platforms?: string[]
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          android_install_sent_at?: string | null
          club_id?: string | null
          club_role?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invite_code?: string
          invited_by?: string | null
          ios_install_sent_at?: string | null
          is_tester?: boolean
          notes?: string | null
          platforms?: string[]
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_activities: {
        Row: {
          active_seconds: number
          active_seconds_original: number | null
          active_since: string | null
          bowls_delivered: number
          challenge_id: string | null
          challenge_result_id: string | null
          completed_at: string | null
          config: Json
          created_at: string
          discard_kept_stats: boolean | null
          discarded_at: string | null
          drill_id: string | null
          id: string
          kind: Database["public"]["Enums"]["practice_activity_kind"]
          last_active_at: string
          result_id: string | null
          slug: string | null
          started_at: string
          state: Json
          status: Database["public"]["Enums"]["practice_activity_status"]
          timing_repaired_at: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_seconds?: number
          active_seconds_original?: number | null
          active_since?: string | null
          bowls_delivered?: number
          challenge_id?: string | null
          challenge_result_id?: string | null
          completed_at?: string | null
          config?: Json
          created_at?: string
          discard_kept_stats?: boolean | null
          discarded_at?: string | null
          drill_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["practice_activity_kind"]
          last_active_at?: string
          result_id?: string | null
          slug?: string | null
          started_at?: string
          state?: Json
          status?: Database["public"]["Enums"]["practice_activity_status"]
          timing_repaired_at?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_seconds?: number
          active_seconds_original?: number | null
          active_since?: string | null
          bowls_delivered?: number
          challenge_id?: string | null
          challenge_result_id?: string | null
          completed_at?: string | null
          config?: Json
          created_at?: string
          discard_kept_stats?: boolean | null
          discarded_at?: string | null
          drill_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["practice_activity_kind"]
          last_active_at?: string
          result_id?: string | null
          slug?: string | null
          started_at?: string
          state?: Json
          status?: Database["public"]["Enums"]["practice_activity_status"]
          timing_repaired_at?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_activities_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_activities_challenge_result_id_fkey"
            columns: ["challenge_result_id"]
            isOneToOne: false
            referencedRelation: "challenge_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_activities_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_activities_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "results"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          club: string | null
          created_at: string
          default_club: string | null
          default_green: string | null
          default_green_type: string | null
          full_name: string | null
          id: string
          is_coach_plan_active: boolean
          is_premium_player: boolean
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          club?: string | null
          created_at?: string
          default_club?: string | null
          default_green?: string | null
          default_green_type?: string | null
          full_name?: string | null
          id: string
          is_coach_plan_active?: boolean
          is_premium_player?: boolean
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          club?: string | null
          created_at?: string
          default_club?: string | null
          default_green?: string | null
          default_green_type?: string | null
          full_name?: string | null
          id?: string
          is_coach_plan_active?: boolean
          is_premium_player?: boolean
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
      program_activities: {
        Row: {
          challenge_id: string | null
          coach_note: string | null
          created_at: string
          drill_id: string | null
          focus: string | null
          id: string
          kind: string
          meta: Json
          program_id: string
          required_completions: number
          sequence: number
          session_id: string
          target_score: number | null
          updated_at: string
        }
        Insert: {
          challenge_id?: string | null
          coach_note?: string | null
          created_at?: string
          drill_id?: string | null
          focus?: string | null
          id?: string
          kind: string
          meta?: Json
          program_id: string
          required_completions?: number
          sequence?: number
          session_id: string
          target_score?: number | null
          updated_at?: string
        }
        Update: {
          challenge_id?: string | null
          coach_note?: string | null
          created_at?: string
          drill_id?: string | null
          focus?: string | null
          id?: string
          kind?: string
          meta?: Json
          program_id?: string
          required_completions?: number
          sequence?: number
          session_id?: string
          target_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_activities_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_activities_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_activities_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_activities_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "program_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_activity_progress: {
        Row: {
          activity_id: string
          challenge_result_id: string | null
          completed_at: string | null
          completions: number
          created_at: string
          id: string
          launched_at: string | null
          player_id: string
          player_note: string | null
          program_id: string
          result_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          challenge_result_id?: string | null
          completed_at?: string | null
          completions?: number
          created_at?: string
          id?: string
          launched_at?: string | null
          player_id: string
          player_note?: string | null
          program_id: string
          result_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          challenge_result_id?: string | null
          completed_at?: string | null
          completions?: number
          created_at?: string
          id?: string
          launched_at?: string | null
          player_id?: string
          player_note?: string | null
          program_id?: string
          result_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_activity_progress_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "program_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_activity_progress_challenge_result_id_fkey"
            columns: ["challenge_result_id"]
            isOneToOne: false
            referencedRelation: "challenge_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_activity_progress_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_activity_progress_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "results"
            referencedColumns: ["id"]
          },
        ]
      }
      program_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          player_id: string
          program_id: string
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          player_id: string
          program_id: string
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          player_id?: string
          program_id?: string
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_sessions: {
        Row: {
          coach_note: string | null
          created_at: string
          id: string
          meta: Json
          objective: string | null
          phase: string | null
          program_id: string
          scheduled_date: string | null
          sequence: number
          title: string
          updated_at: string
          week_number: number | null
        }
        Insert: {
          coach_note?: string | null
          created_at?: string
          id?: string
          meta?: Json
          objective?: string | null
          phase?: string | null
          program_id: string
          scheduled_date?: string | null
          sequence?: number
          title: string
          updated_at?: string
          week_number?: number | null
        }
        Update: {
          coach_note?: string | null
          created_at?: string
          id?: string
          meta?: Json
          objective?: string | null
          phase?: string | null
          program_id?: string
          scheduled_date?: string | null
          sequence?: number
          title?: string
          updated_at?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "program_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          breakdown: Json
          bsi: number
          category: string | null
          conditions: string | null
          conditions_list: string[] | null
          created_at: string
          drill_completed_at: string | null
          drill_id: string
          drill_name: string | null
          drill_started_at: string | null
          duration_minutes: number | null
          green_speed: string | null
          green_type: string | null
          id: string
          last_edited_at: string | null
          location: string | null
          max_score: number | null
          min_score: number | null
          notes: string | null
          percentage: number | null
          played_at: string
          score: number
          session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          breakdown?: Json
          bsi: number
          category?: string | null
          conditions?: string | null
          conditions_list?: string[] | null
          created_at?: string
          drill_completed_at?: string | null
          drill_id: string
          drill_name?: string | null
          drill_started_at?: string | null
          duration_minutes?: number | null
          green_speed?: string | null
          green_type?: string | null
          id?: string
          last_edited_at?: string | null
          location?: string | null
          max_score?: number | null
          min_score?: number | null
          notes?: string | null
          percentage?: number | null
          played_at?: string
          score: number
          session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          breakdown?: Json
          bsi?: number
          category?: string | null
          conditions?: string | null
          conditions_list?: string[] | null
          created_at?: string
          drill_completed_at?: string | null
          drill_id?: string
          drill_name?: string | null
          drill_started_at?: string | null
          duration_minutes?: number | null
          green_speed?: string | null
          green_type?: string | null
          id?: string
          last_edited_at?: string | null
          location?: string | null
          max_score?: number | null
          min_score?: number | null
          notes?: string | null
          percentage?: number | null
          played_at?: string
          score?: number
          session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "results_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      squad_invites: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          responded_at: string | null
          status: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          responded_at?: string | null
          status?: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          responded_at?: string | null
          status?: string
          to_user_id?: string
        }
        Relationships: []
      }
      squad_members: {
        Row: {
          created_at: string
          member_user_id: string
          source: string | null
          source_club_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          member_user_id: string
          source?: string | null
          source_club_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          member_user_id?: string
          source?: string | null
          source_club_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_members_source_club_id_fkey"
            columns: ["source_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          related_challenge_id: string | null
          related_user_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          related_challenge_id?: string | null
          related_user_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          related_challenge_id?: string | null
          related_user_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      trainer_session_blocks: {
        Row: {
          block_type: string
          completed_at: string | null
          config: Json
          created_at: string
          exercise_id: string | null
          exercise_slug: string | null
          exercise_variant_id: string | null
          id: string
          percentage: number | null
          planned_ends: number | null
          planned_minutes: number
          reason: string | null
          result_id: string | null
          score: number | null
          sequence: number
          session_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["trainer_block_status"]
          target_skill: string | null
          title: string
          updated_at: string
          user_id: string
          variant_slug: string | null
        }
        Insert: {
          block_type?: string
          completed_at?: string | null
          config?: Json
          created_at?: string
          exercise_id?: string | null
          exercise_slug?: string | null
          exercise_variant_id?: string | null
          id?: string
          percentage?: number | null
          planned_ends?: number | null
          planned_minutes?: number
          reason?: string | null
          result_id?: string | null
          score?: number | null
          sequence: number
          session_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["trainer_block_status"]
          target_skill?: string | null
          title: string
          updated_at?: string
          user_id: string
          variant_slug?: string | null
        }
        Update: {
          block_type?: string
          completed_at?: string | null
          config?: Json
          created_at?: string
          exercise_id?: string | null
          exercise_slug?: string | null
          exercise_variant_id?: string | null
          id?: string
          percentage?: number | null
          planned_ends?: number | null
          planned_minutes?: number
          reason?: string | null
          result_id?: string | null
          score?: number | null
          sequence?: number
          session_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["trainer_block_status"]
          target_skill?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          variant_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainer_session_blocks_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "drills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_session_blocks_exercise_variant_id_fkey"
            columns: ["exercise_variant_id"]
            isOneToOne: false
            referencedRelation: "exercise_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_session_blocks_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_session_blocks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "trainer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_sessions: {
        Row: {
          completed_at: string | null
          completed_blocks: number
          created_at: string
          current_block: number
          focus_areas: string[]
          generated_at: string
          id: string
          meta: Json
          planned_minutes: number
          started_at: string | null
          status: Database["public"]["Enums"]["trainer_session_status"]
          total_blocks: number
          training_session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_blocks?: number
          created_at?: string
          current_block?: number
          focus_areas?: string[]
          generated_at?: string
          id?: string
          meta?: Json
          planned_minutes?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["trainer_session_status"]
          total_blocks?: number
          training_session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_blocks?: number
          created_at?: string
          current_block?: number
          focus_areas?: string[]
          generated_at?: string
          id?: string
          meta?: Json
          planned_minutes?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["trainer_session_status"]
          total_blocks?: number
          training_session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_sessions_training_session_id_fkey"
            columns: ["training_session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_goals: {
        Row: {
          created_at: string
          effective_from: string
          focus_areas: string[]
          id: string
          min_training_days: number | null
          playing_position: string | null
          reminders_enabled: boolean
          updated_at: string
          user_id: string
          weekly_minutes: number | null
        }
        Insert: {
          created_at?: string
          effective_from?: string
          focus_areas?: string[]
          id?: string
          min_training_days?: number | null
          playing_position?: string | null
          reminders_enabled?: boolean
          updated_at?: string
          user_id: string
          weekly_minutes?: number | null
        }
        Update: {
          created_at?: string
          effective_from?: string
          focus_areas?: string[]
          id?: string
          min_training_days?: number | null
          playing_position?: string | null
          reminders_enabled?: boolean
          updated_at?: string
          user_id?: string
          weekly_minutes?: number | null
        }
        Relationships: []
      }
      training_programs: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          program_type: string
          settings: Json
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          program_type?: string
          settings?: Json
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          program_type?: string
          settings?: Json
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_sessions: {
        Row: {
          category_breakdown: Json
          challenges_completed: number
          club: string | null
          conditions: string[] | null
          created_at: string
          drills_completed: number
          green: string | null
          green_type: string | null
          id: string
          notes: string | null
          paused_at: string | null
          session_ended_at: string | null
          session_started_at: string
          status: string
          total_activities: number
          total_duration_minutes: number | null
          total_paused_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category_breakdown?: Json
          challenges_completed?: number
          club?: string | null
          conditions?: string[] | null
          created_at?: string
          drills_completed?: number
          green?: string | null
          green_type?: string | null
          id?: string
          notes?: string | null
          paused_at?: string | null
          session_ended_at?: string | null
          session_started_at?: string
          status?: string
          total_activities?: number
          total_duration_minutes?: number | null
          total_paused_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category_breakdown?: Json
          challenges_completed?: number
          club?: string | null
          conditions?: string[] | null
          created_at?: string
          drills_completed?: number
          green?: string | null
          green_type?: string | null
          id?: string
          notes?: string | null
          paused_at?: string | null
          session_ended_at?: string | null
          session_started_at?: string
          status?: string
          total_activities?: number
          total_duration_minutes?: number | null
          total_paused_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_action_log: {
        Row: {
          account_email: string | null
          action: string
          created_at: string
          details: Json | null
          id: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_club_membership: {
        Args: { _club_id: string; _club_role?: string; _user_id: string }
        Returns: string
      }
      admin_add_club_member: {
        Args: { _club_id: string; _club_role?: string; _email: string }
        Returns: {
          is_new_account: boolean
          membership_id: string
          user_id: string
        }[]
      }
      admin_change_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_get_user: {
        Args: { _user_id: string }
        Returns: {
          club: string
          created_at: string
          email: string
          full_name: string
          id: string
          last_sign_in_at: string
          roles: Database["public"]["Enums"]["app_role"][]
          status: Database["public"]["Enums"]["user_status"]
        }[]
      }
      admin_invitation_stats: {
        Args: never
        Returns: {
          expired: number
          pending: number
          revoked: number
          sent: number
          used: number
        }[]
      }
      admin_list_clubs: {
        Args: never
        Returns: {
          accent_colour: string
          allow_member_squad_opt_out: boolean
          auto_add_to_squad: boolean
          auto_assign_default_coach: boolean
          default_coach_id: string
          default_squad_owner_id: string
          description: string
          id: string
          join_code: string
          join_code_enabled: boolean
          logo_url: string
          managed_branding_enabled: boolean
          member_count: number
          name: string
          primary_colour: string
          secondary_colour: string
          short_name: string
          slug: string
          surface_colour: string
          website: string
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          club: string
          created_at: string
          email: string
          full_name: string
          id: string
          last_sign_in_at: string
          roles: Database["public"]["Enums"]["app_role"][]
          status: Database["public"]["Enums"]["user_status"]
        }[]
      }
      admin_mark_install_sent: {
        Args: { _invitation_id: string; _platform: string; _sent?: boolean }
        Returns: undefined
      }
      admin_remove_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_set_club_branding: {
        Args: {
          _accent?: string
          _club_id: string
          _enabled: boolean
          _logo_storage_path?: string
          _logo_url?: string
          _primary?: string
          _secondary?: string
          _surface?: string
        }
        Returns: undefined
      }
      admin_set_club_defaults: {
        Args: {
          _allow_member_squad_opt_out?: boolean
          _auto_add_to_squad?: boolean
          _auto_assign_default_coach?: boolean
          _club_id: string
          _default_coach_id?: string
          _default_squad_owner_id?: string
        }
        Returns: undefined
      }
      admin_set_club_join_code: {
        Args: { _club_id: string; _code: string; _enabled?: boolean }
        Returns: undefined
      }
      admin_set_tester_platforms: {
        Args: { _invitation_id: string; _platforms: string[] }
        Returns: undefined
      }
      admin_set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_set_user_status: {
        Args: {
          _reason?: string
          _status: Database["public"]["Enums"]["user_status"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_tester_directory: {
        Args: never
        Returns: {
          account_status: string
          android_install_sent_at: string
          created_at: string
          email: string
          expires_at: string
          full_name: string
          invitation_id: string
          invitation_status: Database["public"]["Enums"]["invitation_status"]
          invite_code: string
          ios_install_sent_at: string
          is_tester: boolean
          last_sign_in_at: string
          notes: string
          platforms: string[]
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      admin_upsert_club: {
        Args: {
          _description?: string
          _id: string
          _name: string
          _short_name?: string
          _slug: string
          _website?: string
        }
        Returns: string
      }
      admin_upsert_tester: {
        Args: {
          _email: string
          _full_name?: string
          _notes?: string
          _platforms?: string[]
          _role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: {
          email: string
          invitation_id: string
          invite_code: string
          needs_registration: boolean
          outcome: string
          platforms: string[]
          user_id: string
        }[]
      }
      admin_user_stats: {
        Args: never
        Returns: {
          active: number
          admins: number
          coaches: number
          deleted: number
          invitations_pending: number
          new_this_month: number
          suspended: number
          total: number
        }[]
      }
      apply_club_member_defaults: {
        Args: { _club_id: string; _user_id: string }
        Returns: undefined
      }
      badge_points_for: {
        Args: { _score: number; _slug: string }
        Returns: number
      }
      block_squad_user: { Args: { _target: string }; Returns: undefined }
      can_view_program: {
        Args: { _program_id: string; _user_id: string }
        Returns: boolean
      }
      cancel_squad_invite: { Args: { _invite_id: string }; Returns: undefined }
      challenge_squad_leaderboard: {
        Args: { _challenge_id: string }
        Returns: {
          best_score: number
          club: string
          date_achieved: string
          full_name: string
          is_self: boolean
          user_id: string
        }[]
      }
      club_admin_cancel_invitation: {
        Args: { _invitation_id: string }
        Returns: undefined
      }
      club_admin_invite_member: {
        Args: { _club_id: string; _email: string }
        Returns: {
          is_new_account: boolean
          user_id: string
        }[]
      }
      club_admin_list_invitations: {
        Args: { _club_id: string }
        Returns: {
          created_at: string
          email: string
          expires_at: string
          id: string
          status: Database["public"]["Enums"]["invitation_status"]
        }[]
      }
      club_admin_list_members: {
        Args: { _club_id: string }
        Returns: {
          email: string
          full_name: string
          joined_at: string
          role: string
          status: string
          user_id: string
        }[]
      }
      club_admin_my_clubs: {
        Args: never
        Returns: {
          id: string
          join_code: string
          join_code_enabled: boolean
          member_count: number
          name: string
          short_name: string
          slug: string
        }[]
      }
      club_admin_remove_member: {
        Args: { _club_id: string; _user_id: string }
        Returns: undefined
      }
      coach_get_player_challenge_results: {
        Args: { _player_id: string }
        Returns: {
          breakdown: Json
          category: string | null
          challenge_completed_at: string | null
          challenge_id: string
          challenge_name: string
          challenge_started_at: string | null
          conditions: string | null
          conditions_list: string[] | null
          created_at: string
          duration_minutes: number | null
          green_speed: string | null
          green_type: string | null
          id: string
          last_edited_at: string | null
          location: string | null
          notes: string | null
          played_at: string
          score: number
          session_id: string | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "challenge_results"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      coach_get_player_results: {
        Args: { _player_id: string }
        Returns: {
          breakdown: Json
          bsi: number
          category: string | null
          conditions: string | null
          conditions_list: string[] | null
          created_at: string
          drill_completed_at: string | null
          drill_id: string
          drill_name: string | null
          drill_started_at: string | null
          duration_minutes: number | null
          green_speed: string | null
          green_type: string | null
          id: string
          last_edited_at: string | null
          location: string | null
          max_score: number | null
          min_score: number | null
          notes: string | null
          percentage: number | null
          played_at: string
          score: number
          session_id: string | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "results"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      coach_get_player_sessions: {
        Args: { _player_id: string }
        Returns: {
          category_breakdown: Json
          challenges_completed: number
          club: string | null
          conditions: string[] | null
          created_at: string
          drills_completed: number
          green: string | null
          green_type: string | null
          id: string
          notes: string | null
          paused_at: string | null
          session_ended_at: string | null
          session_started_at: string
          status: string
          total_activities: number
          total_duration_minutes: number | null
          total_paused_seconds: number
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "training_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      coach_list_pending_requests: {
        Args: never
        Returns: {
          id: string
          player_email: string
          player_id: string
          requested_at: string
        }[]
      }
      coach_list_players: {
        Args: never
        Returns: {
          accepted_at: string
          club: string
          full_name: string
          player_email: string
          player_id: string
        }[]
      }
      coach_respond_access_request: {
        Args: { _accept: boolean; _request_id: string }
        Returns: {
          accepted_at: string | null
          coach_id: string
          created_at: string
          declined_at: string | null
          id: string
          player_id: string
          requested_at: string
          revoked_at: string | null
          source: string | null
          source_club_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "coach_access"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_invitation: { Args: { _code: string }; Returns: undefined }
      current_challenge_of_the_week: {
        Args: never
        Returns: {
          challenge_id: string
          challenge_name: string
          challenge_slug: string
          week_start: string
        }[]
      }
      current_season: {
        Args: never
        Returns: {
          end_date: string
          quarter: number
          season_year: number
          start_date: string
        }[]
      }
      delete_my_challenge_result: {
        Args: { _result_id: string }
        Returns: undefined
      }
      delete_my_result: { Args: { _result_id: string }; Returns: undefined }
      delete_my_training_session: {
        Args: { _session_id: string }
        Returns: undefined
      }
      erase_my_history: { Args: never; Returns: undefined }
      find_coach_by_email: {
        Args: { _email: string }
        Returns: {
          coach_email: string
          coach_id: string
          full_name: string
        }[]
      }
      ghost_target: {
        Args: { _challenge_id: string; _user_id: string }
        Returns: {
          best_score: number
          full_name: string
          is_survival: boolean
          user_id: string
        }[]
      }
      has_accepted_access: {
        Args: { _coach: string; _player: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      head_to_head: {
        Args: { _other: string }
        Returns: {
          challenge_id: string
          challenge_name: string
          challenge_slug: string
          my_best: number
          my_plays: number
          other_best: number
          other_plays: number
        }[]
      }
      head_to_head_summary: {
        Args: { _other: string }
        Returns: {
          my_bsi: number
          my_champ_position: number
          my_favourite: string
          my_pb_count: number
          my_wins: number
          other_bsi: number
          other_champ_position: number
          other_favourite: string
          other_pb_count: number
          other_wins: number
        }[]
      }
      is_club_admin: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_program_player: {
        Args: { _program_id: string; _user_id: string }
        Returns: boolean
      }
      join_club_with_code: {
        Args: { _code: string }
        Returns: {
          already_member: boolean
          club_id: string
          club_name: string
        }[]
      }
      list_my_squad: {
        Args: never
        Returns: {
          club: string
          current_bsi: number
          full_name: string
          last_active: string
          member_since: string
          member_user_id: string
          personal_best_count: number
        }[]
      }
      list_squad_invites: {
        Args: never
        Returns: {
          created_at: string
          direction: string
          id: string
          other_club: string
          other_name: string
          other_user_id: string
          status: string
        }[]
      }
      list_squad_notifications: {
        Args: { _limit?: number }
        Returns: {
          created_at: string
          id: string
          message: string
          read: boolean
          related_challenge_id: string | null
          related_user_id: string | null
          type: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "squad_notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mark_squad_notifications_read: { Args: never; Returns: undefined }
      member_opt_out_club_squad: {
        Args: { _club_id: string }
        Returns: undefined
      }
      my_clubs: {
        Args: never
        Returns: {
          accent_colour: string
          id: string
          logo_url: string
          managed_branding_enabled: boolean
          name: string
          primary_colour: string
          role: string
          secondary_colour: string
          short_name: string
          slug: string
          status: string
          surface_colour: string
        }[]
      }
      my_coach_list: {
        Args: never
        Returns: {
          coach_email: string
          coach_id: string
          id: string
          requested_at: string
          status: string
        }[]
      }
      my_squad_stats: {
        Args: never
        Returns: {
          challenges_led: number
          cow_wins: number
          my_points: number
          my_rank: number
          squad_size: number
          top3_finishes: number
        }[]
      }
      pick_challenge_of_the_week: { Args: never; Returns: string }
      program_owner: { Args: { _program_id: string }; Returns: string }
      remove_squad_member: { Args: { _member: string }; Returns: undefined }
      request_coach_access: {
        Args: { _coach_email: string }
        Returns: {
          accepted_at: string | null
          coach_id: string
          created_at: string
          declined_at: string | null
          id: string
          player_id: string
          requested_at: string
          revoked_at: string | null
          source: string | null
          source_club_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "coach_access"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_squad_invite: {
        Args: { _accept: boolean; _invite_id: string }
        Returns: undefined
      }
      search_squad_candidates: {
        Args: { _query: string }
        Returns: {
          club: string
          full_name: string
          invite_status: string
          user_id: string
        }[]
      }
      send_squad_invite: {
        Args: { _to_user: string }
        Returns: {
          created_at: string
          from_user_id: string
          id: string
          responded_at: string | null
          status: string
          to_user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "squad_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      squad_championship_leaderboard: {
        Args: never
        Returns: {
          badge_points: number
          club: string
          cow_wins: number
          full_name: string
          is_self: boolean
          pb_points: number
          total_points: number
          user_id: string
        }[]
      }
      squad_extra_records: {
        Args: never
        Returns: {
          category: string
          holder_name: string
          holder_user_id: string
          meta: string
          value: number
        }[]
      }
      squad_meaningful_activity: {
        Args: { _limit?: number }
        Returns: {
          challenge_id: string
          challenge_name: string
          event_type: string
          full_name: string
          occurred_at: string
          score: number
          user_id: string
        }[]
      }
      squad_rank_for: { Args: { _challenge_id: string }; Returns: number }
      squad_recent_activity: {
        Args: { _limit?: number }
        Returns: {
          activity_id: string
          activity_type: string
          bsi: number
          full_name: string
          played_at: string
          score: number
          title: string
          user_id: string
        }[]
      }
      squad_records: {
        Args: never
        Returns: {
          best_score: number
          challenge_id: string
          challenge_name: string
          challenge_slug: string
          date_achieved: string
          holder_name: string
          holder_user_id: string
          is_self: boolean
        }[]
      }
      unblock_squad_user: { Args: { _target: string }; Returns: undefined }
      unread_squad_notifications_count: { Args: never; Returns: number }
      validate_club_code: {
        Args: { _code: string }
        Returns: {
          club_id: string
          club_name: string
          reason: string
          valid: boolean
        }[]
      }
      validate_invitation: {
        Args: { _code: string }
        Returns: {
          email: string
          reason: string
          role: Database["public"]["Enums"]["app_role"]
          valid: boolean
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "player" | "coach"
      invitation_status: "pending" | "used" | "expired" | "revoked"
      practice_activity_kind: "drill" | "challenge"
      practice_activity_status: "active" | "paused" | "completed" | "discarded"
      trainer_block_status: "pending" | "active" | "completed" | "skipped"
      trainer_session_status:
        | "planned"
        | "in_progress"
        | "completed"
        | "abandoned"
      user_status: "active" | "suspended" | "deleted"
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
      app_role: ["admin", "player", "coach"],
      invitation_status: ["pending", "used", "expired", "revoked"],
      practice_activity_kind: ["drill", "challenge"],
      practice_activity_status: ["active", "paused", "completed", "discarded"],
      trainer_block_status: ["pending", "active", "completed", "skipped"],
      trainer_session_status: [
        "planned",
        "in_progress",
        "completed",
        "abandoned",
      ],
      user_status: ["active", "suspended", "deleted"],
    },
  },
} as const
