
-- has_role must remain callable by anon because RLS policies on tables exposed to
-- anon (none currently, but kept defensively) call it during policy evaluation.

REVOKE EXECUTE ON FUNCTION public.admin_change_user_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_invitation_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_status(uuid, public.user_status, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_user_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.erase_my_history() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_coach_list() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_change_user_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_invitation_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, public.user_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_invitation(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erase_my_history() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_invitation(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_coach_list() TO authenticated, service_role;
