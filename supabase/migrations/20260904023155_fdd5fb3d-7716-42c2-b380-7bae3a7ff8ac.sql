REVOKE EXECUTE ON FUNCTION public.admin_upsert_tester(text, text, app_role, text[], text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_tester_platforms(uuid, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_install_sent(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_tester_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_tester(text, text, app_role, text[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_tester_platforms(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_install_sent(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_tester_directory() TO authenticated, service_role;