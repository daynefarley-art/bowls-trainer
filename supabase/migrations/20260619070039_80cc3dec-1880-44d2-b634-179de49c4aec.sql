REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_user(uuid) FROM PUBLIC, anon, authenticated;