
REVOKE EXECUTE ON FUNCTION public.find_coach_by_email(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_coach_access(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coach_list_players() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coach_get_player_results(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coach_get_player_challenge_results(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coach_get_player_sessions(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_remove_user_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_accepted_access(UUID, UUID) FROM PUBLIC, anon;
