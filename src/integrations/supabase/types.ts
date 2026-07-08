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
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invite_code: string
          invited_by: string | null
          notes: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invite_code?: string
          invited_by?: string | null
          notes?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invite_code?: string
          invited_by?: string | null
          notes?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
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
          user_id: string
        }
        Insert: {
          created_at?: string
          member_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          member_user_id?: string
          user_id?: string
        }
        Relationships: []
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
      admin_remove_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
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
      badge_points_for: {
        Args: { _score: number; _slug: string }
        Returns: number
      }
      block_squad_user: { Args: { _target: string }; Returns: undefined }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      user_status: ["active", "suspended", "deleted"],
    },
  },
} as const
